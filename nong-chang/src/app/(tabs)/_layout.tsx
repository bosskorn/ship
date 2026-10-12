import { Tabs } from 'expo-router';
import React from 'react';

import { NBottomNavigation, NavItem } from '@/components';
import { useApp } from '@/store/AppStore';

export default function TabsLayout() {
  const { state, activeJob } = useApp();
  const unread = state.notifications.filter((n) => !n.read && n.group === 'job').length;
  const items: NavItem[] = [
    { name: 'index', label: 'หน้าแรก', icon: 'home', activeIcon: 'home-filled' },
    { name: 'jobs', label: 'งานของฉัน', icon: 'jobs', activeIcon: 'jobs-filled', badge: activeJob ? 1 : undefined },
    { name: 'messages', label: 'ข้อความ', icon: 'chat', activeIcon: 'chat-filled', badge: unread || undefined },
    { name: 'account', label: 'บัญชี', icon: 'user', activeIcon: 'user-filled' },
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
