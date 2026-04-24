import { Injectable } from '@nestjs/common';
import { Prisma, type Category as CategoryRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BudgetsService } from '../budgets/budgets.service';
import { Errors } from '../common/errors';
import { newId } from '../common/ids';
import { getAuthOrThrow, getContext, getHouseholdOrThrow } from '../common/context';
import { roleAtLeast, type HouseholdRole } from '../common/household-header.guard';
import type { CategoryDTO } from './categories.dto';

const WRITE_ROLE = 'MEMBER' as const;
const TERMINAL_ROLE = 'ADMIN' as const;

type AnyTx = Prisma.TransactionClient | PrismaService;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budgets: BudgetsService,
  ) {}

  async list(params: {
    cursor?: string;
    limit?: number;
    type?: 'INCOME' | 'EXPENSE';
    includeArchived?: boolean;
  }): Promise<{ items: CategoryDTO[]; nextCursor: string | null }> {
    const householdId = getHouseholdOrThrow();
    const limit = Math.min(Math.max(params.limit ?? 100, 1), 200);

    // System rows (household_id IS NULL) + household rows.
    const where: Prisma.CategoryWhereInput = {
      AND: [
        { OR: [{ householdId: null }, { householdId }] },
        { deletedAt: null },
        params.includeArchived ? {} : { archivedAt: null },
        params.type ? { type: params.type } : {},
      ],
    };

    // We can't easily keyset-cursor both system-first-then-household ordering
    // in a single SQL clause. Categories are low cardinality (hundreds), so
    // we page by id with offset-less cursor: the "cursor" here is the last
    // seen id; rows beyond it are fetched deterministically after sorting
    // client-side. In practice a single page usually returns everything.
    const rows = await this.prisma.category.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });

    // Sort: system rows first (alpha by label), then household rows by
    // displayOrder ASC, createdAt ASC.
    const sorted = rows.slice().sort((a, b) => {
      const aSys = a.householdId === null;
      const bSys = b.householdId === null;
      if (aSys && !bSys) return -1;
      if (!aSys && bSys) return 1;
      if (aSys && bSys) return a.label.localeCompare(b.label);
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const hasMore = sorted.length > limit;
    const page = hasMore ? sorted.slice(0, limit) : sorted;
    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;
    return { items: page.map(toDTO), nextCursor };
  }

  async get(id: string): Promise<CategoryDTO> {
    const row = await this.findVisibleOrThrow(id);
    return toDTO(row);
  }

  async create(input: {
    label: string;
    type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
    iconToken?: string;
    colorToken?: string;
    displayOrder?: number;
  }): Promise<CategoryDTO> {
    const householdId = getHouseholdOrThrow();
    const { userId } = getAuthOrThrow();
    this.assertRole(WRITE_ROLE);

    if (input.type === 'TRANSFER') throw Errors.categoryTypeInvalid();

    const key = await this.assignKey(this.prisma, householdId, input.label);

    const id = newId();
    const created = await this.prisma.$transaction(async (tx) => {
      const maxOrder = await tx.category.aggregate({
        where: { householdId, deletedAt: null },
        _max: { displayOrder: true },
      });
      const displayOrder = input.displayOrder ?? (maxOrder._max.displayOrder ?? -1) + 1;

      const row = await tx.category.create({
        data: {
          id,
          householdId,
          key,
          label: input.label,
          type: input.type,
          iconToken: input.iconToken ?? 'tag',
          colorToken: input.colorToken ?? 'graphite',
          displayOrder,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      await recordEvent(tx, householdId, userId, 'category.created', {
        categoryId: row.id,
        key: row.key,
        label: row.label,
        type: row.type,
      });
      return row;
    });
    return toDTO(created);
  }

  async update(
    id: string,
    patch: {
      label?: string;
      iconToken?: string;
      colorToken?: string;
      displayOrder?: number;
      type?: string; // rejected
    },
  ): Promise<CategoryDTO> {
    const { userId } = getAuthOrThrow();
    this.assertRole(WRITE_ROLE);

    if (patch.type !== undefined) throw Errors.categoryTypeImmutable();

    const existing = await this.findVisibleOrThrow(id);
    if (existing.householdId === null) throw Errors.categorySystemReadonly();

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const changed: string[] = [];
    const data: Prisma.CategoryUpdateInput = { updatedBy: userId };

    if (patch.label !== undefined && patch.label !== existing.label) {
      data.label = patch.label;
      before.label = existing.label;
      after.label = patch.label;
      changed.push('label');
    }
    if (patch.iconToken !== undefined && patch.iconToken !== existing.iconToken) {
      data.iconToken = patch.iconToken;
      before.iconToken = existing.iconToken;
      after.iconToken = patch.iconToken;
      changed.push('iconToken');
    }
    if (patch.colorToken !== undefined && patch.colorToken !== existing.colorToken) {
      data.colorToken = patch.colorToken;
      before.colorToken = existing.colorToken;
      after.colorToken = patch.colorToken;
      changed.push('colorToken');
    }
    if (patch.displayOrder !== undefined && patch.displayOrder !== existing.displayOrder) {
      data.displayOrder = patch.displayOrder;
      before.displayOrder = existing.displayOrder;
      after.displayOrder = patch.displayOrder;
      changed.push('displayOrder');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.category.update({ where: { id }, data });
      if (changed.length > 0) {
        await recordEvent(tx, existing.householdId!, userId, 'category.updated', {
          categoryId: id,
          changedFields: changed,
          before,
          after,
        });
      }
      return row;
    });
    return toDTO(updated);
  }

  async archiveOrDelete(id: string): Promise<CategoryDTO> {
    const { userId } = getAuthOrThrow();
    this.assertRole(TERMINAL_ROLE);

    const existing = await this.findVisibleOrThrow(id);
    if (existing.householdId === null) throw Errors.categorySystemReadonly();

    const updated = await this.prisma.$transaction(async (tx) => {
      const hasAny = await hasAnyTransactionsForCategory(tx, id);
      if (!hasAny) {
        const row = await tx.category.update({
          where: { id },
          data: { deletedAt: new Date(), updatedBy: userId },
        });
        await recordEvent(tx, existing.householdId!, userId, 'category.deleted', {
          categoryId: id,
          key: existing.key,
          label: existing.label,
        });
        return row;
      }
      if (existing.archivedAt) return existing;
      const row = await tx.category.update({
        where: { id },
        data: { archivedAt: new Date(), updatedBy: userId },
      });
      await recordEvent(tx, existing.householdId!, userId, 'category.archived', {
        categoryId: id,
        key: existing.key,
        label: existing.label,
      });
      // Cascade: auto-archive every active budget pinned to this category.
      // Runs inside the same tx so the archive is atomic with the category
      // archive; each archived budget emits its own `budget.auto_archived`.
      await this.budgets.autoArchiveForCategory(
        tx,
        existing.householdId!,
        id,
        userId,
      );
      return row;
    });
    return toDTO(updated);
  }

  async restore(id: string): Promise<CategoryDTO> {
    const { userId } = getAuthOrThrow();
    this.assertRole(TERMINAL_ROLE);

    const householdId = getHouseholdOrThrow();
    const existing = await this.prisma.category.findFirst({
      where: { id, householdId, deletedAt: null },
    });
    if (!existing) throw Errors.notFound();
    if (existing.householdId === null) throw Errors.categorySystemReadonly();
    if (!existing.archivedAt) return toDTO(existing);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.category.update({
        where: { id },
        data: { archivedAt: null, updatedBy: userId },
      });
      await recordEvent(tx, existing.householdId!, userId, 'category.restored', {
        categoryId: id,
        key: existing.key,
        label: existing.label,
      });
      return row;
    });
    return toDTO(updated);
  }

  async reorder(entries: Array<{ id: string; displayOrder: number }>): Promise<{
    items: CategoryDTO[];
  }> {
    const householdId = getHouseholdOrThrow();
    const { userId } = getAuthOrThrow();
    this.assertRole(TERMINAL_ROLE);

    // Any system id is rejected.
    const rows = await this.prisma.category.findMany({
      where: { id: { in: entries.map((e) => e.id) }, deletedAt: null },
      select: { id: true, householdId: true },
    });
    if (rows.some((r) => r.householdId === null)) throw Errors.categorySystemReadonly();
    if (rows.some((r) => r.householdId !== householdId)) throw Errors.notFound();

    // Normalize to dense 0..N-1 in the order given.
    const sorted = [...entries].sort((a, b) => a.displayOrder - b.displayOrder);

    const items = await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        sorted.map((e, idx) =>
          tx.category.update({
            where: { id: e.id },
            data: { displayOrder: idx, updatedBy: userId },
          }),
        ),
      );
      await recordEvent(tx, householdId, userId, 'category.reordered', {
        order: sorted.map((e, idx) => ({ categoryId: e.id, displayOrder: idx })),
      });
      return tx.category.findMany({
        where: { householdId, deletedAt: null },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });
    return { items: items.map(toDTO) };
  }

  // ---- internal helpers ----

  /**
   * Find a category visible to the current household:
   *   system rows (household_id IS NULL) OR rows in this household.
   * Non-deleted only.
   */
  async findVisibleOrThrow(id: string): Promise<CategoryRow> {
    const householdId = getHouseholdOrThrow();
    const row = await this.prisma.category.findFirst({
      where: {
        id,
        deletedAt: null,
        OR: [{ householdId: null }, { householdId }],
      },
    });
    if (!row) throw Errors.notFound();
    return row;
  }

  /**
   * Assign a `key` by slugifying the label. Collisions within the household's
   * non-deleted rows append `-N` (actually `_N` to stay inside our slug
   * charset `[a-z0-9_]`). System rows never collide because they always have
   * household_id = NULL and the partial unique is scoped separately.
   */
  private async assignKey(client: AnyTx, householdId: string, label: string): Promise<string> {
    const base = slugify(label);
    if (!base) {
      throw Errors.validation('Label must contain alphanumeric characters.');
    }
    let candidate = base;
    let suffix = 2;
    while (await keyExists(client, householdId, candidate)) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
      if (suffix > 1000) {
        throw Errors.validation('Unable to assign a unique category key.');
      }
    }
    return candidate.slice(0, 48);
  }

  /**
   * Look up a system category by its stable `key`. Used by TransfersService
   * to resolve the reserved `transfer_system` category.
   */
  async findSystemByKey(key: string): Promise<CategoryRow | null> {
    return this.prisma.category.findFirst({
      where: { householdId: null, key, deletedAt: null },
    });
  }

  private assertRole(minimum: HouseholdRole) {
    const role = getContext()?.householdRole;
    if (!role || !roleAtLeast(role, minimum)) throw Errors.forbiddenRole();
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

async function keyExists(client: AnyTx, householdId: string, key: string): Promise<boolean> {
  const existing = await client.category.findFirst({
    where: { householdId, key, deletedAt: null },
    select: { id: true },
  });
  return existing !== null;
}

async function hasAnyTransactionsForCategory(tx: AnyTx, categoryId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS(SELECT 1 FROM transactions WHERE category_id = ${categoryId}) AS exists
  `;
  return rows[0]?.exists === true;
}

async function recordEvent(
  tx: AnyTx,
  householdId: string,
  actorId: string,
  type: string,
  payload: unknown,
) {
  await tx.$executeRaw`
    INSERT INTO events (id, household_id, actor_id, type, payload)
    VALUES (${newId()}, ${householdId}, ${actorId}, ${type}, ${JSON.stringify(payload)}::jsonb)
  `;
}

export function toDTO(row: CategoryRow): CategoryDTO {
  return {
    id: row.id,
    householdId: row.householdId,
    key: row.key,
    label: row.label,
    type: row.type as CategoryDTO['type'],
    iconToken: row.iconToken,
    colorToken: row.colorToken,
    displayOrder: row.displayOrder,
    isSystem: row.householdId === null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
