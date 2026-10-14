import React, { useState } from 'react';
import { Linking, Pressable, TextInput, TextInputProps, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { TIcon, TIconButton, TText, useTheme } from '@/design-system';
import { env } from '@/core/config/env';
import { AuthErrorCode, isAuthError } from '@/services/auth/errors';

/** Shared pieces of the account screens (design system V2, native forms). */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const validEmail = (v: string) => EMAIL.test(v.trim()) && v.trim().length <= 254;
/** Same policy as Supabase Auth (config.toml): 8+ characters, letters and digits. */
export const validPassword = (v: string) => v.length >= 8 && v.length <= 72 && /[A-Za-z]/.test(v) && /\d/.test(v);
export const normalizeEmail = (v: string) => v.trim().toLowerCase();

/** User-facing message for any account failure (never raw provider text). */
export function useAuthErrorText() {
  const { t } = useTranslation();
  return (e: unknown): string => {
    const code: AuthErrorCode = isAuthError(e) ? e.code : 'unknown';
    return t(`account.err_${code}`);
  };
}

export function legalUrl(which: 'terms' | 'privacy', language: string) {
  return `${env.accountApiUrl}/legal/${which}?lang=${language.startsWith('th') ? 'th' : 'en'}`;
}

export function openLegal(which: 'terms' | 'privacy', language: string) {
  void Linking.openURL(legalUrl(which, language)).catch(() => undefined);
}

/** Text field matching TInput, with an optional trailing control. */
export function Field({ label, error, trailing, ...rest }: Omit<TextInputProps, 'style'> & { label: string; error?: string | null; trailing?: React.ReactNode }) {
  const { colors, radius, spacing, typeScale, fontFamily } = useTheme();
  return (
    <View style={{ gap: spacing.xxs }}>
      <TText variant="bodySmall" color="textSecondary">
        {label}
      </TText>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 52,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: error ? colors.error : colors.border,
          backgroundColor: colors.bgContainer,
        }}
      >
        <TextInput
          placeholderTextColor={colors.textPlaceholder}
          accessibilityLabel={label}
          {...rest}
          style={[typeScale.bodyLarge, { flex: 1, fontFamily, color: colors.textPrimary, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }]}
        />
        {trailing}
      </View>
      {error ? (
        <TText variant="bodySmall" color="error" accessibilityLiveRegion="polite">
          {error}
        </TText>
      ) : null}
    </View>
  );
}

export function EmailField(props: { value: string; onChangeText: (v: string) => void; error?: string | null; autoFocus?: boolean; editable?: boolean; testID?: string }) {
  const { t } = useTranslation();
  return (
    <Field
      label={t('account.email')}
      keyboardType="email-address"
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="email"
      textContentType="emailAddress"
      inputMode="email"
      returnKeyType="next"
      {...props}
    />
  );
}

export function PasswordField(props: { label: string; value: string; onChangeText: (v: string) => void; error?: string | null; newPassword?: boolean; hint?: string; testID?: string; onSubmitEditing?: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [shown, setShown] = useState(false);
  return (
    <View>
      <Field
        label={props.label}
        value={props.value}
        onChangeText={props.onChangeText}
        error={props.error}
        testID={props.testID}
        secureTextEntry={!shown}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={props.newPassword ? 'new-password' : 'current-password'}
        textContentType={props.newPassword ? 'newPassword' : 'password'}
        onSubmitEditing={props.onSubmitEditing}
        trailing={
          <TIconButton
            icon={shown ? 'eyeOff' : 'eye'}
            accessibilityLabel={shown ? t('account.hide_password') : t('account.show_password')}
            color={colors.textSecondary}
            onPress={() => setShown((v) => !v)}
          />
        }
      />
      {props.hint && !props.error ? (
        <TText variant="caption" color="textSecondary" style={{ marginTop: 4 }}>
          {props.hint}
        </TText>
      ) : null}
    </View>
  );
}

/** Form-level error (from the server), announced to screen readers. */
export function ErrorBanner({ message, action }: { message: string | null; action?: { label: string; onPress: () => void } }) {
  const { colors, spacing, radius } = useTheme();
  if (!message) return null;
  return (
    <View
      accessibilityLiveRegion="assertive"
      style={{ flexDirection: 'row', gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.errorLight ?? colors.bgSecondary }}
    >
      <TIcon name="info" size="sm" color={colors.error} />
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <TText variant="body" color="textPrimary">
          {message}
        </TText>
        {action ? (
          <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={8}>
            <TText variant="body" weight="600" color="brand">
              {action.label}
            </TText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function Notice({ message, icon = 'check' }: { message: string; icon?: 'check' | 'info' | 'mail' }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.brandLight }}>
      <TIcon name={icon} size="sm" color={colors.brand} />
      <TText variant="body" style={{ flex: 1 }}>
        {message}
      </TText>
    </View>
  );
}

export function Checkbox({ checked, onChange, children, testID, error }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; testID?: string; error?: boolean }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
      <Pressable
        testID={testID}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={() => onChange(!checked)}
        hitSlop={12}
        style={{
          width: 24,
          height: 24,
          marginTop: 2,
          borderRadius: 6,
          borderWidth: checked ? 0 : 2,
          borderColor: error ? colors.error : colors.border,
          backgroundColor: checked ? colors.brand : colors.bgContainer,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <TIcon name="check" size="sm" color={colors.textAnti} strokeWidth={3} /> : null}
      </Pressable>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

/** Inline text link. */
export function TextLink({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return (
    <TText testID={testID} variant="body" weight="600" color="brand" accessibilityRole="link" onPress={onPress} suppressHighlighting>
      {label}
    </TText>
  );
}
