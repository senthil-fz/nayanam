// Shared bill form fields used by Add + Edit sheets. RHF + Zod.
// Fields: name, account, category, amount, cycle + customDays, startAt,
// autoLog switch, note. CurrencyCode is derived from the selected account
// (matching the contract rule — `currencyCode` is not user-editable).
//
// `startAt` / `endAt` are stored directly as ISO-8601 strings on the form
// and rendered via `DateTimeField` (native platform picker). Empty string
// on `startAt` means "not yet picked"; empty string on `endAt` means null.

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Controller, type UseFormReturn } from 'react-hook-form';
import type { Account, BillCycle, Category } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { DateTimeField } from '../../components/DateTimeField';
import { MinorAmountInput } from '../transactions/MinorAmountInput';
import {
  AccountPickerSheet,
  type AccountPickerSheetHandle,
} from '../transactions/AccountPickerSheet';
import {
  CategoryPickerSheet,
  type CategoryPickerSheetHandle,
} from '../transactions/CategoryPickerSheet';
import { CyclePicker } from './CyclePicker';

export type BillFormValues = {
  name: string;
  accountId: string;
  categoryId: string;
  amountMinor: string;
  currencyCode: string;
  cycle: BillCycle;
  customDays: string;
  /** ISO-8601 UTC string. Empty string means "not picked". */
  startAt: string;
  /** ISO-8601 UTC string. Empty string means null / cleared. */
  endAt: string;
  autoLog: boolean;
  note: string;
};

type Props = {
  form: UseFormReturn<BillFormValues>;
  initialAccount: Account | null;
  initialCategory: Category | null;
  /** Disable account + cycle editing (bills with payments locked in edit). */
  disableAccountSwap?: boolean;
  /**
   * Create mode — clamps `startAt` to today-or-later. Edit mode leaves the
   * minimum open so pre-existing bills with past start dates remain editable.
   */
  isCreate?: boolean;
};

/**
 * Canonical ISO-8601 `now` string suitable for `startAt` / `occurredAt`
 * defaults. Kept here (not inlined) so callers don't have to re-invent it.
 */
export function nowIso(): string {
  return new Date().toISOString();
}

export function BillFormFields({
  form,
  initialAccount,
  initialCategory,
  disableAccountSwap,
  isCreate,
}: Props) {
  const accountSheetRef = useRef<AccountPickerSheetHandle>(null);
  const categorySheetRef = useRef<CategoryPickerSheetHandle>(null);
  const [account, setAccount] = useState<Account | null>(initialAccount);
  const [category, setCategory] = useState<Category | null>(initialCategory);

  const cycle = form.watch('cycle');
  const customDays = form.watch('customDays');
  const currencyCode = form.watch('currencyCode');

  const pickAccount = useCallback(
    (a: Account) => {
      setAccount(a);
      form.setValue('accountId', a.id, { shouldDirty: true });
      form.setValue('currencyCode', a.currencyCode, { shouldDirty: true });
    },
    [form],
  );

  const pickCategory = useCallback(
    (c: Category) => {
      setCategory(c);
      form.setValue('categoryId', c.id, { shouldDirty: true });
    },
    [form],
  );

  const errors = form.formState.errors;
  const customDaysError = useMemo(() => {
    if (cycle !== 'CUSTOM_DAYS') return undefined;
    if (!customDays) return 'Enter a number between 1 and 366';
    const n = Number(customDays);
    if (!Number.isInteger(n) || n < 1 || n > 366) {
      return 'Enter a number between 1 and 366';
    }
    return undefined;
  }, [cycle, customDays]);

  return (
    <View>
      {/* Name */}
      <Field label="Name">
        <Controller
          control={form.control}
          name="name"
          render={({ field }) => (
            <TextInput
              accessibilityLabel="Bill name"
              value={field.value}
              onChangeText={field.onChange}
              placeholder="Netflix"
              placeholderTextColor={LIGHT.textFaint}
              maxLength={80}
              style={inputStyle}
            />
          )}
        />
        {errors.name ? <ErrText msg={errors.name.message ?? 'Required'} /> : null}
      </Field>

      {/* Account */}
      <Field label="Account">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            account ? `Account ${account.nickname}` : 'Pick account'
          }
          accessibilityState={{ disabled: Boolean(disableAccountSwap) }}
          disabled={disableAccountSwap}
          onPress={() => accountSheetRef.current?.present()}
          style={[pickerStyle, disableAccountSwap ? { opacity: 0.6 } : null]}
        >
          <Text
            style={{
              color: account ? LIGHT.text : LIGHT.textDim,
              fontSize: 15,
            }}
          >
            {account?.nickname ?? 'Pick account'}
          </Text>
          {account ? (
            <Text
              style={{
                fontSize: 11,
                color: LIGHT.textFaint,
                fontFamily: 'Geist Mono',
              }}
            >
              {account.currencyCode}
            </Text>
          ) : null}
        </Pressable>
        {errors.accountId ? <ErrText msg="Pick an account" /> : null}
      </Field>

      {/* Category */}
      <Field label="Category">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            category ? `Category ${category.label}` : 'Pick category'
          }
          onPress={() => categorySheetRef.current?.present()}
          style={pickerStyle}
        >
          <Text
            style={{
              color: category ? LIGHT.text : LIGHT.textDim,
              fontSize: 15,
            }}
          >
            {category?.label ?? 'Pick category'}
          </Text>
        </Pressable>
        {errors.categoryId ? <ErrText msg="Pick a category" /> : null}
      </Field>

      {/* Amount */}
      <Field label="Amount">
        <Controller
          control={form.control}
          name="amountMinor"
          render={({ field }) => (
            <MinorAmountInput
              value={field.value}
              onChange={field.onChange}
              currencyCode={currencyCode || account?.currencyCode || 'USD'}
            />
          )}
        />
        {errors.amountMinor ? (
          <ErrText msg="Enter an amount greater than zero." />
        ) : null}
      </Field>

      {/* Cycle */}
      <Field label="Cycle">
        <CyclePicker
          cycle={cycle}
          customDays={customDays}
          onCycleChange={(c) => {
            form.setValue('cycle', c, { shouldDirty: true });
            if (c !== 'CUSTOM_DAYS') {
              form.setValue('customDays', '', { shouldDirty: true });
            }
          }}
          onCustomDaysChange={(v) =>
            form.setValue('customDays', v, { shouldDirty: true })
          }
          error={customDaysError}
        />
      </Field>

      {/* Start at */}
      <Field label="First due date & time">
        <Controller
          control={form.control}
          name="startAt"
          render={({ field }) => (
            <DateTimeField
              mode="datetime"
              accessibilityLabel="First due date and time"
              value={field.value || null}
              onChange={(iso) => field.onChange(iso ?? '')}
              placeholder="Pick a date"
              minimumDate={isCreate ? startOfToday() : undefined}
            />
          )}
        />
      </Field>

      {/* End at (optional) */}
      <Field label="End date (optional)">
        <Controller
          control={form.control}
          name="endAt"
          render={({ field }) => (
            <DateTimeField
              mode="date"
              accessibilityLabel="End date"
              value={field.value || null}
              onChange={(iso) => field.onChange(iso ?? '')}
              placeholder="No end date"
              clearable
            />
          )}
        />
      </Field>

      {/* Auto-log */}
      <Field label="Auto-log">
        <Controller
          control={form.control}
          name="autoLog"
          render={({ field }) => (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Switch
                accessibilityLabel="Automatically log payments"
                value={field.value}
                onValueChange={field.onChange}
              />
              <Text style={{ color: LIGHT.textDim, fontSize: 12, flex: 1 }}>
                Automatically create a transaction on the due date
              </Text>
            </View>
          )}
        />
      </Field>

      {/* Note */}
      <Field label="Note (optional)">
        <Controller
          control={form.control}
          name="note"
          render={({ field }) => (
            <TextInput
              accessibilityLabel="Note"
              value={field.value}
              onChangeText={field.onChange}
              placeholder="Autopay from Visa"
              placeholderTextColor={LIGHT.textFaint}
              multiline
              maxLength={500}
              style={{
                ...inputStyle,
                minHeight: 56,
                textAlignVertical: 'top',
              }}
            />
          )}
        />
      </Field>

      <AccountPickerSheet
        ref={accountSheetRef}
        selectedId={account?.id}
        includeArchived={false}
        onSelect={pickAccount}
      />
      <CategoryPickerSheet
        ref={categorySheetRef}
        typeFilter="EXPENSE"
        selectedId={category?.id}
        onSelect={pickCategory}
      />
    </View>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text
        style={{
          fontSize: 11,
          color: LIGHT.textDim,
          fontFamily: 'Geist Mono',
          letterSpacing: 0.4,
          marginBottom: 6,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function ErrText({ msg }: { msg: string }) {
  return (
    <Text style={{ color: LIGHT.negative, fontSize: 11, marginTop: 4 }}>
      {msg}
    </Text>
  );
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const inputStyle = {
  borderWidth: 1,
  borderColor: LIGHT.border,
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 10,
  backgroundColor: LIGHT.surface,
  color: LIGHT.text,
  fontSize: 15,
} as const;

const pickerStyle = {
  borderWidth: 1,
  borderColor: LIGHT.border,
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 12,
  backgroundColor: LIGHT.surface,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
} as const;
