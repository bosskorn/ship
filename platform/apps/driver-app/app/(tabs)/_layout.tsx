import { Feather } from '@expo/vector-icons';
import { color } from '@ship/mobile-ui';
import { Tabs } from 'expo-router';

/** Spec §12: Home | Jobs | Earnings | Account */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: color.brand,
        tabBarInactiveTintColor: color.text3,
        tabBarLabelStyle: { fontSize: 11 },
        headerTitleStyle: { fontSize: 17, fontWeight: '600' },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: color.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'หน้าหลัก', headerShown: false, tabBarIcon: ({ color: c, size }) => <Feather name="power" size={size - 2} color={c} /> }} />
      <Tabs.Screen name="jobs" options={{ title: 'งาน', tabBarIcon: ({ color: c, size }) => <Feather name="package" size={size - 2} color={c} /> }} />
      <Tabs.Screen name="earnings" options={{ title: 'รายได้', tabBarIcon: ({ color: c, size }) => <Feather name="bar-chart-2" size={size - 2} color={c} /> }} />
      <Tabs.Screen name="account" options={{ title: 'บัญชี', tabBarIcon: ({ color: c, size }) => <Feather name="user" size={size - 2} color={c} /> }} />
    </Tabs>
  );
}
