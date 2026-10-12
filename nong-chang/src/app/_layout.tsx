import { Stack, router, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BrandAnimation } from '@/brand/BrandAnimation';
import { NToastProvider, useToast } from '@/components';
import { track } from '@/lib/analytics';
import { AuthProvider, useAuth } from '@/lib/auth';
import { AppStoreProvider, useApp } from '@/store/AppStore';
import { color, motion } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: motion.crossfade, fade: false });

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <AppStoreProvider>
            <NToastProvider>
              <Root />
            </NToastProvider>
          </AppStoreProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Root() {
  const { ready, signedIn } = useAuth();
  const [brandDone, setBrandDone] = useState(false);

  useEffect(() => {
    if (!ready) return;
    // Stage 1 → Stage 2: hand off from native splash to the JS brand animation.
    // Home/skeleton is already mounted underneath.
    SplashScreen.hideAsync().catch(() => {});
    track('app_open');
  }, [ready]);

  const onBrandDone = useCallback(() => setBrandDone(true), []);

  if (!ready) return null; // native splash is still covering the screen

  return (
    <>
      <StatusBar style={brandDone ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.bgPage },
          animation: 'default', // platform-native push transition
        }}
      >
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="job/[id]/matching" options={{ gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="job/[id]/success" options={{ gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="diagnosis" options={{ presentation: 'modal' }} />
          <Stack.Screen name="search" options={{ animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
          <Stack.Screen name="otp" />
        </Stack.Protected>
      </Stack>
      {signedIn ? <JobEventToaster /> : null}
      {!brandDone ? <BrandAnimation onDone={onBrandDone} /> : null}
    </>
  );
}

/** Surfaces realtime job events as an in-app banner (push handles background). */
function JobEventToaster() {
  const { state } = useApp();
  const toast = useToast();
  const pathname = usePathname();
  const seen = useRef<string | undefined>(state.notifications[0]?.id);

  useEffect(() => {
    const latest = state.notifications[0];
    if (!latest || latest.id === seen.current) return;
    seen.current = latest.id;
    if (latest.group !== 'job' || !latest.jobId) return;
    if (pathname.includes(latest.jobId)) return; // already looking at it
    const jobId = latest.jobId;
    toast(`${latest.title} · ${latest.body}`, { onPress: () => router.push(`/job/${jobId}`) });
  }, [state.notifications, pathname, toast]);

  return null;
}
