// 4 categories × push/email switch grid.

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Alert, Text, View } from 'react-native';
import type { NotificationPreferences } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '../../lib/hooks';
import { SheetShell, type SheetHandle } from './SheetShell';
import { Toggle } from './primitives';
import { hapticError } from '../../lib/haptics';

type Row = {
  label: string;
  push: keyof NotificationPreferences;
  email: keyof NotificationPreferences;
};

const ROWS: Row[] = [
  {
    label: 'Bills',
    push: 'pushBillsEnabled',
    email: 'emailBillsEnabled',
  },
  {
    label: 'Budgets',
    push: 'pushBudgetsEnabled',
    email: 'emailBudgetsEnabled',
  },
  {
    label: 'Household activity',
    push: 'pushHouseholdActivityEnabled',
    email: 'emailHouseholdActivityEnabled',
  },
  {
    label: 'Weekly summary',
    push: 'pushWeeklySummaryEnabled',
    email: 'emailWeeklySummaryEnabled',
  },
];

export type NotificationsPreferencesSheetHandle = SheetHandle;

export const NotificationsPreferencesSheet = forwardRef<
  NotificationsPreferencesSheetHandle,
  object
>(function NotificationsPreferencesSheet(_props, ref) {
  const inner = useRef<SheetHandle>(null);
  const prefs = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();

  useImperativeHandle(ref, () => ({
    present: () => inner.current?.present(),
    dismiss: () => inner.current?.dismiss(),
  }));

  const value = prefs.data;

  const toggle = async (
    field: keyof NotificationPreferences,
    next: boolean,
  ) => {
    try {
      await update.mutateAsync({ [field]: next });
    } catch (e) {
      hapticError();
      Alert.alert(
        'Could not update preference',
        e instanceof Error ? e.message : 'Try again.',
      );
    }
  };

  return (
    <SheetShell ref={inner} title="Notifications" snapPoints={['70%']}>
      <View style={{ gap: 16 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingBottom: 6,
            borderBottomWidth: 1,
            borderBottomColor: LIGHT.border,
          }}
        >
          <View style={{ flex: 1 }} />
          <Text style={columnHeader}>Push</Text>
          <Text style={columnHeader}>Email</Text>
        </View>
        {ROWS.map((row) => {
          const pushOn = Boolean(value?.[row.push]);
          const emailOn = Boolean(value?.[row.email]);
          return (
            <View
              key={row.label}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 4,
              }}
            >
              <Text
                style={{ flex: 1, color: LIGHT.text, fontSize: 14, fontWeight: '500' }}
              >
                {row.label}
              </Text>
              <View style={toggleCell}>
                <Toggle
                  label={`${row.label} push`}
                  value={pushOn}
                  disabled={!value}
                  onChange={(next) => void toggle(row.push, next)}
                />
              </View>
              <View style={toggleCell}>
                <Toggle
                  label={`${row.label} email`}
                  value={emailOn}
                  disabled={!value}
                  onChange={(next) => void toggle(row.email, next)}
                />
              </View>
            </View>
          );
        })}
        <Text style={{ color: LIGHT.textFaint, fontSize: 11 }}>
          Push notifications apply on this device. Email settings apply
          everywhere. In-app activity is always recorded.
        </Text>
      </View>
    </SheetShell>
  );
});

const columnHeader = {
  width: 60,
  textAlign: 'center' as const,
  color: LIGHT.textDim,
  fontSize: 10,
  fontWeight: '600' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.8,
};

const toggleCell = {
  width: 60,
  alignItems: 'center' as const,
};
