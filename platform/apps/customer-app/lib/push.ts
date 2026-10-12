import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Ask for permission and register the Expo push token with the backend. Safe to call repeatedly. */
export async function registerPush() {
  if (!Device.isDevice) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'สถานะออเดอร์', importance: Notifications.AndroidImportance.HIGH });
  }
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    await api.post('/auth/push-token', { pushToken: token });
  } catch {
    // no EAS projectId in development builds: push stays disabled, in-app updates still work over sockets
  }
}
