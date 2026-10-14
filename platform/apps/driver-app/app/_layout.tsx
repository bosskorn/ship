import '../lib/location'; // registers the background location task at startup
import { color, DemoBanner } from '@ship/mobile-ui';
import { api } from '../lib/api';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { OfferSheet } from '../components/OfferSheet';
import { DriverProvider, useDriver } from '../lib/driver';
import { SessionProvider, useSession } from '../lib/session';

function Gate() {
  const { session, ready } = useSession();
  const { me } = useDriver();
  if (!ready || (session && !me)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg }}>
        <ActivityIndicator color={color.brand} />
      </View>
    );
  }
  const approved = me?.kyc_status === 'APPROVED';
  return (
    <>
      <Stack
        screenOptions={{
          headerTitleStyle: { fontSize: 17, fontWeight: '600' },
          headerTintColor: color.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: color.bg },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Protected guard={!session}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!!session && !approved}>
          <Stack.Screen name="onboarding" options={{ title: 'สมัครเป็นคนขับ' }} />
        </Stack.Protected>
        <Stack.Protected guard={!!session && approved}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="job" options={{ title: 'งานปัจจุบัน' }} />
        </Stack.Protected>
      </Stack>
      {approved && <OfferSheet />}
    </>
  );
}

/** Small floating badge while the app runs on simulated data (no layout impact). */
function DemoGate() {
  const { session } = useSession();
  const insets = useSafeAreaInsets();
  if (!session?.demo || !api.isDemo) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', zIndex: 1000, top: insets.top + 2, right: 8 }}>
      <DemoBanner visible />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <DriverProvider>
          <StatusBar style="dark" />
          <Gate />
          <DemoGate />
        </DriverProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
