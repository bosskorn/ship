import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function registerPush() {
  if (!Device.isDevice) return;
  if (Platform.OS === 'android') {
    // job offers must cut through: max importance, sound, vibration
    await Notifications.setNotificationChannelAsync('job-offer', {
      name: 'งานใหม่',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400],
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync('default', { name: 'ทั่วไป', importance: Notifications.AndroidImportance.DEFAULT });
  }
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    await api.post('/auth/push-token', { pushToken: token });
  } catch {
    /* push needs an EAS projectId; sockets still deliver offers while the app is open */
  }
}
