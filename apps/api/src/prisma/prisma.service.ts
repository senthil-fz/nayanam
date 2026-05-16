import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getContext } from '../common/context';
import { Errors } from '../common/errors';

/**
 * Models whose rows carry `householdId` and must be scoped to the current
 * household context on every read/write. Each `find*`/`update*`/`delete*`/
 * `count`/`aggregate`/`groupBy` call has `householdId = ctx.householdId`
 * AND-injected into `args.where`; each `create`/`createMany`/`upsert.create`
 * has `householdId = ctx.householdId` injected into `args.data`.
 *
 * Models deliberately EXCLUDED from this set:
 *   - HouseholdMember  → resolver: it's the user↔household mapping itself,
 *     and the lookup is HOW we resolve `householdId` in the first place.
 *     Services that touch memberships enforce scoping explicitly.
 *   - Notification     → user-scoped, not household-scoped (notifications
 *     belong to a `userId`).
 *   - Household        → IS the tenant; not "owned by" a tenant.
 *   - IdempotencyKey   → user-scoped (`(userId, key)` PK).
 *   - User / Session / EmailChangeRequest / NotificationToken / FeatureFlag
 *     → user-scoped or global; never household-tenanted.
 */
export const HOUSEHOLD_SCOPED_MODELS = new Set<string>([
  'HouseholdInvite',
  // NOTE (parity / Finding 6): 'Event' is listed here so that future Prisma
  // delegate reads (e.g. an activity-feed endpoint) are automatically scoped.
  // HOWEVER, every current Event write is a raw `$executeRaw` INSERT that
  // bypasses the `$extends` extension — the entry currently enforces nothing on
  // writes. Write via raw SQL is intentional (events are emitted inside domain
  // $transactions with explicit household_id). If you add a read endpoint backed
  // by `prisma.event.findMany`, the extension will scope it correctly. Never add
  // an Event write via the Prisma delegate without verifying it carries the
  // correct `householdId` from the request context.
  'Event',
  'Account',
  'Category',
  'Transaction',
  'Transfer',
  'Bill',
  'BillPayment',
  'Budget',
  'BudgetThresholdNotification',
  'Attachment',
  'Loan',
  'LoanLumpSum',
]);

/**
 * Models whose `householdId` column is NULLABLE: a NULL row is a system-level
 * row visible to every tenant. The extension does NOT auto-inject
 * `householdId` on these — services compose
 * `{ OR: [{ householdId: ctx }, { householdId: null }] }` themselves so
 * that system rows remain visible. Cross-tenant guards still apply: if a
 * caller passes an explicit `householdId` it must match `ctx.householdId`.
 */
export const HOUSEHOLD_NULLABLE_TENANT_MODELS = new Set<string>([
  'Category',
]);

// Models intentionally excluded from soft-delete (hard-deleted by design):
// - HouseholdMember: membership mapping; cascade-deleted when household is archived
// - HouseholdInvite: consumed one-time tokens; expired ones are purged
// - OtpCode: consumed one-time tokens
// - WeeklySummarySend: idempotency log, no restore needed

/**
 * Models that use soft-delete via `deletedAt`. Reads default-filter to
 * `deletedAt IS NULL` unless the caller explicitly references `deletedAt`
 * in the `where` clause (e.g. for a restore path).
 */
export const SOFT_DELETE_MODELS = new Set<string>([
  'Household',
  'Account',
  'Category',
  'Transaction',
  'Transfer',
  'Bill',
  'BillPayment',
  'Budget',
  'Attachment',
  'Notification',
  'Loan',
  'LoanLumpSum',
]);

/** Read ops where `args.where` should be scope-AND-injected. */
const SCOPED_READ_OPS = new Set<string>([
  'findMany',
  'findFirst',
  'findUnique',
  'findFirstOrThrow',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

/** Mutating ops where `args.where` should be scope-AND-injected. */
const SCOPED_WRITE_WHERE_OPS = new Set<string>([
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

/** Create ops where `args.data` should carry `householdId`. */
const SCOPED_CREATE_OPS = new Set<string>([
  'create',
  'createMany',
  'createManyAndReturn',
]);

/**
 * Per-async-flow flag: when set, the extension skips scope enforcement so
 * scheduler / cron jobs can read across households via `crossTenant(...)`.
 */
const crossTenantFlag = new AsyncLocalStorage<{ reason: string }>();

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;
  // The extended client built in `onModuleInit`. All delegate access on this
  // service is proxied to this client so that every Prisma operation —
  // including those issued inside `$transaction(async tx => …)` — flows
  // through the scope-enforcement extension.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extended!: any;

  constructor(private readonly config: ConfigService) {
    const connectionString = config.getOrThrow<string>('DATABASE_URL');
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    super({ adapter, log: ['warn', 'error'] });
    this.pool = pool;
    // Build the $extends client eagerly. `$extends` does not require an open
    // connection. Done in the constructor (rather than `onModuleInit`) so the
    // delegate proxy can be installed by `PrismaService.create()` before the
    // instance is handed to the DI container.
    this.extended = this.buildExtendedClient();
  }

  /**
   * Factory that wires up the constructor + delegate proxy. The Nest module
   * uses this so every consumer receives the proxied instance and goes
   * through the $extends pipeline by default.
   */
  static create(config: ConfigService): PrismaService {
    const inst = new PrismaService(config);
    return inst.installDelegateProxy();
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log(
      `Installed scope guards via $extends: household=${HOUSEHOLD_SCOPED_MODELS.size} soft-delete=${SOFT_DELETE_MODELS.size}`,
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end().catch(() => {
      /* pool may already be closed */
    });
  }

  /**
   * The ONE named, audited bypass of household scoping. Schedulers and other
   * cross-tenant batch jobs MUST call this with a stable `reason` string
   * (e.g. `"scheduler:bill-reminders"`). Inside the callback, the extension
   * skips the household-scope assertions; soft-delete filtering still applies.
   *
   * The raw, NON-extended `PrismaClient` is passed in so the caller cannot
   * accidentally re-trip the extension by reusing `this.prisma`. It is the
   * only public path that returns a non-scoped client.
   */
  async crossTenant<T>(
    reason: string,
    fn: (raw: PrismaClient) => Promise<T>,
  ): Promise<T> {
    this.logger.debug({
      msg: 'crossTenant.invoked',
      reason,
    });
    return crossTenantFlag.run({ reason }, () => fn(this as PrismaClient));
  }

  /**
   * Build the `$extends` query hook. This is the single source of truth for
   * household scoping; it runs for every model on every operation, including
   * inside `$transaction(async tx => …)` because Prisma's extension framework
   * propagates extensions to the transaction client.
   */
  private buildExtendedClient() {
    return this.$extends({
      name: 'household-scope',
      query: {
        $allModels: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async $allOperations({ model, operation, args, query }: any) {
            const inCrossTenant = crossTenantFlag.getStore() !== undefined;
            const householdScoped = HOUSEHOLD_SCOPED_MODELS.has(model);
            const nullableTenant =
              HOUSEHOLD_NULLABLE_TENANT_MODELS.has(model);
            const softDelete = SOFT_DELETE_MODELS.has(model);

            // 1) Soft-delete default filter on reads.
            if (softDelete && SCOPED_READ_OPS.has(operation)) {
              args = applySoftDeleteFilter(args);
            }

            // 2) Household scope. Skipped entirely inside crossTenant().
            if (householdScoped && !inCrossTenant) {
              const ctx = getContext();
              const ctxHh = ctx?.householdId;

              if (SCOPED_READ_OPS.has(operation)) {
                args = enforceWhereScope({
                  model,
                  operation,
                  args,
                  ctxHh,
                  nullableTenant,
                });
                // Post-query ownership assertion for findUnique / findUniqueOrThrow:
                // these ops cannot have householdId injected into the where clause
                // (Prisma rejects extra fields on unique lookups), so we assert
                // ownership on the returned row instead.
                //
                // Security fix (Finding 4): injectAndAssertFindUnique merges
                // `householdId: true` into the select (if a narrow select is present)
                // before executing the query, asserts, then strips the field if the
                // caller didn't originally request it. This prevents a silent bypass
                // where `select: { id: true }` caused `rowHh === undefined` and the
                // old `typeof rowHh === 'string'` guard to pass vacuously.
                if (
                  operation === 'findUnique' ||
                  operation === 'findUniqueOrThrow'
                ) {
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                  return injectAndAssertFindUnique(args as AnyArgs | undefined, ctxHh, householdScoped, query);
                }
              } else if (SCOPED_WRITE_WHERE_OPS.has(operation)) {
                args = enforceWhereScope({
                  model,
                  operation,
                  args,
                  ctxHh,
                  nullableTenant,
                });
              } else if (SCOPED_CREATE_OPS.has(operation)) {
                args = enforceCreateScope({
                  model,
                  operation,
                  args,
                  ctxHh,
                });
              } else if (operation === 'upsert') {
                args = enforceUpsertScope({
                  model,
                  args,
                  ctxHh,
                  nullableTenant,
                });
              }
            }

            return query(args);
          },
        },
      },
    });
  }

  /**
   * Wrap `this` in a Proxy so that any property access that resolves to a
   * Prisma delegate (lower-camel model names) or to `$transaction` is served
   * by the EXTENDED client. Other accesses (`$connect`, `$disconnect`,
   * `crossTenant`, `pool`, etc.) fall through to the real PrismaService
   * instance. This keeps existing call-sites (`this.prisma.account.findMany`,
   * `this.prisma.$transaction(...)`) working without a sweeping rename.
   */
  private installDelegateProxy(): this {
    const proxy = new Proxy(this, {
      get(self, prop) {
        // Forward $transaction and every model delegate to the extended
        // client so the extension fires inside transactions. Note that
        // `$transaction` MUST come from the extended client; if it came
        // from the raw client, the `tx` argument passed to the callback
        // would not have the extension installed.
        if (
          typeof prop === 'string' &&
          (prop === '$transaction' || isLowerCamelModelDelegate(prop, self))
        ) {
          const ext = self.extended;
          const v = ext?.[prop];
          return typeof v === 'function' ? v.bind(ext) : v;
        }
        // Everything else — `$connect`, `$disconnect`, `$queryRaw`,
        // `onModuleInit`, `onModuleDestroy`, `crossTenant`, `pool`, ... —
        // routes to the underlying instance, with `this` rebound so
        // PrismaClient internals see the real client (not the proxy).
        const v = Reflect.get(self, prop, self);
        return typeof v === 'function' ? v.bind(self) : v;
      },
    });
    return proxy as this;
  }
}

function isLowerCamelModelDelegate(prop: string, client: PrismaClient): boolean {
  if (prop.startsWith('$') || prop.startsWith('_')) return false;
  // Heuristic: Prisma auto-generates a delegate per model on the client.
  // Treat any non-underscore property that exists on the raw client as a
  // candidate delegate. Lifecycle methods are filtered above.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as any)[prop] !== undefined && typeof (client as any)[prop] === 'object';
}

// ---------- pure helpers ----------

type AnyArgs = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
} & Record<string, unknown>;

/**
 * Executes a findUnique/findUniqueOrThrow query with a guaranteed
 * `householdId` ownership assertion that works even when the caller passed a
 * narrow `select` that omits `householdId`.
 *
 * Strategy (Finding 4 fix):
 *  1. If `args.select` is present but does NOT include `householdId`, inject
 *     `householdId: true` before executing so the DB always returns the field.
 *  2. Assert: if the row is non-null and `householdId` is not a string (i.e.
 *     the model doesn't carry it, or some anomaly occurred), throw a scope
 *     violation rather than silently passing (fail-closed).
 *  3. Strip the injected `householdId` from the result if the caller didn't
 *     ask for it, preserving the caller's type contract.
 *
 * This replaces the old `typeof rowHh === 'string'` guard which silently
 * passed when `rowHh === undefined` (narrow select omitting the field).
 */
export async function injectAndAssertFindUnique(
  args: AnyArgs | undefined,
  ctxHh: string | undefined,
  householdScoped: boolean,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: (args: unknown) => Promise<any>,
): Promise<unknown> {
  // Determine whether caller used a narrow select without householdId.
  const callerSelect =
    args &&
    typeof args === 'object' &&
    'select' in args &&
    args.select &&
    typeof args.select === 'object'
      ? (args.select as Record<string, unknown>)
      : null;
  const needsInjection = callerSelect !== null && !callerSelect.householdId;

  const queryArgs = needsInjection
    ? { ...args, select: { ...callerSelect, householdId: true } }
    : args;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const result = await query(queryArgs);

  if (
    result !== null &&
    result !== undefined &&
    typeof result === 'object' &&
    householdScoped
  ) {
    const rowHh = (result as Record<string, unknown>).householdId;
    // Hard-fail: if householdId is absent (we injected it above for narrow
    // selects, so absence means the model truly lacks the column), treat it
    // as a scope violation rather than silently passing.
    if (typeof rowHh !== 'string') {
      throw Errors.householdScopeViolation();
    }
    if (rowHh !== ctxHh) {
      throw Errors.householdScopeViolation();
    }

    // Strip the injected householdId if caller didn't request it.
    if (needsInjection) {
      const stripped = { ...(result as Record<string, unknown>) };
      delete stripped.householdId;
      return stripped;
    }
  }

  return result as unknown;
}

function applySoftDeleteFilter(args: AnyArgs | undefined): AnyArgs {
  const next: AnyArgs = { ...(args ?? {}) };
  const where = { ...(next.where ?? {}) };
  if (!('deletedAt' in where) && !hasNestedKey(where, 'deletedAt')) {
    where.deletedAt = null;
  }
  next.where = where;
  return next;
}

function hasNestedKey(where: Record<string, unknown>, key: string): boolean {
  // CONTRACT (one-level only): this function deliberately inspects only one
  // level into AND/OR/NOT. All current restore paths use a flat structure:
  //   { AND: [{ deletedAt: { not: null } }, …] }
  // or set deletedAt directly at the top level.
  //
  // IMPORTANT for restore-path authors: if you nest deletedAt more than one
  // level deep (e.g. { AND: [{ OR: [{ deletedAt: { not: null } }] }] }) this
  // function will NOT detect it and the soft-delete default filter
  // `deletedAt IS NULL` will be ANDed on top, producing zero rows (the
  // predicate self-contradicts). Always keep your deletedAt opt-out at the
  // immediate child level of AND/OR/NOT or at the top-level where clause.
  // Recursive traversal was considered and rejected: no current caller needs
  // it and the one-level contract is easy to verify and maintain.
  for (const k of ['AND', 'OR', 'NOT'] as const) {
    const v = where[k];
    if (Array.isArray(v) && v.some((c) => c && typeof c === 'object' && key in c)) {
      return true;
    }
    if (v && typeof v === 'object' && !Array.isArray(v) && key in v) {
      return true;
    }
  }
  return false;
}

function enforceWhereScope(opts: {
  model: string;
  operation: string;
  args: AnyArgs | undefined;
  ctxHh: string | undefined;
  nullableTenant: boolean;
}): AnyArgs {
  const { ctxHh, nullableTenant, args, operation } = opts;

  if (!ctxHh) {
    // No request context AND not inside crossTenant — refuse.
    throw Errors.householdScopeViolation();
  }

  const next: AnyArgs = { ...(args ?? {}) };
  const where = { ...(next.where ?? {}) };
  const explicitHh = extractHouseholdId(where);

  if (explicitHh && explicitHh !== ctxHh) {
    throw Errors.householdScopeViolation();
  }

  // Idempotent: don't double-AND if the caller already supplied householdId.
  if (!explicitHh) {
    if (nullableTenant) {
      // Only inject when the caller didn't compose a NULL/equals OR. If the
      // where already mentions householdId (e.g. via OR/AND), we leave it
      // alone — service is responsible.
      if (!whereMentionsHousehold(where)) {
        // Compose the standard "mine OR system" predicate.
        const composed = {
          ...where,
          OR: [
            ...((Array.isArray(where.OR) ? where.OR : []) as Array<
              Record<string, unknown>
            >),
            { householdId: ctxHh },
            { householdId: null },
          ],
        };
        next.where = composed;
        return next;
      }
    } else {
      // findUnique/findUniqueOrThrow target unique-by-id queries — Prisma
      // rejects extra non-unique fields in their `where`. We still scope by
      // intercepting on the result-side: trust `extractHouseholdId` for
      // composite keys; otherwise let the call through and rely on the row
      // returned (downstream services already check ownership via findFirst
      // before mutating). For uniqueness queries we MUST NOT inject.
      const isUniqueByIdOnly =
        (operation === 'findUnique' || operation === 'findUniqueOrThrow') &&
        isPlainIdLookup(where);
      if (!isUniqueByIdOnly) {
        where.householdId = ctxHh;
      }
    }
  }
  next.where = where;
  return next;
}

function enforceCreateScope(opts: {
  model: string;
  operation: string;
  args: AnyArgs | undefined;
  ctxHh: string | undefined;
}): AnyArgs {
  const { ctxHh, args, operation } = opts;
  const next: AnyArgs = { ...(args ?? {}) };

  if (operation === 'createMany' || operation === 'createManyAndReturn') {
    const data = next.data;
    if (Array.isArray(data)) {
      next.data = data.map((row) => attachHouseholdId(row, ctxHh));
    } else if (data && typeof data === 'object') {
      next.data = attachHouseholdId(data as Record<string, unknown>, ctxHh);
    }
    return next;
  }

  // create
  const data = (next.data ?? {}) as Record<string, unknown>;
  next.data = attachHouseholdId(data, ctxHh);
  return next;
}

function enforceUpsertScope(opts: {
  model: string;
  args: AnyArgs | undefined;
  ctxHh: string | undefined;
  nullableTenant: boolean;
}): AnyArgs {
  const { ctxHh, args, nullableTenant } = opts;
  if (!ctxHh) {
    throw Errors.householdScopeViolation();
  }
  const next: AnyArgs = { ...(args ?? {}) };

  // 1) where: refuse cross-tenant unique lookups; do NOT inject (uniqueness).
  const where = { ...(next.where ?? {}) };
  const explicitHh = extractHouseholdId(where);
  if (explicitHh && explicitHh !== ctxHh) {
    throw Errors.householdScopeViolation();
  }
  next.where = where;

  // 2) create branch must carry householdId.
  if (next.create && typeof next.create === 'object') {
    next.create = attachHouseholdId(
      next.create as Record<string, unknown>,
      ctxHh,
    );
  }

  // 3) update branch: refuse explicit cross-tenant override; idempotent.
  if (next.update && typeof next.update === 'object') {
    const upd = next.update as Record<string, unknown>;
    const updHh = upd.householdId;
    if (typeof updHh === 'string' && updHh !== ctxHh) {
      throw Errors.householdScopeViolation();
    }
  }
  void nullableTenant;
  return next;
}

function attachHouseholdId(
  row: Record<string, unknown>,
  ctxHh: string | undefined,
): Record<string, unknown> {
  const next = { ...row };
  if (typeof next.householdId === 'string') {
    if (ctxHh && next.householdId !== ctxHh) {
      throw Errors.householdScopeViolation();
    }
    return next;
  }
  if (!ctxHh) {
    throw Errors.householdScopeViolation();
  }
  next.householdId = ctxHh;
  return next;
}

function extractHouseholdId(
  where: Record<string, unknown> | undefined,
): string | undefined {
  if (!where) return undefined;
  const top = (where as { householdId?: unknown }).householdId;
  if (typeof top === 'string') return top;
  // Composite-unique findUnique passes
  // `{ householdId_userId: { householdId, userId } }` etc.
  for (const v of Object.values(where)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && 'householdId' in v) {
      const nested = (v as { householdId?: unknown }).householdId;
      if (typeof nested === 'string') return nested;
    }
  }
  return undefined;
}

function whereMentionsHousehold(where: Record<string, unknown>): boolean {
  if ('householdId' in where) return true;
  for (const k of ['AND', 'OR', 'NOT'] as const) {
    const v = where[k];
    if (Array.isArray(v)) {
      if (v.some((c) => c && typeof c === 'object' && 'householdId' in c)) {
        return true;
      }
    } else if (v && typeof v === 'object' && 'householdId' in v) {
      return true;
    }
  }
  return false;
}

function isPlainIdLookup(where: Record<string, unknown>): boolean {
  const keys = Object.keys(where);
  // Only a single key named exactly "id" qualifies as a plain id lookup.
  // Composite unique keys (e.g. householdId_userId) must include householdId
  // in the composite and are handled by extractHouseholdId instead.
  return keys.length === 1 && keys[0] === 'id';
}
