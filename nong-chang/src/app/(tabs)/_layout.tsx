import { Tabs } from 'expo-router';
import React from 'react';

import { NBottomNavigation, NavItem } from '@/components';
import { useApp } from '@/store/AppStore';

export default function TabsLayout() {
  const { state, activeJob } = useApp();
  const unread = state.notifications.filter((n) => !n.read && n.group === 'job').length;
  const items: NavItem[] = [
    { name: 'index', label: 'หน้าแรก', icon: 'home' },
    { name: 'jobs', label: 'งานของฉัน', icon: 'jobs', badge: activeJob ? 1 : undefined },
    { name: 'messages', label: 'ข้อความ', icon: 'chat', badge: unread || undefined },
    { name: 'account', label: 'บัญชี', icon: 'user' },
  ];
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <NBottomNavigation {...props} items={items} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="jobs" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
