import React from 'react';
import { Tabs } from 'expo-router';
import { AppTabBar } from '@/navigation/AppTabBar';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, animation: 'none' }} tabBar={(props) => <AppTabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="documents" />
      <Tabs.Screen name="scan" />
      <Tabs.Screen name="tools" />
      <Tabs.Screen name="ai" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
