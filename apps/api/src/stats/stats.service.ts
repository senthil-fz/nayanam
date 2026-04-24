import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Errors } from '../common/errors';
import { getHouseholdOrThrow } from '../common/context';
import { isSupportedCurrency } from '../common/currencies';
import {
  previousStatsPeriod,
  resolveStatsPeriod,
  type StatsPeriodKind,
} from '../common/period';
import type {
  CategoryBreakdownQuery,
  CategoryBreakdownResponseDTO,
  CategorySparklineQuery,
  CategorySparklineResponseDTO,
  DailySpendQuery,
  DailySpendResponseDTO,
  MonthlyTrendQuery,
  MonthlyTrendResponseDTO,
  OverviewQuery,
  PeriodDeltaState,
  SankeyLinkDTO,
  SankeyNodeDTO,
  SankeyQuery,
  SankeyResponseDTO,
  StatsOverviewCurrencyBucketDTO,
  StatsOverviewResponseDTO,
  StatsOverviewTopCategoryItemDTO,
  StatsPeriodRangeDTO,
} from './stats.dto';

const MAX_CUSTOM_SPAN_MS = 366 * 2 * 86_400_000; // 2 years (spec §6 cap).
const SLOW_QUERY_MS = 500;

type OverviewAggregateRow = {
  currency_code: string;
  income_minor: bigint;
  expense_minor: bigint;
  transaction_count: number;
};

type TopCategoryRow = {
  category_id: string;
  category_key: string;
  label: string;
  icon_token: string;
  color_token: string | null;
  amount_minor: bigint;
  transaction_count: number;
};

type MonthlyRow = {
  currency_code: string;
  month_start: Date;
  income_minor: bigint;
  expense_minor: bigint;
};

type CategoryBreakdownRow = {
  category_id: string;
  label: string;
  icon_token: string | null;
  color_token: string | null;
  currency_code: string;
  amount_minor: bigint;
  transaction_count: number;
};

type DailyRow = {
  currency_code: string;
  day: Date;
  amount_minor: bigint;
  transaction_count: number;
};

type SparklineRow = {
  category_id: string;
  day: Date;
  amount_minor: bigint;
};

type SankeySideRow = {
  category_id: string;
  label: string;
  icon_token: string | null;
  color_token: string | null;
  amount_minor: bigint;
};

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── /stats/overview ─────────────────────────────────────────────────────

  async overview(q: OverviewQuery): Promise<StatsOverviewResponseDTO> {
    const householdId = getHouseholdOrThrow();
    const { from, to } = this.resolvePeriodOrThrow(q.period, q.from, q.to);
    const prev = previousStatsPeriod(q.period, from, to);
    const limit = Math.max(1, Math.min(20, q.topCategoriesLimit ?? 8));

    const started = Date.now();
    const [currentRows, previousRows, primaryCurrency] = await Promise.all([
      this.aggregateOverview(householdId, from, to),
      this.aggregateOverview(householdId, prev.from, prev.to),
      this.resolvePrimaryCurrency(householdId, from, to),
    ]);

    const currencies = new Set<string>([
      ...currentRows.map((r) => r.currency_code),
      ...previousRows.map((r) => r.currency_code),
    ]);
    const prevByCurrency = new Map(previousRows.map((r) => [r.currency_code, r]));
    const currByCurrency = new Map(currentRows.map((r) => [r.currency_code, r]));

    const byCurrency: StatsOverviewCurrencyBucketDTO[] = [];
    for (const code of Array.from(currencies).sort()) {
      const cur = currByCurrency.get(code);
      const pre = prevByCurrency.get(code);
      const income = cur?.income_minor ?? 0n;
      const expense = cur?.expense_minor ?? 0n;
      const net = income - expense;
      const pIncome = pre?.income_minor ?? 0n;
      const pExpense = pre?.expense_minor ?? 0n;
      const pNet = pIncome - pExpense;

      const deltaState = pickDeltaState(income, expense, net, pIncome, pExpense, pNet);
      byCurrency.push({
        currencyCode: code,
        incomeMinor: income.toString(),
        expenseMinor: expense.toString(),
        netMinor: net.toString(),
        transactionCount: Number(cur?.transaction_count ?? 0),
        previousIncomeMinor: pIncome.toString(),
        previousExpenseMinor: pExpense.toString(),
        previousNetMinor: pNet.toString(),
        incomeDeltaPercent: deltaPercent(income, pIncome),
        expenseDeltaPercent: deltaPercent(expense, pExpense),
        netDeltaPercent: deltaPercent(net, pNet),
        deltaState,
      });
    }

    let topCategories: StatsOverviewTopCategoryItemDTO[] = [];
    if (primaryCurrency) {
      const topRows = await this.topCategoriesRaw(
        householdId,
        from,
        to,
        primaryCurrency,
        limit,
      );
      const total = topRows.reduce((a, r) => a + r.amount_minor, 0n);
      topCategories = topRows.map((r) => ({
        categoryId: r.category_id,
        categoryKey: r.category_key,
        label: r.label,
        iconToken: r.icon_token,
        colorToken: r.color_token,
        currencyCode: primaryCurrency,
        amountMinor: r.amount_minor.toString(),
        transactionCount: Number(r.transaction_count),
        percentOfTotal: total > 0n ? Number((r.amount_minor * 100n) / total) : 0,
      }));
    }

    this.logIfSlow('overview', started);
    return {
      period: toRange(q.period, from, to),
      previousPeriod: toRange(q.period, prev.from, prev.to),
      byCurrency,
      topCategories,
    };
  }

  private async aggregateOverview(
    householdId: string,
    from: Date,
    to: Date,
  ): Promise<OverviewAggregateRow[]> {
    return this.prisma.$queryRaw<OverviewAggregateRow[]>`
      SELECT
        currency_code,
        COALESCE(SUM(amount_minor) FILTER (
          WHERE type = 'INCOME'  AND deleted_at IS NULL AND transfer_id IS NULL
        ), 0)::bigint AS income_minor,
        COALESCE(SUM(amount_minor) FILTER (
          WHERE type = 'EXPENSE' AND deleted_at IS NULL AND transfer_id IS NULL
        ), 0)::bigint AS expense_minor,
        COALESCE(COUNT(*) FILTER (
          WHERE deleted_at IS NULL AND transfer_id IS NULL AND type IN ('INCOME','EXPENSE')
        ), 0)::int AS transaction_count
      FROM transactions
      WHERE household_id = ${householdId}
        AND occurred_at >= ${from}
        AND occurred_at <  ${to}
      GROUP BY currency_code
    `;
  }

  private async topCategoriesRaw(
    householdId: string,
    from: Date,
    to: Date,
    currencyCode: string,
    limit: number,
  ): Promise<TopCategoryRow[]> {
    return this.prisma.$queryRaw<TopCategoryRow[]>`
      SELECT
        c.id          AS category_id,
        c.key         AS category_key,
        c.label       AS label,
        c.icon_token  AS icon_token,
        c.color_token AS color_token,
        SUM(t.amount_minor)::bigint AS amount_minor,
        COUNT(*)::int AS transaction_count
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE t.household_id = ${householdId}
        AND t.deleted_at IS NULL
        AND t.transfer_id IS NULL
        AND t.type = 'EXPENSE'
        AND t.currency_code = ${currencyCode}
        AND t.occurred_at >= ${from}
        AND t.occurred_at <  ${to}
      GROUP BY c.id, c.key, c.label, c.icon_token, c.color_token
      ORDER BY amount_minor DESC
      LIMIT ${limit}
    `;
  }

  // ─── /stats/monthly-trend ────────────────────────────────────────────────

  async monthlyTrend(q: MonthlyTrendQuery): Promise<MonthlyTrendResponseDTO> {
    const householdId = getHouseholdOrThrow();
    const months = Math.max(1, Math.min(24, q.months ?? 12));
    const currencyCode = this.validateCurrency(q.currencyCode);

    const now = new Date();
    // Window = [monthStart of (now - months + 1), firstOfNextMonth(now))
    const endExclusive = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
    );
    const startInclusive = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1, 0, 0, 0, 0),
    );

    const started = Date.now();
    const rows = await this.prisma.$queryRaw<MonthlyRow[]>`
      SELECT
        t.currency_code,
        date_trunc('month', t.occurred_at AT TIME ZONE 'UTC') AS month_start,
        COALESCE(SUM(t.amount_minor) FILTER (WHERE t.type = 'INCOME'),  0)::bigint AS income_minor,
        COALESCE(SUM(t.amount_minor) FILTER (WHERE t.type = 'EXPENSE'), 0)::bigint AS expense_minor
      FROM transactions t
      WHERE t.household_id = ${householdId}
        AND t.deleted_at IS NULL
        AND t.transfer_id IS NULL
        AND t.type IN ('INCOME','EXPENSE')
        AND t.occurred_at >= ${startInclusive}
        AND t.occurred_at <  ${endExclusive}
        AND (${currencyCode}::text IS NULL OR t.currency_code = ${currencyCode})
      GROUP BY t.currency_code, month_start
    `;

    // Determine currencies present (or filter to single).
    const currencies = currencyCode
      ? [currencyCode]
      : Array.from(new Set(rows.map((r) => r.currency_code))).sort();

    // Pre-compute month buckets, oldest → newest.
    const monthBuckets: Array<{ start: Date; key: string }> = [];
    for (let i = 0; i < months; i += 1) {
      const start = new Date(
        Date.UTC(
          startInclusive.getUTCFullYear(),
          startInclusive.getUTCMonth() + i,
          1,
          0,
          0,
          0,
          0,
        ),
      );
      monthBuckets.push({ start, key: monthKey(start) });
    }

    // Index rows by (currency, month_start).
    const idx = new Map<string, MonthlyRow>();
    for (const r of rows) {
      const key = `${r.currency_code}|${monthKey(new Date(r.month_start))}`;
      idx.set(key, r);
    }

    const series = currencies.map((code) => ({
      currencyCode: code,
      points: monthBuckets.map((b) => {
        const r = idx.get(`${code}|${b.key}`);
        return {
          month: b.key,
          incomeMinor: (r?.income_minor ?? 0n).toString(),
          expenseMinor: (r?.expense_minor ?? 0n).toString(),
        };
      }),
    }));

    this.logIfSlow('monthly-trend', started);
    return { series };
  }

  // ─── /stats/category-breakdown ───────────────────────────────────────────

  async categoryBreakdown(
    q: CategoryBreakdownQuery,
  ): Promise<CategoryBreakdownResponseDTO> {
    const householdId = getHouseholdOrThrow();
    const type = q.type ?? 'EXPENSE';
    if (type !== 'INCOME' && type !== 'EXPENSE') {
      throw Errors.validation('type must be INCOME or EXPENSE.');
    }
    const { from, to } = this.resolvePeriodOrThrow(q.period, q.from, q.to);
    const currencyCode = this.validateCurrency(q.currencyCode);

    const started = Date.now();
    const rows = await this.prisma.$queryRaw<CategoryBreakdownRow[]>`
      SELECT
        c.id          AS category_id,
        c.label       AS label,
        c.icon_token  AS icon_token,
        c.color_token AS color_token,
        t.currency_code,
        SUM(t.amount_minor)::bigint AS amount_minor,
        COUNT(*)::int AS transaction_count
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE t.household_id = ${householdId}
        AND t.deleted_at IS NULL
        AND t.transfer_id IS NULL
        AND t.type = ${type}
        AND t.occurred_at >= ${from}
        AND t.occurred_at <  ${to}
        AND (${currencyCode}::text IS NULL OR t.currency_code = ${currencyCode})
      GROUP BY c.id, c.label, c.icon_token, c.color_token, t.currency_code
      ORDER BY amount_minor DESC
    `;

    // Bucket by currency → totals + items.
    const byCurrencyMap = new Map<
      string,
      { total: bigint; items: CategoryBreakdownRow[] }
    >();
    for (const r of rows) {
      const bucket = byCurrencyMap.get(r.currency_code) ?? { total: 0n, items: [] };
      bucket.total += r.amount_minor;
      bucket.items.push(r);
      byCurrencyMap.set(r.currency_code, bucket);
    }

    const byCurrency = Array.from(byCurrencyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, bucket]) => ({
        currencyCode: code,
        totalMinor: bucket.total.toString(),
        items: bucket.items.map((r) => ({
          categoryId: r.category_id,
          label: r.label,
          iconToken: r.icon_token,
          colorToken: r.color_token,
          amountMinor: r.amount_minor.toString(),
          transactionCount: Number(r.transaction_count),
          percentOfTotal:
            bucket.total > 0n
              ? Number((r.amount_minor * 100n) / bucket.total)
              : 0,
        })),
      }));

    this.logIfSlow('category-breakdown', started);
    return {
      period: toRange(q.period, from, to),
      type,
      byCurrency,
    };
  }

  // ─── /stats/daily-spend ──────────────────────────────────────────────────

  async dailySpend(q: DailySpendQuery): Promise<DailySpendResponseDTO> {
    const householdId = getHouseholdOrThrow();
    const days = Math.max(7, Math.min(365, q.days ?? 90));
    const currencyCode = this.validateCurrency(q.currencyCode);

    const now = new Date();
    const todayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
    );
    const endExclusive = new Date(todayUtc.getTime() + 86_400_000);
    const startInclusive = new Date(todayUtc.getTime() - (days - 1) * 86_400_000);

    const started = Date.now();
    // Aggregate EXPENSE by (currency, UTC day). `generate_series` for zero-buckets
    // happens client-side in JS to keep the SQL free of per-currency cross-joins.
    const rows = await this.prisma.$queryRaw<DailyRow[]>`
      SELECT
        t.currency_code,
        date_trunc('day', t.occurred_at AT TIME ZONE 'UTC') AS day,
        SUM(t.amount_minor)::bigint AS amount_minor,
        COUNT(*)::int               AS transaction_count
      FROM transactions t
      WHERE t.household_id = ${householdId}
        AND t.deleted_at IS NULL
        AND t.transfer_id IS NULL
        AND t.type = 'EXPENSE'
        AND t.occurred_at >= ${startInclusive}
        AND t.occurred_at <  ${endExclusive}
        AND (${currencyCode}::text IS NULL OR t.currency_code = ${currencyCode})
      GROUP BY t.currency_code, day
    `;

    const currencies = currencyCode
      ? [currencyCode]
      : Array.from(new Set(rows.map((r) => r.currency_code))).sort();

    // Pre-compute day buckets oldest→newest.
    const dayBuckets: Array<{ start: Date; key: string }> = [];
    for (let i = 0; i < days; i += 1) {
      const start = new Date(startInclusive.getTime() + i * 86_400_000);
      dayBuckets.push({ start, key: dateKey(start) });
    }

    const idx = new Map<string, DailyRow>();
    for (const r of rows) {
      const key = `${r.currency_code}|${dateKey(new Date(r.day))}`;
      idx.set(key, r);
    }

    const series = currencies.map((code) => {
      const points = dayBuckets.map((b) => {
        const r = idx.get(`${code}|${b.key}`);
        return {
          date: b.key,
          amountMinor: (r?.amount_minor ?? 0n).toString(),
          transactionCount: Number(r?.transaction_count ?? 0),
        };
      });
      const nonZero = points
        .map((p) => BigInt(p.amountMinor))
        .filter((n) => n > 0n)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      // 99th percentile across non-zero days; fall back to max when <10.
      let capMinor = 0n;
      if (nonZero.length >= 10) {
        const idx99 = Math.min(nonZero.length - 1, Math.ceil(0.99 * nonZero.length) - 1);
        capMinor = nonZero[Math.max(0, idx99)] ?? 0n;
      } else if (nonZero.length > 0) {
        capMinor = nonZero[nonZero.length - 1] ?? 0n;
      }
      return {
        currencyCode: code,
        intensityCapMinor: capMinor.toString(),
        points,
      };
    });

    this.logIfSlow('daily-spend', started);
    return { series };
  }

  // ─── /stats/category-sparkline ───────────────────────────────────────────

  async categorySparkline(
    q: CategorySparklineQuery,
  ): Promise<CategorySparklineResponseDTO> {
    const householdId = getHouseholdOrThrow();
    const days = Math.max(7, Math.min(90, q.days ?? 30));
    const ids = Array.from(new Set(q.categoryIds));
    if (ids.length < 1 || ids.length > 10) {
      throw Errors.validation('categoryIds must contain between 1 and 10 ids.');
    }

    // Validate id ownership: categories can be system (householdId NULL) or
    // household-owned. Reject anything outside that set.
    const found = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM categories
       WHERE id = ANY(${ids})
         AND deleted_at IS NULL
         AND (household_id IS NULL OR household_id = ${householdId})
    `;
    const foundSet = new Set(found.map((f) => f.id));
    const invalid = q.categoryIds.filter((id) => !foundSet.has(id));
    if (invalid.length > 0) {
      throw Errors.validation('Invalid categoryIds.', { invalidCategoryIds: invalid });
    }

    const now = new Date();
    const todayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
    );
    const endExclusive = new Date(todayUtc.getTime() + 86_400_000);
    const startInclusive = new Date(todayUtc.getTime() - (days - 1) * 86_400_000);

    // Primary currency resolution scoped to this window.
    const primaryCurrency =
      (await this.resolvePrimaryCurrency(householdId, startInclusive, endExclusive)) ??
      (await this.householdDefaultCurrency(householdId));

    const started = Date.now();

    // Per-category daily EXPENSE totals in the primary currency.
    // Sparkline currency is the primary currency; categories with no transactions
    // in that currency return all-zero points.
    const rows = await this.prisma.$queryRaw<SparklineRow[]>`
      SELECT
        t.category_id,
        date_trunc('day', t.occurred_at AT TIME ZONE 'UTC') AS day,
        SUM(t.amount_minor)::bigint AS amount_minor
      FROM transactions t
      WHERE t.household_id = ${householdId}
        AND t.deleted_at IS NULL
        AND t.transfer_id IS NULL
        AND t.type = 'EXPENSE'
        AND t.currency_code = ${primaryCurrency}
        AND t.category_id = ANY(${ids})
        AND t.occurred_at >= ${startInclusive}
        AND t.occurred_at <  ${endExclusive}
      GROUP BY t.category_id, day
    `;

    const dayBuckets: string[] = [];
    for (let i = 0; i < days; i += 1) {
      dayBuckets.push(dateKey(new Date(startInclusive.getTime() + i * 86_400_000)));
    }

    // Index by (categoryId, dateKey).
    const idx = new Map<string, bigint>();
    for (const r of rows) {
      idx.set(`${r.category_id}|${dateKey(new Date(r.day))}`, r.amount_minor);
    }

    const items = q.categoryIds.map((id) => ({
      categoryId: id,
      currencyCode: primaryCurrency,
      points: dayBuckets.map((d) => ({
        date: d,
        amountMinor: (idx.get(`${id}|${d}`) ?? 0n).toString(),
      })),
    }));

    this.logIfSlow('category-sparkline', started);
    return { items };
  }

  // ─── /stats/sankey ───────────────────────────────────────────────────────

  /**
   * Link-allocation algorithm (spec §6):
   *   When totalIncome >= totalExpense: link(i, expense_j) = floor(I_i * E_j / totalIncome);
   *     link(i, savings)      = floor(I_i * savings / totalIncome) when savings > 0.
   *   When totalExpense > totalIncome: link(i, expense_j) = floor(I_i * E_j / totalExpense);
   *     no savings node.
   *   Rounding drift: leftover minor units are added to the largest link for each source
   *   so column sums reconcile exactly with node totals.
   *   `transfer_out` deferred post-v1 (see spec §6 note). Never emitted in v1.
   */
  async sankey(q: SankeyQuery): Promise<SankeyResponseDTO> {
    const householdId = getHouseholdOrThrow();
    const { from, to } = this.resolvePeriodOrThrow(q.period, q.from, q.to);
    const currencyCode = this.validateCurrency(q.currencyCode);

    // Resolve primary currency if not supplied.
    let resolvedCurrency = currencyCode ?? null;
    if (!resolvedCurrency) {
      resolvedCurrency =
        (await this.resolvePrimaryCurrency(householdId, from, to)) ??
        (await this.householdDefaultCurrency(householdId));
    }

    const started = Date.now();
    const [incomeRows, expenseRows] = await Promise.all([
      this.sankeySideRows(householdId, from, to, resolvedCurrency, 'INCOME'),
      this.sankeySideRows(householdId, from, to, resolvedCurrency, 'EXPENSE'),
    ]);

    const totalIncome = incomeRows.reduce((a, r) => a + r.amount_minor, 0n);
    const totalExpense = expenseRows.reduce((a, r) => a + r.amount_minor, 0n);
    const savings = totalIncome > totalExpense ? totalIncome - totalExpense : 0n;

    const nodes: SankeyNodeDTO[] = [
      ...incomeRows.map((r) => ({
        id: `income:${r.category_id}`,
        kind: 'income' as const,
        label: r.label,
        colorToken: r.color_token,
      })),
      ...expenseRows.map((r) => ({
        id: `expense:${r.category_id}`,
        kind: 'expense' as const,
        label: r.label,
        colorToken: r.color_token,
      })),
    ];
    if (savings > 0n) {
      nodes.push({ id: 'savings', kind: 'savings', label: 'Savings', colorToken: null });
    }

    // Build links.
    const links: SankeyLinkDTO[] = [];
    if (totalIncome > 0n && expenseRows.length > 0) {
      const denom = totalIncome >= totalExpense ? totalIncome : totalExpense;
      for (const inc of incomeRows) {
        // per-source running allocation + remainder reconciliation.
        const perSource: Array<{ target: string; amount: bigint; expense: bigint }> = [];
        for (const exp of expenseRows) {
          const amt = (inc.amount_minor * exp.amount_minor) / denom;
          perSource.push({
            target: `expense:${exp.category_id}`,
            amount: amt,
            expense: exp.amount_minor,
          });
        }
        // Source target = what proportion of inc flows through this side?
        // If income-dominant: all of I_i flows (E-share + savings-share) → source budget = I_i.
        // If expense-dominant: the portion of I_i that covers expense.
        const sourceBudget =
          totalIncome >= totalExpense
            ? inc.amount_minor
            : (inc.amount_minor * totalExpense) / totalIncome;

        let savingsAmt = 0n;
        if (savings > 0n && totalIncome > 0n) {
          savingsAmt = (inc.amount_minor * savings) / totalIncome;
        }

        // Reconcile drift: all expense-links + savings should equal sourceBudget.
        const allocated =
          perSource.reduce((a, l) => a + l.amount, 0n) +
          (savings > 0n ? savingsAmt : 0n);
        const drift = sourceBudget - allocated;
        if (drift !== 0n) {
          // Find the largest link (by expense share) and add the drift.
          let largestIdx = 0;
          for (let i = 1; i < perSource.length; i += 1) {
            if ((perSource[i]?.expense ?? 0n) > (perSource[largestIdx]?.expense ?? 0n)) {
              largestIdx = i;
            }
          }
          const target = perSource[largestIdx];
          if (target) target.amount += drift;
          else savingsAmt += drift;
        }

        for (const link of perSource) {
          if (link.amount > 0n) {
            links.push({
              source: `income:${inc.category_id}`,
              target: link.target,
              amountMinor: link.amount.toString(),
            });
          }
        }
        if (savingsAmt > 0n) {
          links.push({
            source: `income:${inc.category_id}`,
            target: 'savings',
            amountMinor: savingsAmt.toString(),
          });
        }
      }
    } else if (totalIncome > 0n && savings > 0n) {
      // Only-income case: every income goes to savings.
      for (const inc of incomeRows) {
        links.push({
          source: `income:${inc.category_id}`,
          target: 'savings',
          amountMinor: inc.amount_minor.toString(),
        });
      }
    }

    this.logIfSlow('sankey', started);
    return {
      period: toRange(q.period, from, to),
      currencyCode: resolvedCurrency,
      nodes,
      links,
    };
  }

  private async sankeySideRows(
    householdId: string,
    from: Date,
    to: Date,
    currencyCode: string,
    type: 'INCOME' | 'EXPENSE',
  ): Promise<SankeySideRow[]> {
    return this.prisma.$queryRaw<SankeySideRow[]>`
      SELECT
        c.id          AS category_id,
        c.label       AS label,
        c.icon_token  AS icon_token,
        c.color_token AS color_token,
        SUM(t.amount_minor)::bigint AS amount_minor
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE t.household_id = ${householdId}
        AND t.deleted_at IS NULL
        AND t.transfer_id IS NULL
        AND t.type = ${type}
        AND t.currency_code = ${currencyCode}
        AND t.occurred_at >= ${from}
        AND t.occurred_at <  ${to}
      GROUP BY c.id, c.label, c.icon_token, c.color_token
      ORDER BY amount_minor DESC
    `;
  }

  // ─── shared helpers ──────────────────────────────────────────────────────

  private resolvePeriodOrThrow(
    kind: StatsPeriodKind,
    fromRaw?: string,
    toRaw?: string,
  ): { from: Date; to: Date } {
    if (kind === 'custom') {
      if (!fromRaw || !toRaw) {
        throw Errors.validation(
          'period=custom requires both from and to.',
          { fields: ['from', 'to'] },
        );
      }
      const from = new Date(fromRaw);
      const to = new Date(toRaw);
      if (
        Number.isNaN(from.getTime()) ||
        Number.isNaN(to.getTime()) ||
        from.getTime() >= to.getTime()
      ) {
        throw Errors.validation('Custom period must satisfy from < to.');
      }
      if (to.getTime() - from.getTime() > MAX_CUSTOM_SPAN_MS) {
        throw Errors.validation('Custom period span must be ≤ 2 years.');
      }
      return { from, to };
    }
    return resolveStatsPeriod(kind, new Date());
  }

  private validateCurrency(code?: string): string | null {
    if (!code) return null;
    if (!isSupportedCurrency(code)) {
      throw Errors.currencyUnsupported(code);
    }
    return code;
  }

  /**
   * Primary currency resolution per spec §Primary currency resolution:
   *   1. household.default_currency_code IF there is ≥1 tx in that currency.
   *   2. Else, currency with the largest SUM(amountMinor) across EXPENSE+INCOME.
   *   3. Else null (caller falls back to household.default_currency_code).
   */
  private async resolvePrimaryCurrency(
    householdId: string,
    from: Date,
    to: Date,
  ): Promise<string | null> {
    const [defaultCur, rows] = await Promise.all([
      this.householdDefaultCurrency(householdId),
      this.prisma.$queryRaw<
        Array<{ currency_code: string; total_minor: bigint }>
      >`
        SELECT
          currency_code,
          SUM(amount_minor)::bigint AS total_minor
        FROM transactions
        WHERE household_id = ${householdId}
          AND deleted_at IS NULL
          AND transfer_id IS NULL
          AND type IN ('INCOME','EXPENSE')
          AND occurred_at >= ${from}
          AND occurred_at <  ${to}
        GROUP BY currency_code
        ORDER BY total_minor DESC
      `,
    ]);
    if (rows.length === 0) return null;
    if (defaultCur && rows.some((r) => r.currency_code === defaultCur)) {
      return defaultCur;
    }
    return rows[0]?.currency_code ?? null;
  }

  private async householdDefaultCurrency(householdId: string): Promise<string> {
    const row = await this.prisma.household.findFirst({
      where: { id: householdId },
      select: { defaultCurrencyCode: true },
    });
    if (!row) throw Errors.notFound();
    return row.defaultCurrencyCode;
  }

  private logIfSlow(name: string, startedMs: number) {
    const elapsed = Date.now() - startedMs;
    if (elapsed > SLOW_QUERY_MS) {
      this.logger.warn(`stats.${name} slow query elapsed_ms=${elapsed}`);
    }
  }
}

// ─── pure helpers ──────────────────────────────────────────────────────────

function toRange(kind: StatsPeriodKind, from: Date, to: Date): StatsPeriodRangeDTO {
  return { kind, from: from.toISOString(), to: to.toISOString() };
}

function monthKey(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}`;
}

function dateKey(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Signed floor percent delta. Returns null when previous = 0 (caller assigns
 * a deltaState accordingly).
 */
function deltaPercent(current: bigint, previous: bigint): number | null {
  if (previous === 0n) return null;
  // Math: floor((curr - prev) * 100 / prev). BigInt division truncates toward
  // zero; adjust for negatives to produce mathematical floor.
  const num = (current - previous) * 100n;
  const q = num / previous;
  const r = num % previous;
  // If remainder has opposite sign to previous and is non-zero, truncation
  // moved toward zero → subtract 1 to floor.
  const needsFloor = r !== 0n && (r < 0n) !== (previous < 0n);
  const floored = needsFloor ? q - 1n : q;
  return Number(floored);
}

/**
 * Per the contract's single-state PeriodDeltaState: the bucket-level state
 * summarises the meaning of the delta fields as a whole.
 *   - `no_previous_data` — previous sums all zero (deltas null).
 *   - `zero_to_positive` — previous all zero, net > 0 (income/expense deltas
 *     also null; net delta null).
 *   - `zero_to_negative` — previous all zero, net < 0.
 *   - `has_previous` — at least one previous sum > 0 (or previous is zero for
 *     one metric but the aggregate isn't all-zero; delta for the zero metric
 *     is individually null per deltaPercent(), consistent with the state).
 */
function pickDeltaState(
  income: bigint,
  expense: bigint,
  net: bigint,
  pIncome: bigint,
  pExpense: bigint,
  pNet: bigint,
): PeriodDeltaState {
  const prevAllZero = pIncome === 0n && pExpense === 0n && pNet === 0n;
  if (prevAllZero) {
    if (income === 0n && expense === 0n && net === 0n) return 'no_previous_data';
    if (net > 0n) return 'zero_to_positive';
    if (net < 0n) return 'zero_to_negative';
    // All current zero but one of the totals is non-zero? impossible when all
    // three current are zero. If income==expense != 0 → net=0 → treat as
    // zero_to_positive (activity exists).
    return 'zero_to_positive';
  }
  return 'has_previous';
}
