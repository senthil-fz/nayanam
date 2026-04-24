// 2-column grid of up to ~8 top-category tiles. Each tile shows an
// icon chip, the category label, amount, percent-of-total, and a real
// 30-day sparkline from a SINGLE batched /stats/category-sparkline call
// (orchestrator passes the merged response in).

import { Text, View } from 'react-native';
import type {
  CategorySparklineResponseType,
  StatsOverviewTopCategoryItemType,
} from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { useHomeStore } from '../../lib/hooks';
import { colorForToken, softColorForToken } from './util';
import { CategorySparkline } from './CategorySparkline';
import { Tile, TileEmpty, TileSkeleton } from './Tile';

type Props = {
  items: ReadonlyArray<StatsOverviewTopCategoryItemType>;
  sparkline: CategorySparklineResponseType | undefined;
  loading: boolean;
  errored: boolean;
};

export function TopCategoriesGrid({ items, sparkline, loading, errored }: Props) {
  const balancesHidden = useHomeStore((s) => s.balancesHidden);

  const label =
    items.length === 0
      ? 'Top categories'
      : `Top ${items.length} categories with 30-day sparklines`;

  return (
    <Tile title="Top categories" caption="30d" accessibilityLabel={label}>
      {loading ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={{ width: '50%', padding: 6 }}
            >
              <TileSkeleton height={92} />
            </View>
          ))}
        </View>
      ) : errored ? (
        <TileEmpty height={120}>Could not load top categories.</TileEmpty>
      ) : items.length === 0 ? (
        <TileEmpty height={120}>No spending yet.</TileEmpty>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {items.slice(0, 8).map((it) => {
            const sp = sparkline?.items.find(
              (s) => s.categoryId === it.categoryId,
            );
            const amountText = balancesHidden
              ? '••••••'
              : formatMoney(it.amountMinor, it.currencyCode);
            return (
              <View
                key={it.categoryId}
                accessibilityLabel={`${it.label}, ${amountText}, ${it.percentOfTotal}% of total`}
                style={{ width: '50%', padding: 5 }}
              >
                <View
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: LIGHT.border,
                    backgroundColor: LIGHT.bg,
                    padding: 12,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 4,
                    }}
                  >
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        backgroundColor: softColorForToken(it.colorToken),
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: colorForToken(it.colorToken),
                        }}
                      >
                        {it.label.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontFamily: 'Geist Mono',
                        fontSize: 9,
                        color: LIGHT.textFaint,
                        letterSpacing: 0.4,
                        textTransform: 'uppercase',
                      }}
                    >
                      {it.percentOfTotal}%
                    </Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 11, color: LIGHT.textDim }}
                  >
                    {it.label}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: 'Geist Mono',
                      fontSize: 14,
                      fontWeight: '700',
                      color: LIGHT.text,
                      marginTop: 1,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {amountText}
                  </Text>
                  <View style={{ marginTop: 6 }}>
                    <CategorySparkline item={sp} colorToken={it.colorToken} />
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Tile>
  );
}
