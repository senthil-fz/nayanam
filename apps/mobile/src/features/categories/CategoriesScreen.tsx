// Categories management screen. Tabs INCOME / EXPENSE with system rows
// first (read-only "System" badge) and household rows beneath (edit +
// archive + reorder). Archived rows live behind a toggle at the bottom.

import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { Category } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { ulid } from 'ulid';
import { apiClient } from '../../lib/api';
import { queryClient } from '../../lib/query-client';
import { useArchiveCategory, useCategories } from '../../lib/hooks';
import { hapticError, hapticSuccess } from '../../lib/haptics';
import { ChevLIcon } from '../cards/icons';
import { CategoryChip } from './CategoryChip';
import {
  AddCategorySheet,
  type AddCategorySheetHandle,
} from './AddCategorySheet';
import {
  EditCategorySheet,
  type EditCategorySheetHandle,
} from './EditCategorySheet';
import { ReorderCategoriesMode } from './ReorderCategoriesMode';
import { ArchivedCategoriesList } from './ArchivedCategoriesList';

type TypeTab = 'EXPENSE' | 'INCOME';

export function CategoriesScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<TypeTab>('EXPENSE');
  const [reordering, setReordering] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const query = useCategories({ type: tab, includeArchived: true });
  const items = useMemo<Category[]>(() => {
    return query.data?.pages.flatMap((p) => p.items) ?? [];
  }, [query.data]);

  const active = useMemo(
    () => items.filter((c) => !c.archivedAt),
    [items],
  );
  const archived = useMemo(
    () => items.filter((c) => c.archivedAt),
    [items],
  );
  const systemRows = active.filter((c) => c.householdId === null);
  const householdRows = active.filter((c) => c.householdId !== null);

  const addSheetRef = useRef<AddCategorySheetHandle>(null);
  const editSheetRef = useRef<EditCategorySheetHandle>(null);

  if (reordering) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: LIGHT.bg }} edges={['top']}>
        <ReorderCategoriesMode
          items={householdRows}
          onDone={() => setReordering(false)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LIGHT.bg }} edges={['top']}>
      {/* Top bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingVertical: 10,
          gap: 12,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: LIGHT.chipBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevLIcon size={18} color={LIGHT.text} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: '700', color: LIGHT.text }}>
          Categories
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reorder categories"
          onPress={() => setReordering(true)}
          disabled={householdRows.length < 2}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: LIGHT.chipBg,
            opacity: householdRows.length < 2 ? 0.5 : 1,
          }}
        >
          <Text style={{ color: LIGHT.text, fontSize: 13, fontWeight: '600' }}>Reorder</Text>
        </Pressable>
      </View>

      {/* Type tabs */}
      <View
        style={{
          marginHorizontal: 20,
          backgroundColor: LIGHT.chipBg,
          borderRadius: 999,
          padding: 4,
          flexDirection: 'row',
        }}
      >
        {(['EXPENSE', 'INCOME'] as const).map((t) => (
          <Pressable
            key={t}
            accessibilityRole="button"
            accessibilityLabel={`${t} tab`}
            onPress={() => setTab(t)}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 999,
              alignItems: 'center',
              backgroundColor: tab === t ? LIGHT.surface : 'transparent',
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: tab === t ? LIGHT.text : LIGHT.textDim,
              }}
            >
              {t === 'EXPENSE' ? 'Expenses' : 'Income'}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New category"
          onPress={() => addSheetRef.current?.present({ type: tab })}
          style={{
            marginHorizontal: 20,
            marginTop: 16,
            marginBottom: 8,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: LIGHT.border,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontWeight: '600', color: LIGHT.text }}>+ New category</Text>
        </Pressable>

        <SectionTitle>System</SectionTitle>
        {systemRows.length === 0 ? (
          <Text style={{ color: LIGHT.textDim, paddingHorizontal: 20, paddingVertical: 8 }}>
            None.
          </Text>
        ) : (
          systemRows.map((c) => <Row key={c.id} category={c} system />)
        )}

        <SectionTitle>Custom</SectionTitle>
        {householdRows.length === 0 ? (
          <Text style={{ color: LIGHT.textDim, paddingHorizontal: 20, paddingVertical: 8 }}>
            No custom categories yet.
          </Text>
        ) : (
          householdRows.map((c) => (
            <Row key={c.id} category={c} onEdit={() => editSheetRef.current?.present(c)} />
          ))
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showArchived ? 'Hide archived' : 'Show archived'}
          onPress={() => setShowArchived((v) => !v)}
          style={{
            paddingHorizontal: 20,
            paddingVertical: 14,
            marginTop: 16,
          }}
        >
          <Text
            style={{
              color: LIGHT.textDim,
              fontFamily: 'Geist Mono',
              letterSpacing: 0.4,
              fontSize: 11,
            }}
          >
            {showArchived ? 'HIDE ARCHIVED' : `SHOW ARCHIVED (${archived.length})`}
          </Text>
        </Pressable>
        {showArchived ? <ArchivedCategoriesList items={archived} /> : null}
      </ScrollView>

      <AddCategorySheet ref={addSheetRef} />
      <EditCategorySheet ref={editSheetRef} />
    </SafeAreaView>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text
      style={{
        color: LIGHT.textFaint,
        fontFamily: 'Geist Mono',
        letterSpacing: 0.4,
        fontSize: 11,
        paddingHorizontal: 20,
        paddingTop: 14,
        paddingBottom: 4,
      }}
    >
      {children.toUpperCase()}
    </Text>
  );
}

function Row({
  category,
  system,
  onEdit,
}: {
  category: Category;
  system?: boolean;
  onEdit?: () => void;
}) {
  const archive = useArchiveCategory(category.id);
  const confirmArchive = () => {
    Alert.alert(
      'Archive category?',
      `Archived categories are hidden from pickers but historical transactions keep their label.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () => {
            void (async () => {
            try {
              await archive.mutateAsync({});
              // Server responds with the archived row or a deleted row when
              // lifetime transactions are zero; both paths need the list to
              // refetch.
              void queryClient.invalidateQueries({ queryKey: ['categories'] });
              hapticSuccess();
            } catch (err) {
              hapticError();
              Alert.alert('Archive failed', (err as Error).message ?? 'Unknown error.');
            }
            })();
          },
        },
      ],
    );
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 20,
        paddingVertical: 10,
      }}
    >
      <CategoryChip iconToken={category.iconToken} colorToken={category.colorToken} size={36} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: LIGHT.text }}>
          {category.label}
        </Text>
        {system ? (
          <Text
            style={{
              fontSize: 10,
              color: LIGHT.textFaint,
              fontFamily: 'Geist Mono',
              letterSpacing: 0.4,
              marginTop: 2,
            }}
          >
            SYSTEM
          </Text>
        ) : null}
      </View>
      {!system ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${category.label}`}
            onPress={onEdit}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: LIGHT.chipBg,
            }}
          >
            <Text style={{ color: LIGHT.text, fontSize: 12, fontWeight: '600' }}>Edit</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Archive ${category.label}`}
            onPress={confirmArchive}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: LIGHT.chipBg,
            }}
          >
            <Text style={{ color: LIGHT.negative, fontSize: 12, fontWeight: '600' }}>Archive</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

// Re-export the archive helper with a fresh idempotency key so callers can
// bypass the baked-id shared hook when needed. Currently unused outside this
// module — exposed to keep symmetry with the transactions screen pattern.
export async function archiveCategoryDirect(id: string): Promise<void> {
  await apiClient.archiveCategory(id, ulid());
  void queryClient.invalidateQueries({ queryKey: ['categories'] });
}
