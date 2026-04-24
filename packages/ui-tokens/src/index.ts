// Design tokens ported from the Nayanam prototype (tokens.jsx)
// Consumed by web Tailwind config and mobile NativeWind Tailwind config
// so a single source drives colors/spacing/typography across surfaces.

export const ACCENTS = {
  indigo: { name: 'Indigo', hex: '#0A84FF', soft: '#E6F0FF' },
  violet: { name: 'Violet', hex: '#6D28D9', soft: '#EEE6FB' },
  emerald: { name: 'Emerald', hex: '#10B981', soft: '#D7F4E9' },
  coral: { name: 'Coral', hex: '#F25F3A', soft: '#FDE3DB' },
  ink: { name: 'Ink', hex: '#111111', soft: '#E8E8EA' },
} as const;

export type AccentKey = keyof typeof ACCENTS;
export type Mode = 'light' | 'dark';

export const LIGHT = {
  bg: '#F5F5F2',
  surface: '#FFFFFF',
  surfaceAlt: '#FAFAF7',
  surfaceRaised: '#FFFFFF',
  text: '#0E0E10',
  textDim: 'rgba(14,14,16,0.60)',
  textFaint: 'rgba(14,14,16,0.38)',
  border: 'rgba(14,14,16,0.08)',
  borderStrong: 'rgba(14,14,16,0.14)',
  negative: '#E85A3C',
  positive: '#0E9F6E',
  chipBg: 'rgba(14,14,16,0.04)',
} as const;

export const DARK = {
  bg: '#0B0B0D',
  surface: '#141417',
  surfaceAlt: '#1C1C20',
  surfaceRaised: '#202026',
  text: '#F5F5F6',
  textDim: 'rgba(245,245,246,0.62)',
  textFaint: 'rgba(245,245,246,0.38)',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  negative: '#FF6B4A',
  positive: '#30D18A',
  chipBg: 'rgba(255,255,255,0.06)',
} as const;

export const RADIUS = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 9999,
} as const;

export const SPACING = {
  '0': 0,
  '1': 4,
  '2': 8,
  '3': 12,
  '4': 16,
  '5': 20,
  '6': 24,
  '8': 32,
  '10': 40,
  '12': 48,
  '16': 64,
} as const;

export const TYPOGRAPHY = {
  fontFamily: {
    sans: ['Geist', 'system-ui', '-apple-system', 'sans-serif'],
    mono: ['Geist Mono', 'ui-monospace', 'monospace'],
  },
  fontSize: {
    xs: 11,
    sm: 13,
    base: 15,
    lg: 17,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
  },
} as const;

export const CATEGORIES = {
  Grocery:       { tint: '#E3F1E8', ink: '#0E9F6E', icon: 'cart' },
  Streaming:     { tint: '#FCE4E0', ink: '#E85A3C', icon: 'play' },
  Transfer:      { tint: '#E6F0FF', ink: '#0A84FF', icon: 'arrows' },
  Coffee:        { tint: '#F0E7DC', ink: '#8A5A2B', icon: 'cup' },
  Dining:        { tint: '#FCEBDF', ink: '#C6671F', icon: 'fork' },
  Transport:     { tint: '#E7E8FF', ink: '#4B4FD1', icon: 'car' },
  Utilities:     { tint: '#EFE7FB', ink: '#6D28D9', icon: 'bolt' },
  Rent:          { tint: '#EAEAEA', ink: '#2A2A2A', icon: 'home' },
  Shopping:      { tint: '#FDE8F0', ink: '#C53A74', icon: 'bag' },
  Fitness:       { tint: '#E3F3E6', ink: '#3E9B5C', icon: 'dumbbell' },
  Salary:        { tint: '#DDF1E4', ink: '#0E9F6E', icon: 'wage' },
  Freelance:     { tint: '#E0EEFF', ink: '#0A84FF', icon: 'briefcase' },
  Investment:    { tint: '#E8E2F7', ink: '#6D28D9', icon: 'chart' },
  Health:        { tint: '#FFE5E5', ink: '#D13B3B', icon: 'heart' },
  Education:     { tint: '#E8EEFF', ink: '#3B5BDB', icon: 'book' },
  Entertainment: { tint: '#F2E4FC', ink: '#8A3AC0', icon: 'music' },
} as const;

export type CategoryKey = keyof typeof CATEGORIES;

// ─────────────────────────────────────────────────────────────
// Account design tokens — consumed by web Cards screen and mobile
// Cards screen to render card-art gradients and picker chips.
// The 8 `account.colors` pairs and 5 `account.icons` keys are
// frozen for Phase 2 (see spec §"Scope by surface").
// ─────────────────────────────────────────────────────────────

export const ACCOUNT_COLORS = {
  indigo:   { name: 'Indigo',   from: '#4F46E5', to: '#1E1B4B' },
  teal:     { name: 'Teal',     from: '#14B8A6', to: '#0F3D3B' },
  rose:     { name: 'Rose',     from: '#F43F5E', to: '#6B1729' },
  amber:    { name: 'Amber',    from: '#F59E0B', to: '#78350F' },
  violet:   { name: 'Violet',   from: '#8B5CF6', to: '#3B1E6E' },
  graphite: { name: 'Graphite', from: '#3F3F46', to: '#111113' },
  emerald:  { name: 'Emerald',  from: '#10B981', to: '#064E3B' },
  sky:      { name: 'Sky',      from: '#0EA5E9', to: '#0C3654' },
} as const;

export type AccountColorToken = keyof typeof ACCOUNT_COLORS;

export const ACCOUNT_COLOR_TOKENS = Object.keys(
  ACCOUNT_COLORS,
) as AccountColorToken[];

export const ACCOUNT_ICONS = {
  'wallet':      { name: 'Wallet' },
  'credit-card': { name: 'Credit card' },
  'piggy-bank':  { name: 'Piggy bank' },
  'cash':        { name: 'Cash' },
  'bank':        { name: 'Bank' },
} as const;

export type AccountIconToken = keyof typeof ACCOUNT_ICONS;

export const ACCOUNT_ICON_TOKENS = Object.keys(
  ACCOUNT_ICONS,
) as AccountIconToken[];

export const DEFAULT_ACCOUNT_COLOR: AccountColorToken = 'indigo';
export const DEFAULT_ACCOUNT_ICON: AccountIconToken = 'wallet';

export const account = {
  colors: ACCOUNT_COLORS,
  icons: ACCOUNT_ICONS,
  defaultColor: DEFAULT_ACCOUNT_COLOR,
  defaultIcon: DEFAULT_ACCOUNT_ICON,
} as const;

// ─────────────────────────────────────────────────────────────
// Category design tokens — consumed by web Transactions +
// Categories screens and mobile counterparts. Each token pair
// is (solid ink, soft tint) for the circular icon chip; the
// palette is deliberately broader than `account.colors` to
// distinguish the 33 seeded system categories at a glance.
// ─────────────────────────────────────────────────────────────

export const CATEGORY_COLORS = {
  slate:    { name: 'Slate',    ink: '#475569', soft: '#E2E8F0' },
  graphite: { name: 'Graphite', ink: '#3F3F46', soft: '#E4E4E7' },
  rose:     { name: 'Rose',     ink: '#E11D48', soft: '#FFE4E6' },
  red:      { name: 'Red',      ink: '#DC2626', soft: '#FEE2E2' },
  orange:   { name: 'Orange',   ink: '#EA580C', soft: '#FFEDD5' },
  amber:    { name: 'Amber',    ink: '#D97706', soft: '#FEF3C7' },
  yellow:   { name: 'Yellow',   ink: '#CA8A04', soft: '#FEF9C3' },
  lime:     { name: 'Lime',     ink: '#65A30D', soft: '#ECFCCB' },
  emerald:  { name: 'Emerald',  ink: '#059669', soft: '#D1FAE5' },
  teal:     { name: 'Teal',     ink: '#0D9488', soft: '#CCFBF1' },
  cyan:     { name: 'Cyan',     ink: '#0891B2', soft: '#CFFAFE' },
  sky:      { name: 'Sky',      ink: '#0284C7', soft: '#E0F2FE' },
  blue:     { name: 'Blue',     ink: '#2563EB', soft: '#DBEAFE' },
  indigo:   { name: 'Indigo',   ink: '#4F46E5', soft: '#E0E7FF' },
  violet:   { name: 'Violet',   ink: '#7C3AED', soft: '#EDE9FE' },
  fuchsia:  { name: 'Fuchsia',  ink: '#C026D3', soft: '#FAE8FF' },
} as const;

export type CategoryColorToken = keyof typeof CATEGORY_COLORS;

export const CATEGORY_COLOR_TOKENS = Object.keys(
  CATEGORY_COLORS,
) as CategoryColorToken[];

// Category icon tokens. Names match lucide-react component names lowercased
// and kebab-cased (web uses `lucide-react`, mobile uses `lucide-react-native`).
// The set is frozen for Phase 3; extensions ship in later phases.
export const CATEGORY_ICONS = {
  'tag':                     { name: 'Tag' },
  'shopping-cart':           { name: 'Shopping cart' },
  'shopping-bag':            { name: 'Shopping bag' },
  'utensils':                { name: 'Utensils' },
  'bus':                     { name: 'Bus' },
  'fuel':                    { name: 'Fuel' },
  'home':                    { name: 'Home' },
  'lightbulb':               { name: 'Lightbulb' },
  'wifi':                    { name: 'Wi-Fi' },
  'smartphone':              { name: 'Smartphone' },
  'heart-pulse':             { name: 'Health' },
  'dumbbell':                { name: 'Dumbbell' },
  'book-open':               { name: 'Book' },
  'film':                    { name: 'Film' },
  'refresh-ccw':             { name: 'Subscriptions' },
  'plane':                   { name: 'Plane' },
  'shield':                  { name: 'Shield' },
  'receipt':                 { name: 'Receipt' },
  'gift':                    { name: 'Gift' },
  'heart':                   { name: 'Heart' },
  'baby':                    { name: 'Baby' },
  'paw-print':               { name: 'Paw print' },
  'scissors':                { name: 'Scissors' },
  'hammer':                  { name: 'Hammer' },
  'banknote':                { name: 'Banknote' },
  'ellipsis':                { name: 'Ellipsis' },
  'wallet':                  { name: 'Wallet' },
  'trophy':                  { name: 'Trophy' },
  'briefcase':               { name: 'Briefcase' },
  'trending-up':             { name: 'Trending up' },
  'percent':                 { name: 'Percent' },
  'undo-2':                  { name: 'Refund' },
  'arrow-right-arrow-left':  { name: 'Transfer' },
} as const;

export type CategoryIconToken = keyof typeof CATEGORY_ICONS;

export const CATEGORY_ICON_TOKENS = Object.keys(
  CATEGORY_ICONS,
) as CategoryIconToken[];

export const DEFAULT_CATEGORY_COLOR: CategoryColorToken = 'graphite';
export const DEFAULT_CATEGORY_ICON: CategoryIconToken = 'tag';

export const category = {
  colors: CATEGORY_COLORS,
  icons: CATEGORY_ICONS,
  defaultColor: DEFAULT_CATEGORY_COLOR,
  defaultIcon: DEFAULT_CATEGORY_ICON,
} as const;

// ─────────────────────────────────────────────────────────────
// Bill cycle tokens — consumed by web Bills + mobile Bills to
// render a per-cycle icon chip on bill rows. Icon names match
// lucide-react component names (kebab-case).
// ─────────────────────────────────────────────────────────────

export const CYCLE_ICONS = {
  WEEKLY:      'calendar-clock',
  MONTHLY:     'calendar-days',
  QUARTERLY:   'calendar-range',
  YEARLY:      'calendar-check',
  CUSTOM_DAYS: 'calendar-plus',
} as const;

export type CycleKey = keyof typeof CYCLE_ICONS;
export type CycleIconToken = (typeof CYCLE_ICONS)[CycleKey];

export const cycle = {
  icons: CYCLE_ICONS,
} as const;

export const tokens = {
  accents: ACCENTS,
  light: LIGHT,
  dark: DARK,
  radius: RADIUS,
  spacing: SPACING,
  typography: TYPOGRAPHY,
  categories: CATEGORIES,
  account,
  category,
  cycle,
} as const;
