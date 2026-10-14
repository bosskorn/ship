import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { AppProviders } from '@/features/shared/AppProviders';
import { useSettings } from '@/core/config/settingsStore';
import { useTheme } from '@/design-system';
import { bootstrapLocalData } from '@/features/shared/bootstrap';

function RootStack() {
  const { colors } = useTheme();
  const hydrated = useSettings((s) => s.hydrated);
  const onboarded = useSettings((s) => s.onboardingCompleted);

  useEffect(() => {
    void bootstrapLocalData();
  }, []);

  // Wait for persisted settings so onboarding never flashes for returning users.
  if (!hydrated) return <View style={{ flex: 1, backgroundColor: colors.bgPage }} />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bgPage } }}>
      <Stack.Protected guard={!onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="scanner" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="editor" options={{ gestureEnabled: false }} />
        <Stack.Screen name="ai-consent" options={{ presentation: 'modal' }} />
        {/* Every other screen too: none is reachable by deep link before onboarding. */}
        <Stack.Screen name="document/[id]" />
        <Stack.Screen name="folder/[id]" />
        <Stack.Screen name="ocr/[id]" />
        <Stack.Screen name="sensitive/[id]" />
        <Stack.Screen name="search" />
        <Stack.Screen name="tools" />
        <Stack.Screen name="about" />
        <Stack.Screen name="appearance" />
        <Stack.Screen name="language" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="security" />
        <Stack.Screen name="scan-quality" />
        <Stack.Screen name="scan-diagnostics" />
        <Stack.Screen name="cloud" />
        <Stack.Screen name="pricing" />
        <Stack.Screen name="unavailable" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <RootStack />
    </AppProviders>
  );
}
