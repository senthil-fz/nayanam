// First-time PIN setup. Two-step "enter new PIN" → "confirm PIN" flow.

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Alert, View } from 'react-native';
import { useUpdateMeSecurity } from '../../lib/hooks';
import { SheetShell, type SheetHandle } from './SheetShell';
import { PinKeypad } from './security/PinKeypad';
import { hapticError, hapticSuccess } from '../../lib/haptics';

export type PinSetupSheetHandle = SheetHandle;

type Stage = 'enter' | 'confirm';

export const PinSetupSheet = forwardRef<PinSetupSheetHandle, object>(
  function PinSetupSheet(_props, ref) {
    const inner = useRef<SheetHandle>(null);
    const update = useUpdateMeSecurity();
    const [stage, setStage] = useState<Stage>('enter');
    const [first, setFirst] = useState('');
    const [second, setSecond] = useState('');
    const [error, setError] = useState<string | undefined>();

    useImperativeHandle(ref, () => ({
      present: () => {
        setStage('enter');
        setFirst('');
        setSecond('');
        setError(undefined);
        inner.current?.present();
      },
      dismiss: () => inner.current?.dismiss(),
    }));

    const onFirst = (v: string) => {
      setFirst(v);
      if (v.length === 6) {
        setStage('confirm');
      }
    };

    const onSecond = (v: string) => {
      setSecond(v);
      setError(undefined);
      if (v.length === 6) {
        if (v !== first) {
          hapticError();
          setError('PINs do not match. Try again.');
          setSecond('');
          setFirst('');
          setStage('enter');
          return;
        }
        void submit(v);
      }
    };

    const submit = async (pin: string) => {
      try {
        await update.mutateAsync({ pin });
        hapticSuccess();
        inner.current?.dismiss();
      } catch (e) {
        hapticError();
        Alert.alert(
          'Could not set PIN',
          e instanceof Error ? e.message : 'Try again.',
        );
        setFirst('');
        setSecond('');
        setStage('enter');
      }
    };

    return (
      <SheetShell ref={inner} title="Set a 6-digit PIN" snapPoints={['85%']}>
        <View style={{ paddingTop: 16 }}>
          {stage === 'enter' ? (
            <PinKeypad
              value={first}
              onChange={onFirst}
              label="Choose a 6-digit PIN"
            />
          ) : (
            <PinKeypad
              value={second}
              onChange={onSecond}
              label="Confirm your PIN"
              error={error}
            />
          )}
        </View>
      </SheetShell>
    );
  },
);
