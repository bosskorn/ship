import React, { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, TToastProvider } from '@/design-system';
import { useSettings } from '@/core/config/settingsStore';
import { initI18n, setLanguage, systemLanguage, usableLanguage } from '@/core/i18n';
import { useRemoteConfig } from '@/core/config/remoteConfig';
import { setOcrLanguage } from '@/core/document-engine/ocr/ocrLanguages';

export function useResolvedLanguage() {
  const lang = useSettings((s) => s.language);
  // A saved choice that this build no longer offers (preview-only, removed) follows the device.
  return usableLanguage(lang) ?? systemLanguage();
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const appearance = useSettings((s) => s.appearance);
  const system = useColorScheme();
  const language = useResolvedLanguage();
  const scheme = appearance === 'system' ? (system === 'dark' ? 'dark' : 'light') : appearance;
  useState(() => initI18n(language));

  useEffect(() => {
    setLanguage(language);
  }, [language]);

  // OCR language is its own setting; the UI language never changes it.
  const ocrLanguage = useSettings((s) => s.ocrLanguage);
  useEffect(() => {
    setOcrLanguage(ocrLanguage);
  }, [ocrLanguage]);

  useEffect(() => {
    void useRemoteConfig.getState().load();
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider scheme={scheme} language={language}>
        <TToastProvider>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          {children}
        </TToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
