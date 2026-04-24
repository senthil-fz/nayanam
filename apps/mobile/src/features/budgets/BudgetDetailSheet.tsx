// Detail sheet for a budget. Shows the last 6 period buckets as paired
// bars (spent vs effective ceiling) using react-native-svg, plus the
// role-gated Pause/Resume/Archive actions along the bottom.

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import Svg, { Rect } from 'react-native-svg';
import { Archive, Pause, Pencil, Play } from 'lucide-react-native';
import type {
  Budget,
  BudgetHistoryPeriodType,
  BudgetsStatusItemType,
  Category,
} from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import {
  CATEGORY_COLORS,
  type CategoryColorToken,
  LIGHT,
} from '@nayanam/ui-tokens';
import {
  useArchiveBudget,
  useBudgetHistory,
  usePauseBudget,
  useResumeBudget,
} from '../../lib/hooks';
import { hapticError, hapticSuccess } from '../../lib/haptics';
import { categoryIconFor } from '../categories/icons';
import { HouseholdBudgetIcon } from './icons';
import { BudgetProgressBar } from './BudgetProgressBar';
import { periodLabel, progressColor } from './format';

export type BudgetDetailSheetPresentArgs = {
  item: BudgetsStatusItemType;
  category: Category | null;
};

export type BudgetDetailSheetHandle = {
  present: (args: BudgetDetailSheetPresentArgs) => void;
  dismiss: () => void;
};

type Props = {
  canArchive: boolean;
  canPauseResume: boolean;
  onEdit: (budget: Budget) => void;
};

export const BudgetDetailSheet = forwardRef<BudgetDetailSheetHandle, Props>(
  function BudgetDetailSheet({ canArchive, canPauseResume, onEdit }, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['85%'], []);
    const [state, setState] = useState<{
      item: BudgetsStatusItemType;
      category: Category | null;
    } | null>(null);

    const historyQuery = useBudgetHistory(state?.item.budget.id, 6);
    const pauseMut = usePauseBudget();
    const resumeMut = useResumeBudget();
    const archiveMut = useArchiveBudget();

    useImperativeHandle(ref, () => ({
      present: (args) => {
        setState(args);
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.4}
        />
      ),
      [],
    );

    const run = useCallback(async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        hapticSuccess();
      } catch (err) {
        hapticError();
        Alert.alert('Something went wrong', (err as Error).message ?? '');
      }
    }, []);

    if (!state) {
      return (
        <BottomSheetModal
          ref={sheetRef}
          snapPoints={snapPoints}
          enablePanDownToClose
          backdropComponent={renderBackdrop}
          backgroundStyle={{ backgroundColor: LIGHT.bg }}
          handleIndicatorStyle={{ backgroundColor: LIGHT.border }}
        >
          <View style={{ padding: 20 }} />
        </BottomSheetModal>
      );
    }

    const { item, category } = state;
    const { budget, progressPercent } = item;
    const tint = progressColor(progressPercent);
    const paused = budget.status === 'PAUSED';

    const isHousehold = budget.scope === 'HOUSEHOLD';
    const Icon = isHousehold
      ? HouseholdBudgetIcon
      : category
        ? categoryIconFor(category.iconToken)
        : HouseholdBudgetIcon;
    const colorToken: CategoryColorToken =
      !isHousehold &&
      category?.colorToken &&
      category.colorToken in CATEGORY_COLORS
        ? (category.colorToken as CategoryColorToken)
        : 'indigo';
    const { ink, soft } = CATEGORY_COLORS[colorToken];

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: LIGHT.bg }}
        handleIndicatorStyle={{ backgroundColor: LIGHT.border }}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: soft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={20} color={ink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontSize: 20, fontWeight: '700', color: LIGHT.text }}
              >
                {budget.name}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: LIGHT.textFaint,
                  fontFamily: 'Geist Mono',
                  letterSpacing: 0.4,
                  marginTop: 2,
                  textTransform: 'uppercase',
                }}
              >
                {periodLabel(budget.period)} · {budget.currencyCode}
                {budget.rollover ? ' · ROLLOVER' : ''}
                {paused ? ' · PAUSED' : ''}
              </Text>
            </View>
          </View>

          {/* Current period summary */}
          <View
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: 14,
              backgroundColor: LIGHT.surface,
              borderWidth: 1,
              borderColor: LIGHT.border,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                color: LIGHT.textDim,
                fontFamily: 'Geist Mono',
                letterSpacing: 0.4,
                textTransform: 'uppercase',
              }}
            >
              This period
            </Text>
            <Text
              style={{
                marginTop: 4,
                fontSize: 18,
                fontWeight: '700',
                color: LIGHT.text,
                fontFamily: 'Geist Mono',
              }}
            >
              {formatMoney(item.spentMinor, budget.currencyCode)}
              {'  of  '}
              {formatMoney(item.effectiveAmountMinor, budget.currencyCode)}
            </Text>
            <View style={{ marginTop: 10 }}>
              <BudgetProgressBar percent={progressPercent} height={6} />
            </View>
            <Text
              style={{
                marginTop: 8,
                fontSize: 12,
                color: tint.fg,
                fontFamily: 'Geist Mono',
                letterSpacing: 0.3,
              }}
            >
              {progressPercent}% · {tint.label}
            </Text>
            {item.thresholdsFired.length > 0 ? (
              <Text
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  color: LIGHT.textFaint,
                }}
              >
                Thresholds fired: {item.thresholdsFired.join(', ')}%
              </Text>
            ) : null}
          </View>

          {/* History */}
          <Text
            style={{
              marginTop: 20,
              color: LIGHT.textFaint,
              fontFamily: 'Geist Mono',
              letterSpacing: 0.4,
              fontSize: 11,
              textTransform: 'uppercase',
            }}
          >
            Last 6 periods
          </Text>
          <HistoryChart periods={historyQuery.data?.periods ?? []} />

          {/* Actions */}
          <View style={{ marginTop: 20, gap: 10 }}>
            <FooterButton
              icon={Pencil}
              label="Edit budget"
              onPress={() => {
                sheetRef.current?.dismiss();
                setTimeout(() => onEdit(budget), 80);
              }}
            />
            {canPauseResume ? (
              paused ? (
                <FooterButton
                  icon={Play}
                  label="Resume"
                  onPress={() =>
                    void run(() =>
                      resumeMut.mutateAsync({ budgetId: budget.id }),
                    )
                  }
                />
              ) : (
                <FooterButton
                  icon={Pause}
                  label="Pause"
                  onPress={() =>
                    void run(() =>
                      pauseMut.mutateAsync({ budgetId: budget.id }),
                    )
                  }
                />
              )
            ) : null}
            {canArchive ? (
              <FooterButton
                icon={Archive}
                label="Archive"
                tone="danger"
                onPress={() =>
                  void run(() =>
                    archiveMut.mutateAsync({ budgetId: budget.id }),
                  )
                }
              />
            ) : null}
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);

function HistoryChart({ periods }: { periods: BudgetHistoryPeriodType[] }) {
  if (periods.length === 0) {
    return (
      <View style={{ paddingVertical: 20 }}>
        <Text style={{ color: LIGHT.textDim, fontSize: 12 }}>
          No history yet.
        </Text>
      </View>
    );
  }
  // Periods come newest-first; plot left→right oldest→newest for reading.
  const ordered = periods.slice().reverse();
  const maxVal = ordered.reduce((m, p) => {
    const a = Number(p.effectiveAmountMinor);
    const s = Number(p.spentMinor);
    return Math.max(m, a, s);
  }, 1);
  const width = 300;
  const height = 120;
  const groupW = width / ordered.length;
  const barW = Math.max(4, groupW * 0.35);
  const gap = 3;

  return (
    <View style={{ marginTop: 8 }}>
      <Svg width={width} height={height}>
        {ordered.flatMap((p, i) => {
          const cx = i * groupW + groupW / 2;
          const spent = Number(p.spentMinor);
          const effective = Number(p.effectiveAmountMinor);
          const hS = (spent / maxVal) * (height - 16);
          const hE = (effective / maxVal) * (height - 16);
          const tint = progressColor(
            effective > 0 ? Math.floor((spent / effective) * 100) : 0,
          );
          return [
            <Rect
              key={`e-${p.periodStart}`}
              x={cx - barW - gap / 2}
              y={height - hE - 2}
              width={barW}
              height={hE}
              rx={2}
              fill={LIGHT.chipBg}
            />,
            <Rect
              key={`s-${p.periodStart}`}
              x={cx + gap / 2}
              y={height - hS - 2}
              width={barW}
              height={hS}
              rx={2}
              fill={tint.fg}
            />,
          ];
        })}
      </Svg>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: 4,
        }}
      >
        {ordered.map((p) => (
          <Text
            key={p.periodStart}
            style={{
              flex: 1,
              fontSize: 9,
              color: LIGHT.textFaint,
              fontFamily: 'Geist Mono',
              textAlign: 'center',
            }}
          >
            {formatLabel(p.periodStart)}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 14, marginTop: 10 }}>
        <LegendDot color={LIGHT.chipBg} label="Ceiling" />
        <LegendDot color={LIGHT.positive} label="Spent" />
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }}
      />
      <Text
        style={{
          fontSize: 11,
          color: LIGHT.textDim,
          fontFamily: 'Geist Mono',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function formatLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function FooterButton({
  icon: Icon,
  label,
  onPress,
  tone,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  onPress: () => void;
  tone?: 'danger';
}) {
  const color = tone === 'danger' ? LIGHT.negative : LIGHT.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 13,
        paddingHorizontal: 14,
        borderRadius: 14,
        backgroundColor: pressed ? LIGHT.chipBg : LIGHT.surface,
        borderWidth: 1,
        borderColor: LIGHT.border,
      })}
    >
      <Icon size={18} color={color} />
      <Text style={{ color, fontSize: 15, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}
