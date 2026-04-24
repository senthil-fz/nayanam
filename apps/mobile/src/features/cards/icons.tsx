// Inline SVG icons — ports of the prototype's Icon set (`components/ui.jsx`).
// Using react-native-svg lets us keep the exact paths from the web version.

import Svg, { Path, Circle, G } from 'react-native-svg';

type Props = { size?: number; color?: string; strokeWidth?: number };

const S = ({ size = 22, color = '#0E0E10', strokeWidth = 1.75, children }: Props & { children: React.ReactNode }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">{children}</Svg>
);

export const HomeIcon = ({ size, color, strokeWidth }: Props) => (
  <S size={size} color={color} strokeWidth={strokeWidth}>
    <Path d="M3 11l9-7 9 7v10a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1V11z" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </S>
);
export const StatsIcon = ({ size, color, strokeWidth }: Props) => (
  <S size={size} color={color} strokeWidth={strokeWidth}>
    <Path d="M4 20V10M10 20V4M16 20v-6M4 20h18" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </S>
);
export const BillsIcon = ({ size, color, strokeWidth }: Props) => (
  <S size={size} color={color} strokeWidth={strokeWidth}>
    <Path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3z" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M8 8h8M8 12h8M8 16h5" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </S>
);
export const CardIcon = ({ size, color, strokeWidth }: Props) => (
  <S size={size} color={color} strokeWidth={strokeWidth}>
    <Path d="M3 8h18v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M3 8V7a2 2 0 012-2h14a2 2 0 012 2v1M7 16h4" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </S>
);
export const SettingsIcon = ({ size, color, strokeWidth }: Props) => (
  <S size={size} color={color} strokeWidth={strokeWidth}>
    <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={strokeWidth} fill="none"/>
    <Path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </S>
);
export const PlusIcon = ({ size, color, strokeWidth }: Props) => (
  <S size={size} color={color} strokeWidth={strokeWidth}>
    <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </S>
);
export const ChevRIcon = ({ size, color, strokeWidth }: Props) => (
  <S size={size} color={color} strokeWidth={strokeWidth}>
    <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </S>
);
export const ChevLIcon = ({ size, color, strokeWidth }: Props) => (
  <S size={size} color={color} strokeWidth={strokeWidth}>
    <Path d="M15 6l-6 6 6 6" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </S>
);
export const SendIcon = ({ size, color, strokeWidth }: Props) => (
  <S size={size} color={color} strokeWidth={strokeWidth}>
    <Path d="M3 12l18-9-4 18-5-7-9-2z" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </S>
);
export const TopupIcon = ({ size, color, strokeWidth }: Props) => (
  <S size={size} color={color} strokeWidth={strokeWidth}>
    <Path d="M12 19V5M6 11l6-6 6 6" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </S>
);
export const FlashIcon = ({ size, color, strokeWidth }: Props) => (
  <S size={size} color={color} strokeWidth={strokeWidth}>
    <Path d="M11 3L4 14h6l-1 7 8-12h-6l1-6z" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </S>
);
export const LockIcon = ({ size, color, strokeWidth }: Props) => (
  <S size={size} color={color} strokeWidth={strokeWidth}>
    <Path d="M6 10h12v10H6V10zM8 10V7a4 4 0 118 0v3" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </S>
);
export const TrashIcon = ({ size, color, strokeWidth }: Props) => (
  <S size={size} color={color} strokeWidth={strokeWidth}>
    <Path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </S>
);
export const WalletIcon = ({ size, color, strokeWidth }: Props) => (
  <S size={size} color={color} strokeWidth={strokeWidth}>
    <Path d="M3 7h16a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M3 7V5a2 2 0 012-2h11v4" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    <Circle cx="17" cy="14" r="1.5" fill={color}/>
  </S>
);
export const PiggyIcon = ({ size, color, strokeWidth }: Props) => (
  <S size={size} color={color} strokeWidth={strokeWidth}>
    <Path d="M4 13c0-3 3-5 7-5s7 2 7 5v4h-2l-1 2h-2l-1-2h-2l-1 2H7l-1-2H4v-4zM16 10V7" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    <Circle cx="8" cy="12" r="1" fill={color}/>
  </S>
);
export const CashIcon = ({ size, color, strokeWidth }: Props) => (
  <S size={size} color={color} strokeWidth={strokeWidth}>
    <Path d="M3 7h18v10H3V7z" stroke={color} strokeWidth={strokeWidth} fill="none"/>
    <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={strokeWidth} fill="none"/>
  </S>
);
export const BankIcon = ({ size, color, strokeWidth }: Props) => (
  <S size={size} color={color} strokeWidth={strokeWidth}>
    <Path d="M3 10l9-6 9 6v1H3v-1zM5 11v8M9 11v8M15 11v8M19 11v8M3 20h18" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </S>
);

export function AccountIcon({
  token,
  size = 18,
  color = '#0E0E10',
}: { token: string } & Props) {
  switch (token) {
    case 'credit-card': return <CardIcon size={size} color={color} />;
    case 'piggy-bank':  return <PiggyIcon size={size} color={color} />;
    case 'cash':        return <CashIcon size={size} color={color} />;
    case 'bank':        return <BankIcon size={size} color={color} />;
    case 'wallet':
    default:            return <WalletIcon size={size} color={color} />;
  }
}
