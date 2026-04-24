// Shared budget form fields used by Add + Edit sheets. RHF + Zod.
//
// Fields: scope (Household / Category), category (when scope=CATEGORY),
// name, amount, currency, period, rollover, startAt, endAt.
//
// Edit mode locks `scope`, `categoryId`, `currencyCode`, `period`, and
// `startAt` — they're immutable per the contract (`UpdateBudgetInput` only
// accepts name/amountMinor/rollover/endAt/displayOrder).

import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import { Controller, type UseFormReturn } from 'react-hook-form';
import type {
  BudgetPeriod,
  BudgetScope,
  Category,
} from '@nayanam/core';
import { SUPPORTED_CURRENCY_CODES } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { DateTimeField } from '../../components/DateTimeField';
import { MinorAmountInput } from '../transactions/MinorAmountInput';
import {
  CategoryPickerSheet,
  type CategoryPickerSheetHandle,
} from '../transactions/CategoryPickerSheet';
import {
  CurrencyPickerSheet,
  type CurrencyPickerSheetHandle,
} from './CurrencyPickerSheet';
import { scopeLabel as scopeCopy } from './format';

export type BudgetFormValues = {
  scope: BudgetScope;
  categoryId: string | null;
  name: string;
  amountMinor: string;
  currencyCode: string;
  period: BudgetPeriod;
  rollover: boolean;
  /** ISO-8601 UTC string. Empty means "use server default (now)". */
  startAt: string;
  /** ISO-8601 UTC string. Empty means null / no end. */
  endAt: string;
};

type Props = {
  form: UseFormReturn<BudgetFormValues>;
  initialCategory: Category | null;
  /** Edit mode disables the immutable fields. */
  disableImmutable?: boolean;
  /** Category ids already covered by an active budget (for the picker). */
  excludeCategoryIds?: readonly string[];
};

export function BudgetFormFields({
  form,
  initialCategory,
  disableImmutable,
  excludeCategoryIds,
}: Props) {
  const categorySheetRef = useRef<CategoryPickerSheetHandle>(null);
  const currencySheetRef = useRef<CurrencyPickerSheetHandle>(null);
  const [category, setCategory] = useState<Category | null>(initialCategory);

  const scope = form.watch('scope');
  const period = form.watch('period');
  const rollover = form.watch('rollover');
  const currencyCode = form.watch('currencyCode');
  const startAt = form.watch('startAt');

  const pickCategory = useCallback(
    (c: Category) => {
      setCategory(c);
      form.setValue('categoryId', c.id, { shouldDirty: true });
      // Auto-fill name with the category label if the user hasn't typed one.
      const current = form.getValues('name').trim();
      if (!current) {
        form.setValue('name', c.label, { shouldDirty: true });
      }
    },
    [form],
  );

  const pickCurrency = useCallback(
    (code: string) => {
      form.setValue('currencyCode', code, { shouldDirty: true });
    },
    [form],
  );

  const errors = form.formState.errors;

  const scopeOptions = useMemo(
    () =>
      (['HOUSEHOLD', 'CATEGORY'] as const).map((s) => ({
        value: s,
        label: scopeCopy(s),
      })),
    [],
  );

  return (
    <View>
      {/* Scope */}
      <Field label="Scope">
        <Segmented
          value={scope}
          options={scopeOptions}
          onChange={(v) => {
            if (disableImmutable) return;
            form.setValue('scope', v, { shouldDirty: true });
            if (v === 'HOUSEHOLD') {
              form.setValue('categoryId', null, { shouldDirty: true });
              setCategory(null);
            }
          }}
          disabled={disableImmutable}
        />
        {disableImmutable ? <ImmutableHint /> : null}
      </Field>

      {/* Category — only when scope=CATEGORY */}
      {scope === 'CATEGORY' ? (
        <Field label="Category">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              category ? `Category ${category.label}` : 'Pick category'
            }
            accessibilityState={{ disabled: Boolean(disableImmutable) }}
            disabled={disableImmutable}
            onPress={() => categorySheetRef.current?.present()}
            style={[pickerStyle, disableImmutable ? { opacity: 0.6 } : null]}
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
          {disableImmutable ? <ImmutableHint /> : null}
        </Field>
      ) : null}

      {/* Name */}
      <Field label="Name">
        <Controller
          control={form.control}
          name="name"
          render={({ field }) => (
            <TextInput
              accessibilityLabel="Budget name"
              value={field.value}
              onChangeText={field.onChange}
              placeholder={
                scope === 'HOUSEHOLD' ? 'Monthly household' : 'Groceries'
              }
              placeholderTextColor={LIGHT.textFaint}
              maxLength={60}
              style={inputStyle}
            />
          )}
        />
        {errors.name ? <ErrText msg={errors.name.message ?? 'Required'} /> : null}
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
              currencyCode={currencyCode || 'USD'}
            />
          )}
        />
        {errors.amountMinor ? (
          <ErrText msg="Enter an amount greater than zero." />
        ) : null}
      </Field>

      {/* Currency */}
      <Field label="Currency">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Currency ${currencyCode}`}
          accessibilityState={{ disabled: Boolean(disableImmutable) }}
          disabled={disableImmutable}
          onPress={() => currencySheetRef.current?.present()}
          style={[pickerStyle, disableImmutable ? { opacity: 0.6 } : null]}
        >
          <Text style={{ color: LIGHT.text, fontSize: 15 }}>{currencyCode}</Text>
        </Pressable>
        {disableImmutable ? <ImmutableHint /> : null}
      </Field>

      {/* Period */}
      <Field label="Period">
        <Segmented
          value={period}
          options={[
            { value: 'MONTHLY', label: 'Monthly' },
            { value: 'WEEKLY', label: 'Weekly' },
          ]}
          onChange={(v) => {
            if (disableImmutable) return;
            form.setValue('period', v, { shouldDirty: true });
          }}
          disabled={disableImmutable}
        />
        {disableImmutable ? <ImmutableHint /> : null}
      </Field>

      {/* Rollover */}
      <Field label="Rollover">
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Switch
            accessibilityLabel="Rollover unused amount"
            value={rollover}
            onValueChange={(v) =>
              form.setValue('rollover', v, { shouldDirty: true })
            }
          />
          <Text style={{ color: LIGHT.textDim, fontSize: 12, flex: 1 }}>
            Carry unused amount into the next period.
          </Text>
        </View>
      </Field>

      {/* Start date */}
      <Field label="Start date">
        <Controller
          control={form.control}
          name="startAt"
          render={({ field }) => (
            <DateTimeField
              mode="date"
              accessibilityLabel="Start date"
              value={field.value || null}
              onChange={(iso) => field.onChange(iso ?? '')}
              placeholder="Today"
            />
          )}
        />
        {disableImmutable ? <ImmutableHint /> : null}
      </Field>

      {/* End date (optional) */}
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
              minimumDate={startAt ? new Date(startAt) : undefined}
            />
          )}
        />
      </Field>

      <CategoryPickerSheet
        ref={categorySheetRef}
        typeFilter="EXPENSE"
        selectedId={category?.id}
        excludeIds={excludeCategoryIds}
        onSelect={pickCategory}
      />
      <CurrencyPickerSheet
        ref={currencySheetRef}
        selectedCode={currencyCode}
        codes={SUPPORTED_CURRENCY_CODES}
        onSelect={pickCurrency}
      />
    </View>
  );
}

function Field({
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

function ImmutableHint() {
  return (
    <Text style={{ color: LIGHT.textFaint, fontSize: 10, marginTop: 4 }}>
      Create a new budget to change this.
    </Text>
  );
}

function Segmented<V extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: V;
  options: ReadonlyArray<{ value: V; label: string }>;
  onChange: (v: V) => void;
  disabled?: boolean;
}) {
  return (
    <View
      style={{
        backgroundColor: LIGHT.chipBg,
        borderRadius: 999,
        padding: 4,
        flexDirection: 'row',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityLabel={`${o.label} ${selected ? 'selected' : ''}`}
            accessibilityState={{ selected, disabled: Boolean(disabled) }}
            disabled={disabled}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 999,
              alignItems: 'center',
              backgroundColor: selected ? LIGHT.surface : 'transparent',
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: selected ? LIGHT.text : LIGHT.textDim,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
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
