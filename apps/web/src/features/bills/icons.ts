// Map cycle icon tokens (from @nayanam/ui-tokens) to lucide-react components.

import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  type LucideIcon,
} from 'lucide-react';
import { CYCLE_ICONS, type CycleKey } from '@nayanam/ui-tokens';

const BY_TOKEN: Record<string, LucideIcon> = {
  'calendar-clock': CalendarClock,
  'calendar-days': CalendarDays,
  'calendar-range': CalendarRange,
  'calendar-check': CalendarCheck,
  'calendar-plus': CalendarPlus,
};

export function cycleIconFor(cycle: CycleKey): LucideIcon {
  const token = CYCLE_ICONS[cycle];
  return BY_TOKEN[token] ?? CalendarDays;
}
