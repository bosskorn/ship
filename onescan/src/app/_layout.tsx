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
        <Stack.Screen name="about" />
        <Stack.Screen name="appearance" />
        <Stack.Screen name="language" />
        <Stack.Screen name="ocr-language" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="security" />
        <Stack.Screen name="scan-quality" />
        <Stack.Screen name="scan-diagnostics" />
        <Stack.Screen name="cloud" />
        <Stack.Screen name="pricing" />
        <Stack.Screen name="unavailable" />
        {/* OneScan Account (1.3): reachable only after onboarding, never in front of the scanner. */}
        <Stack.Screen name="account/login" />
        <Stack.Screen name="account/register" />
        <Stack.Screen name="account/verify" />
        <Stack.Screen name="account/forgot" />
        <Stack.Screen name="account/reset" />
        <Stack.Screen name="account/index" />
        <Stack.Screen name="account/devices" />
        <Stack.Screen name="account/delete" />
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="legal/privacy" />
        <Stack.Screen name="legal/terms" />
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
