// Invite a new member by email + role. Surfaces the returned invite token
// so the inviter can share it manually — mirrors web behaviour.

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ApiHouseholdRole } from '@nayanam/contracts';
import { LIGHT } from '@nayanam/ui-tokens';
import { useCreateInvite } from '../../lib/hooks';
import { useAppearance } from '../../lib/appearance';
import {
  FormError,
  FormLabel,
  PrimaryButton,
  SecondaryButton,
  SheetShell,
  type SheetHandle,
} from './SheetShell';
import { hapticError, hapticSuccess } from '../../lib/haptics';

const ROLES: ApiHouseholdRole[] = ['ADMIN', 'MEMBER', 'VIEWER'];

const Schema = z.object({
  email: z.string().email(),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']),
});
type FormValues = z.infer<typeof Schema>;

export type InviteMemberSheetHandle = SheetHandle;

export const InviteMemberSheet = forwardRef<
  InviteMemberSheetHandle,
  { householdId: string }
>(function InviteMemberSheet({ householdId }, ref) {
  const inner = useRef<SheetHandle>(null);
  const [lastToken, setLastToken] = useState<string | null>(null);
  const create = useCreateInvite(householdId);
  const appearance = useAppearance();

  useImperativeHandle(ref, () => ({
    present: () => {
      setLastToken(null);
      inner.current?.present();
    },
    dismiss: () => inner.current?.dismiss(),
  }));

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { email: '', role: 'MEMBER' },
  });

  const role = form.watch('role');

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const res = await create.mutateAsync(values);
      setLastToken(res.token);
      hapticSuccess();
      form.reset({ email: '', role: 'MEMBER' });
    } catch (e) {
      hapticError();
      Alert.alert(
        'Could not send invite',
        e instanceof Error ? e.message : 'Try again.',
      );
    }
  });

  return (
    <SheetShell ref={inner} title="Invite member" snapPoints={['75%']}>
      <View style={{ gap: 16 }}>
        <View>
          <FormLabel text="Email" />
          <Controller
            control={form.control}
            name="email"
            render={({ field }) => (
              <TextInput
                accessibilityLabel="Email"
                value={field.value}
                onChangeText={field.onChange}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="name@example.com"
                placeholderTextColor={LIGHT.textFaint}
                style={inputStyle}
              />
            )}
          />
          <FormError text={form.formState.errors.email?.message} />
        </View>

        <View>
          <FormLabel text="Role" />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {ROLES.map((r) => {
              const active = role === r;
              return (
                <Pressable
                  key={r}
                  accessibilityRole="button"
                  accessibilityLabel={r}
                  accessibilityState={{ selected: active }}
                  onPress={() => form.setValue('role', r)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? appearance.accentHex : LIGHT.border,
                    backgroundColor: active
                      ? `${appearance.accentHex}22`
                      : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: active ? appearance.accentHex : LIGHT.textDim,
                    }}
                  >
                    {r}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {lastToken ? (
          <View
            style={{
              backgroundColor: LIGHT.chipBg,
              borderWidth: 1,
              borderColor: LIGHT.border,
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: '700',
                color: LIGHT.textDim,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
              }}
            >
              Invite token
            </Text>
            <Text
              selectable
              style={{
                fontFamily: 'Geist Mono',
                fontSize: 11,
                color: LIGHT.text,
                marginTop: 4,
              }}
            >
              {lastToken}
            </Text>
          </View>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <SecondaryButton
            label="Done"
            onPress={() => inner.current?.dismiss()}
          />
          <PrimaryButton
            label="Send invite"
            onPress={() => void onSubmit()}
            loading={create.isPending}
            accent={appearance.accentHex}
          />
        </View>
      </View>
    </SheetShell>
  );
});

const inputStyle = {
  borderWidth: 1,
  borderColor: LIGHT.border,
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
  color: LIGHT.text,
  fontSize: 15,
} as const;
