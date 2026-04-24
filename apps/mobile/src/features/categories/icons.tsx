// Map CategoryIconToken -> lucide-react-native component. Mirrors the web
// mapping in `apps/web/src/features/transactions/icons.ts`. Token set lives
// in `@nayanam/ui-tokens` (frozen for Phase 3).

import {
  ArrowRightLeft,
  Baby,
  Banknote,
  BookOpen,
  Briefcase,
  Bus,
  CreditCard,
  Dumbbell,
  Ellipsis,
  Film,
  Fuel,
  Gift,
  Hammer,
  Heart,
  HeartPulse,
  Home,
  Lightbulb,
  PawPrint,
  Percent,
  Plane,
  Receipt,
  RefreshCcw,
  Scissors,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Tag,
  TrendingUp,
  Trophy,
  Undo2,
  Utensils,
  Wallet,
  Wifi,
  type LucideIcon,
} from 'lucide-react-native';
import type { CategoryIconToken } from '@nayanam/ui-tokens';

export const CATEGORY_ICON_COMPONENTS: Record<CategoryIconToken, LucideIcon> = {
  tag: Tag,
  'shopping-cart': ShoppingCart,
  'shopping-bag': ShoppingBag,
  utensils: Utensils,
  bus: Bus,
  fuel: Fuel,
  home: Home,
  lightbulb: Lightbulb,
  wifi: Wifi,
  smartphone: Smartphone,
  'heart-pulse': HeartPulse,
  dumbbell: Dumbbell,
  'book-open': BookOpen,
  film: Film,
  'refresh-ccw': RefreshCcw,
  plane: Plane,
  shield: Shield,
  receipt: Receipt,
  gift: Gift,
  heart: Heart,
  baby: Baby,
  'paw-print': PawPrint,
  scissors: Scissors,
  hammer: Hammer,
  banknote: Banknote,
  ellipsis: Ellipsis,
  wallet: Wallet,
  trophy: Trophy,
  briefcase: Briefcase,
  'trending-up': TrendingUp,
  percent: Percent,
  'undo-2': Undo2,
  'arrow-right-arrow-left': ArrowRightLeft,
};

export function categoryIconFor(token: string | undefined | null): LucideIcon {
  if (token && token in CATEGORY_ICON_COMPONENTS) {
    return CATEGORY_ICON_COMPONENTS[token as CategoryIconToken];
  }
  // Fallback for forward-compat with seed tokens this client doesn't know yet.
  return CreditCard;
}
