import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type NotificationPreferencesDTO = {
  pushBillsEnabled: boolean;
  pushBudgetsEnabled: boolean;
  pushHouseholdActivityEnabled: boolean;
  pushWeeklySummaryEnabled: boolean;
  emailBillsEnabled: boolean;
  emailBudgetsEnabled: boolean;
  emailHouseholdActivityEnabled: boolean;
  emailWeeklySummaryEnabled: boolean;
  updatedAt: string;
};

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<NotificationPreferencesDTO> {
    const row = await this.prisma.userNotificationPreferences.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    return this.toDTO(row);
  }

  async update(
    userId: string,
    patch: Partial<Omit<NotificationPreferencesDTO, 'updatedAt'>>,
  ): Promise<{ dto: NotificationPreferencesDTO; changed: string[] }> {
    const existing = await this.prisma.userNotificationPreferences.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    const changed: string[] = [];
    const data: Record<string, boolean | Date> = {};
    for (const k of Object.keys(patch) as Array<keyof typeof patch>) {
      const v = patch[k];
      if (typeof v === 'boolean' && existing[k] !== v) {
        data[k as string] = v;
        changed.push(k);
      }
    }
    if (changed.length === 0) {
      return { dto: this.toDTO(existing), changed: [] };
    }
    data.updatedAt = new Date();
    const updated = await this.prisma.userNotificationPreferences.update({
      where: { userId },
      data,
    });
    return { dto: this.toDTO(updated), changed };
  }

  private toDTO(row: {
    pushBillsEnabled: boolean;
    pushBudgetsEnabled: boolean;
    pushHouseholdActivityEnabled: boolean;
    pushWeeklySummaryEnabled: boolean;
    emailBillsEnabled: boolean;
    emailBudgetsEnabled: boolean;
    emailHouseholdActivityEnabled: boolean;
    emailWeeklySummaryEnabled: boolean;
    updatedAt: Date;
  }): NotificationPreferencesDTO {
    return {
      pushBillsEnabled: row.pushBillsEnabled,
      pushBudgetsEnabled: row.pushBudgetsEnabled,
      pushHouseholdActivityEnabled: row.pushHouseholdActivityEnabled,
      pushWeeklySummaryEnabled: row.pushWeeklySummaryEnabled,
      emailBillsEnabled: row.emailBillsEnabled,
      emailBudgetsEnabled: row.emailBudgetsEnabled,
      emailHouseholdActivityEnabled: row.emailHouseholdActivityEnabled,
      emailWeeklySummaryEnabled: row.emailWeeklySummaryEnabled,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
