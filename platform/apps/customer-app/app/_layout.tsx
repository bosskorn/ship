import { color, DemoBanner } from '@ship/mobile-ui';
import { api } from '../lib/api';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DraftProvider } from '../lib/draft';
import { SessionProvider, useSession } from '../lib/session';

function Gate() {
  const { session, ready } = useSession();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg }}>
        <ActivityIndicator color={color.brand} />
      </View>
    );
  }
  return (
    <Stack
      screenOptions={{
        headerTitleStyle: { fontSize: 17, fontWeight: '600' },
        headerTintColor: color.text,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: color.surface },
        contentStyle: { backgroundColor: color.bg },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="create/stops" options={{ title: 'สร้างงานส่ง' }} />
        <Stack.Screen name="create/location" options={{ title: 'เลือกตำแหน่ง' }} />
        <Stack.Screen name="create/parcel" options={{ title: 'ข้อมูลสินค้า' }} />
        <Stack.Screen name="create/vehicle" options={{ title: 'เลือกประเภทรถ' }} />
        <Stack.Screen name="create/review" options={{ title: 'ยืนยันและชำระเงิน' }} />
        <Stack.Screen name="order/[id]" options={{ title: 'ติดตามการส่ง' }} />
        <Stack.Screen name="addresses" options={{ title: 'ที่อยู่ที่บันทึกไว้' }} />
      </Stack.Protected>
    </Stack>
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
        <DraftProvider>
          <StatusBar style="dark" />
          <Gate />
          <DemoGate />
        </DraftProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
