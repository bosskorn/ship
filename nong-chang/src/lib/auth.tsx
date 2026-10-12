/**
 * Auth session (spec §63): phone + OTP, tokens in the platform keystore via
 * expo-secure-store. The OTP request/verify calls are mocked; swap
 * `requestOtp` / `verifyOtp` for the real API. Refresh-token rotation belongs
 * in the API client and only ever writes through `saveTokens`.
 */
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ACCESS = 'nc.access';
const REFRESH = 'nc.refresh';

interface AuthCtx {
  ready: boolean;
  signedIn: boolean;
  phone?: string;
  requestOtp: (phone: string) => Promise<{ ref: string; resendIn: number }>;
  verifyOtp: (phone: string, code: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

async function saveTokens(access: string, refresh: string) {
  await SecureStore.setItemAsync(ACCESS, access);
  await SecureStore.setItemAsync(REFRESH, refresh);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [phone, setPhone] = useState<string>();

  useEffect(() => {
    SecureStore.getItemAsync(ACCESS)
      .then((t) => setSignedIn(!!t))
      .catch(() => setSignedIn(false))
      .finally(() => setReady(true));
  }, []);

  const requestOtp = useCallback(async (p: string) => {
    setPhone(p);
    await new Promise((r) => setTimeout(r, 500));
    return { ref: Math.random().toString(36).slice(2, 6).toUpperCase(), resendIn: 60 };
  }, []);

  const verifyOtp = useCallback(async (_p: string, code: string) => {
    await new Promise((r) => setTimeout(r, 600));
    // Mock: any 6 digits except 000000 succeeds.
    if (!/^\d{6}$/.test(code) || code === '000000') return false;
    await saveTokens(`mock-access-${Date.now()}`, `mock-refresh-${Date.now()}`);
    setSignedIn(true);
    return true;
  }, []);

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync(ACCESS);
    await SecureStore.deleteItemAsync(REFRESH);
    setSignedIn(false);
  }, []);

  const value = useMemo(() => ({ ready, signedIn, phone, requestOtp, verifyOtp, signOut }), [ready, signedIn, phone, requestOtp, verifyOtp, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
