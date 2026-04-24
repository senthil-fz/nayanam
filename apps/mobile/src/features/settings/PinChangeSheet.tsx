// Change PIN flow: current → new → confirm new.

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

export type PinChangeSheetHandle = SheetHandle;

type Stage = 'current' | 'new' | 'confirm';

export const PinChangeSheet = forwardRef<PinChangeSheetHandle, object>(
  function PinChangeSheet(_props, ref) {
    const inner = useRef<SheetHandle>(null);
    const update = useUpdateMeSecurity();
    const [stage, setStage] = useState<Stage>('current');
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [error, setError] = useState<string | undefined>();

    useImperativeHandle(ref, () => ({
      present: () => {
        setStage('current');
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
        setError(undefined);
        inner.current?.present();
      },
      dismiss: () => inner.current?.dismiss(),
    }));

    const onCurrent = (v: string) => {
      setCurrentPin(v);
      setError(undefined);
      if (v.length === 6) setStage('new');
    };

    const onNew = (v: string) => {
      setNewPin(v);
      setError(undefined);
      if (v.length === 6) setStage('confirm');
    };

    const onConfirm = (v: string) => {
      setConfirmPin(v);
      setError(undefined);
      if (v.length === 6) {
        if (v !== newPin) {
          hapticError();
          setError('PINs do not match.');
          setConfirmPin('');
          setNewPin('');
          setStage('new');
          return;
        }
        void submit();
      }
    };

    const submit = async () => {
      try {
        await update.mutateAsync({ pin: newPin, currentPin });
        hapticSuccess();
        inner.current?.dismiss();
      } catch (e) {
        hapticError();
        Alert.alert(
          'Could not change PIN',
          e instanceof Error ? e.message : 'Try again.',
        );
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
        setStage('current');
      }
    };

    const titles: Record<Stage, string> = {
      current: 'Enter current PIN',
      new: 'Choose new PIN',
      confirm: 'Confirm new PIN',
    };

    return (
      <SheetShell ref={inner} title="Change PIN" snapPoints={['85%']}>
        <View style={{ paddingTop: 16 }}>
          {stage === 'current' ? (
            <PinKeypad
              value={currentPin}
              onChange={onCurrent}
              label={titles.current}
              error={error}
            />
          ) : stage === 'new' ? (
            <PinKeypad value={newPin} onChange={onNew} label={titles.new} />
          ) : (
            <PinKeypad
              value={confirmPin}
              onChange={onConfirm}
              label={titles.confirm}
              error={error}
            />
          )}
        </View>
      </SheetShell>
    );
  },
);
