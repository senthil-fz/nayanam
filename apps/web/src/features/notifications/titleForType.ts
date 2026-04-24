// Map a notification `type` + `payload` to display strings. Tolerates missing
// payload fields — the server may emit notifications with partial payloads on
// race conditions, and the UI must never crash.

export type NotificationDisplay = {
  title: string;
  subtitle?: string;
};

function str(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function num(payload: Record<string, unknown>, key: string): number | null {
  const v = payload[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function titleCase(s: string): string {
  return s
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function titleForType(
  type: string,
  payload: Record<string, unknown>,
): NotificationDisplay {
  switch (type) {
    case 'bill.due_soon': {
      const name = str(payload, 'billName') ?? str(payload, 'name');
      const days = num(payload, 'daysUntilDue');
      const subtitle =
        name && days !== null
          ? `${name} due in ${days} day${days === 1 ? '' : 's'}`
          : name
            ? `${name} due soon`
            : undefined;
      return {
        title: name ? `Upcoming bill: ${name}` : 'Upcoming bill',
        subtitle,
      };
    }
    case 'bill.overdue': {
      const name = str(payload, 'billName') ?? str(payload, 'name');
      const days = num(payload, 'daysOverdue');
      const subtitle =
        name && days !== null
          ? `${name} was due ${days} day${days === 1 ? '' : 's'} ago`
          : name
            ? `${name} is overdue`
            : undefined;
      return {
        title: name ? `Bill overdue: ${name}` : 'Bill overdue',
        subtitle,
      };
    }
    case 'bill.paid': {
      const name = str(payload, 'billName') ?? str(payload, 'name');
      return {
        title: 'Bill paid',
        subtitle: name ?? undefined,
      };
    }
    case 'budget.threshold_fired': {
      const label =
        str(payload, 'categoryLabel') ??
        str(payload, 'budgetName') ??
        'Budget';
      const threshold = num(payload, 'threshold') ?? num(payload, 'thresholdPct');
      return {
        title: threshold !== null
          ? `${label} budget: ${threshold}% used`
          : `${label} budget threshold reached`,
      };
    }
    case 'budget.auto_archived': {
      const label = str(payload, 'categoryLabel') ?? str(payload, 'budgetName');
      return {
        title: label ? `Budget archived: ${label}` : 'Budget archived',
        subtitle: 'Category deleted',
      };
    }
    case 'transaction.created': {
      return { title: 'New transaction' };
    }
    default: {
      const parts = type.split('.');
      const friendly = parts.length > 1
        ? `${titleCase(parts[0]!)} — ${titleCase(parts.slice(1).join(' '))}`
        : titleCase(type);
      return { title: friendly || 'Activity' };
    }
  }
}
