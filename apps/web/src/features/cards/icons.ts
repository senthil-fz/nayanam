// Map account icon tokens to lucide-react components. The token set itself
// lives in @nayanam/ui-tokens (ACCOUNT_ICON_TOKENS); this file is the web
// platform's rendering choice for those tokens.

import {
  Banknote,
  CreditCard,
  Landmark,
  PiggyBank,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { AccountIconToken } from '@nayanam/ui-tokens';

export const ICON_COMPONENTS: Record<AccountIconToken, LucideIcon> = {
  'wallet': Wallet,
  'credit-card': CreditCard,
  'piggy-bank': PiggyBank,
  'cash': Banknote,
  'bank': Landmark,
};

export function iconFor(token: string | undefined | null): LucideIcon {
  if (token && token in ICON_COMPONENTS) {
    return ICON_COMPONENTS[token as AccountIconToken];
  }
  return Wallet;
}
