// Reduce-motion-aware haptics wrappers.
// iOS users with "Reduce Motion" enabled generally prefer fewer incidental
// haptics as well — we mirror that preference here.

import * as Haptics from 'expo-haptics';
import { AccessibilityInfo, Platform } from 'react-native';

let reduceMotionEnabled = false;

AccessibilityInfo.isReduceMotionEnabled?.()
  .then((enabled) => {
    reduceMotionEnabled = enabled;
  })
  .catch(() => {});

AccessibilityInfo.addEventListener?.('reduceMotionChanged', (enabled) => {
  reduceMotionEnabled = enabled;
});

function skip(): boolean {
  if (Platform.OS === 'web') return true;
  return reduceMotionEnabled;
}

export function hapticSelection() {
  if (skip()) return;
  Haptics.selectionAsync().catch(() => {});
}

export function hapticLight() {
  if (skip()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function hapticMedium() {
  if (skip()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export function hapticSuccess() {
  if (skip()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => {},
  );
}

export function hapticError() {
  if (skip()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
    () => {},
  );
}
