import { createApiClient } from '@ship/mobile-ui';
import Constants from 'expo-constants';

/** Public API URL only — no secrets ship in the app bundle. */
const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra?.apiUrl as string) ?? 'http://localhost:4000';

export const api = createApiClient({ baseUrl, storageKey: 'ship.customer.session' });
