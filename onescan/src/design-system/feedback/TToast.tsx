import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { TText } from '../typography/TText';
import { IconName, TIcon } from '../icons/TIcon';

type ToastTheme = 'info' | 'success' | 'error';
interface ToastState {
  message: string;
  theme: ToastTheme;
}

const ToastContext = createContext<(message: string, theme?: ToastTheme) => void>(() => {});

export function TToastProvider({ children }: { children: React.ReactNode }) {
  const { colors, radius, spacing } = useTheme();
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, theme: ToastTheme = 'info') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, theme });
    timer.current = setTimeout(() => setToast(null), 2000);
  }, []);

  const icon: Record<ToastTheme, IconName | null> = { info: null, success: 'check', error: 'info' };

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: '45%', alignItems: 'center' }}>
          <View
            accessibilityLiveRegion="polite"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              maxWidth: '80%',
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              borderRadius: radius.md,
              backgroundColor: 'rgba(0,0,0,0.75)',
            }}
          >
            {icon[toast.theme] ? <TIcon name={icon[toast.theme]!} size="md" color={colors.mediaText} /> : null}
            <TText variant="body" color="mediaText">
              {toast.message}
            </TText>
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
