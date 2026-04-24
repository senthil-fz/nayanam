import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { getContext } from '../common/context';
import { Errors } from '../common/errors';

/**
 * Domain models whose rows carry `householdId` and must be scoped to the current
 * household context on every read/write. Phase 1 only tags the household tables;
 * each later feature registers its own tables here.
 */
/**
 * Models whose reads/writes must match the current household context.
 * Note: `HouseholdMember` is intentionally NOT in this set — it is the
 * user↔household mapping itself and must be readable without a pre-resolved
 * household context (the membership lookup is how we RESOLVE the context).
 * Services that touch memberships enforce scoping explicitly.
 */
export const HOUSEHOLD_SCOPED_MODELS = new Set<string>([
  'HouseholdInvite',
  'Event',
  'Account',
  'Category',
  'Transaction',
  'Transfer',
]);

/**
 * Models whose `householdId` column is NULLABLE: a NULL row is a system-level
 * row visible to every tenant. The middleware must allow these through reads
 * where `householdId = ctx.householdId OR householdId IS NULL`. Writes must
 * still bind to the current household (we never mutate system rows through
 * the scoped path — services explicitly reject system mutations at a higher
 * layer).
 */
export const HOUSEHOLD_NULLABLE_TENANT_MODELS = new Set<string>([
  'Category',
]);

/** Models that use soft-delete via `deletedAt`. */
export const SOFT_DELETE_MODELS = new Set<string>([
  'Household',
  'Account',
  'Category',
  'Transaction',
  'Transfer',
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    super({ adapter, log: ['warn', 'error'] });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
    this.installExtensions();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end().catch(() => {
      /* pool may already be closed */
    });
  }

  /**
   * Prisma v7 uses `$extends` for middleware-style hooks.
   * We return a separate extended client and proxy reads through it.
   * For simplicity we install a `$use`-style shim via a custom extension on the
   * query events; for Phase 1 we use the classic `$use` fallback where still
   * supported, and otherwise document the enforcement layer at the service level.
   */
  private installExtensions() {
    // `$use` was removed in Prisma v7 in favor of `$extends`. We apply the scope
    // enforcement via a wrapper here.
    // NOTE: Because services hold a reference to `this`, we monkey-patch the
    // relevant delegates to intercept queries on household-scoped models.
    for (const model of HOUSEHOLD_SCOPED_MODELS) {
      const delegateKey = model[0]!.toLowerCase() + model.slice(1);
      const delegate = (this as unknown as Record<string, unknown>)[delegateKey] as
        | Record<string, (...args: unknown[]) => Promise<unknown>>
        | undefined;
      if (!delegate) continue;
      for (const op of ['findMany', 'findFirst', 'findUnique'] as const) {
        const orig = delegate[op]?.bind(delegate);
        if (!orig) continue;
        delegate[op] = async (args: Prisma.Args<unknown, 'findMany'>): Promise<unknown> => {
          enforceScopedWhere(
            model,
            (args as { where?: { householdId?: string } } | undefined)?.where,
            HOUSEHOLD_NULLABLE_TENANT_MODELS.has(model),
          );
          return orig(args);
        };
      }
      for (const op of ['create'] as const) {
        const orig = delegate[op]?.bind(delegate);
        if (!orig) continue;
        delegate[op] = async (...args: unknown[]) => {
          const first = (args[0] ?? {}) as { data?: { householdId?: string } };
          first.data = first.data ?? {};
          ensureScopedCreate(model, first.data);
          args[0] = first;
          return orig(...args);
        };
      }
    }
    // Soft-delete default filter
    for (const model of SOFT_DELETE_MODELS) {
      const delegateKey = model[0]!.toLowerCase() + model.slice(1);
      const delegate = (this as unknown as Record<string, unknown>)[delegateKey] as
        | Record<string, (...args: unknown[]) => Promise<unknown>>
        | undefined;
      if (!delegate) continue;
      for (const op of ['findMany', 'findFirst', 'findUnique'] as const) {
        const orig = delegate[op]?.bind(delegate);
        if (!orig) continue;
        delegate[op] = async (...args: unknown[]) => {
          const first = (args[0] ?? {}) as { where?: Record<string, unknown> };
          first.where = first.where ?? {};
          if (!('deletedAt' in first.where)) {
            first.where.deletedAt = null;
          }
          args[0] = first;
          return orig(...args);
        };
      }
    }
    this.logger.log(
      `Installed scope guards: household=${HOUSEHOLD_SCOPED_MODELS.size} soft-delete=${SOFT_DELETE_MODELS.size}`,
    );
  }
}

function enforceScopedWhere(
  model: string,
  where: Record<string, unknown> | undefined,
  nullableTenant = false,
) {
  const ctx = getContext();
  const ctxHh = ctx?.householdId;
  const whereHh = extractHouseholdId(where);
  // Nullable-tenant models (e.g. Category) may carry household_id = NULL for
  // system-default rows visible to every tenant. If the caller didn't pass an
  // explicit scope, we allow the call through as long as the request has a
  // resolved householdId (the service is responsible for OR-ing NULL).
  if (nullableTenant) {
    if (!ctxHh && !whereHh) {
      throw Errors.householdScopeViolation();
    }
    if (ctxHh && whereHh && whereHh !== ctxHh) {
      throw Errors.householdScopeViolation();
    }
    // Do NOT auto-inject household_id on nullable-tenant models — the service
    // must compose `{ OR: [{ householdId: ctx }, { householdId: null }] }` so
    // that system rows remain visible.
    return;
  }
  // Global/system-level reads (e.g. invite accept lookups by tokenHash) can
  // opt out by setting ctx.householdId === undefined AND relying on explicit
  // where.householdId — but we still require at least one.
  if (!ctxHh && !whereHh) {
    throw Errors.householdScopeViolation();
  }
  if (ctxHh && whereHh && ctxHh !== whereHh) {
    throw Errors.householdScopeViolation();
  }
  // Let the query run; if where.householdId is missing but ctx has one, callers
  // that want the scope applied must pass it explicitly. We don't auto-inject
  // because Prisma's where can be arbitrarily deep.
  if (!whereHh && ctxHh && where && !('id' in where) && !hasCompoundUnique(where)) {
    (where as { householdId?: string }).householdId = ctxHh;
  }
  void model;
}

function extractHouseholdId(where: Record<string, unknown> | undefined): string | undefined {
  if (!where) return undefined;
  const top = (where as { householdId?: unknown }).householdId;
  if (typeof top === 'string') return top;
  // Composite-key findUnique passes `{ householdId_userId: { householdId, userId } }`.
  for (const v of Object.values(where)) {
    if (v && typeof v === 'object' && 'householdId' in v) {
      const nested = (v as { householdId?: unknown }).householdId;
      if (typeof nested === 'string') return nested;
    }
  }
  return undefined;
}

function hasCompoundUnique(where: Record<string, unknown>): boolean {
  return Object.keys(where).some((k) => k.includes('_'));
}

function ensureScopedCreate(model: string, data: { householdId?: string }) {
  const ctx = getContext();
  if (!data.householdId && ctx?.householdId) {
    data.householdId = ctx.householdId;
  }
  if (!data.householdId) {
    throw Errors.householdScopeViolation();
  }
  void model;
}
