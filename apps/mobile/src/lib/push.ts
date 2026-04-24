import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiClient } from './api';

/** Request notification permission + register with the API. Silent no-op if denied. */
export async function registerForPushIfPossible(): Promise<void> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== Notifications.PermissionStatus.GRANTED) {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== Notifications.PermissionStatus.GRANTED) return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    if (!token) return;

    const platform: 'ios' | 'android' | 'web' =
      Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

    await apiClient.registerPushToken({
      platform,
      token,
      expoPushToken: token,
    });
  } catch {
    // Swallow — push is a nice-to-have in Phase 1.
  }
}
