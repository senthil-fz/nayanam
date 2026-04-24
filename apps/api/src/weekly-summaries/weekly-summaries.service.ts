import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type WeeklySummary = {
  weekStartAt: string;
  weekEndAt: string;
  households: Array<{
    householdId: string;
    name: string;
    byCurrency: Array<{
      currencyCode: string;
      incomeMinor: string;
      expenseMinor: string;
      netMinor: string;
      transactionCount: number;
    }>;
  }>;
};

@Injectable()
export class WeeklySummariesService {
  constructor(private readonly prisma: PrismaService) {}

  async computePreviewForUser(userId: string, weekEndingAtISO?: string): Promise<WeeklySummary> {
    const boundaries = this.resolveWeek(weekEndingAtISO);
    const memberships = await this.prisma.householdMember.findMany({
      where: { userId, household: { deletedAt: null } },
      include: { household: true },
      orderBy: { joinedAt: 'asc' },
    });

    const households: WeeklySummary['households'] = [];
    for (const m of memberships) {
      const agg = await this.aggregateForHousehold(
        m.householdId,
        boundaries.weekStart,
        boundaries.weekEnd,
      );
      households.push({
        householdId: m.householdId,
        name: m.household.name,
        byCurrency: agg,
      });
    }

    return {
      weekStartAt: boundaries.weekStart.toISOString(),
      weekEndAt: boundaries.weekEnd.toISOString(),
      households,
    };
  }

  /** Used by the scheduler: sum transactionCount across all households. */
  async totalTransactionsForUser(userId: string, weekStart: Date, weekEnd: Date): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COUNT(*)::bigint AS total
        FROM transactions t
        JOIN household_members hm ON hm.household_id = t.household_id
       WHERE hm.user_id = ${userId}
         AND t.deleted_at IS NULL
         AND t.transfer_id IS NULL
         AND t.occurred_at >= ${weekStart}
         AND t.occurred_at <  ${weekEnd}
    `;
    return Number(rows[0]?.total ?? 0n);
  }

  /** UTC Sunday 00:00 of the most recently ended week, plus its Monday 00:00 start. */
  resolveWeek(weekEndingAtISO?: string): { weekStart: Date; weekEnd: Date } {
    const weekEnd = weekEndingAtISO
      ? new Date(weekEndingAtISO)
      : previousSundayUTC(new Date());
    weekEnd.setUTCHours(0, 0, 0, 0);
    const weekStart = new Date(weekEnd.getTime() - 7 * 86_400_000);
    return { weekStart, weekEnd };
  }

  private async aggregateForHousehold(
    householdId: string,
    weekStart: Date,
    weekEnd: Date,
  ) {
    type Row = {
      currency_code: string;
      income_minor: bigint;
      expense_minor: bigint;
      tx_count: bigint;
    };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT currency_code,
             COALESCE(SUM(CASE WHEN type = 'INCOME'  THEN amount_minor ELSE 0 END), 0)::bigint AS income_minor,
             COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount_minor ELSE 0 END), 0)::bigint AS expense_minor,
             COUNT(*)::bigint AS tx_count
        FROM transactions
       WHERE household_id = ${householdId}
         AND deleted_at IS NULL
         AND transfer_id IS NULL
         AND occurred_at >= ${weekStart}
         AND occurred_at <  ${weekEnd}
       GROUP BY currency_code
       ORDER BY currency_code
    `;
    return rows.map((r) => ({
      currencyCode: r.currency_code,
      incomeMinor: r.income_minor.toString(),
      expenseMinor: r.expense_minor.toString(),
      netMinor: (r.income_minor - r.expense_minor).toString(),
      transactionCount: Number(r.tx_count),
    }));
  }
}

function previousSundayUTC(d: Date): Date {
  // Day-of-week: 0 = Sunday. We want the most recent Sunday 00:00 UTC,
  // where a call on a Sunday before 00:00 still looks at the prior Sunday.
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = copy.getUTCDay();
  const back = day === 0 ? 7 : day; // always step back to the previous Sunday
  return new Date(copy.getTime() - back * 86_400_000);
}
