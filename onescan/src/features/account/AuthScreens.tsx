import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TButton, TLoading, TNavigationBar, TScreen, TText, useTheme, useToast } from '@/design-system';
import { SessionLink, useAccount } from '@/services/auth/accountStore';
import { isAuthError } from '@/services/auth/errors';
import { takeAuthLink } from '@/services/auth/linkInbox';
import {
  Checkbox, EmailField, ErrorBanner, normalizeEmail, Notice, openLegal, PasswordField, TextLink, useAuthErrorText, validEmail, validPassword,
} from './ui';

/** Account form screen: native app bar + padded scrolling form. */
export function AccountForm({ title, children, testID }: { title: string; children: React.ReactNode; testID?: string }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <TScreen
      scroll
      surface="container"
      header={<TNavigationBar title={title} onBack={() => router.back()} backLabel={t('common.back')} />}
      contentStyle={{ padding: spacing.lg, gap: spacing.md }}
    >
      <View testID={testID} style={{ gap: spacing.md }}>
        {children}
      </View>
    </TScreen>
  );
}

const RESEND_COOLDOWN_S = 60;

// ---------------------------------------------------------------- Login

export function LoginScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const toast = useToast();
  const errorText = useAuthErrorText();
  const params = useLocalSearchParams<{ email?: string; notice?: string }>();
  const login = useAccount((s) => s.login);
  const [email, setEmail] = useState(params.email ?? useAccount.getState().account?.email ?? '');
  const [password, setPassword] = useState('');
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const errs = { email: validEmail(email) ? undefined : t('account.err_invalid_email'), password: password ? undefined : t('account.err_required') };
    setFieldErr(errs);
    setError(null);
    if (errs.email || errs.password) return;
    setBusy(true);
    try {
      await login(normalizeEmail(email), password);
      toast(t('account.signed_in'), 'success');
      router.dismissTo('/profile');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountForm title={t('account.login_title')} testID="account-login">
      <View style={{ gap: spacing.xxs, marginBottom: spacing.xs }}>
        <TText variant="headline" weight="700">
          {t('account.login_title')}
        </TText>
        <TText variant="body" color="textSecondary">
          {t('account.login_subtitle')}
        </TText>
      </View>
      {params.notice === 'reset' ? <Notice message={t('account.reset_done')} /> : null}
      <ErrorBanner
        message={error ? errorText(error) : null}
        action={isAuthError(error, 'email_not_confirmed') ? { label: t('account.verify_title'), onPress: () => router.push('/account/verify') } : undefined}
      />
      <EmailField testID="login-email" value={email} onChangeText={setEmail} error={fieldErr.email} />
      <PasswordField testID="login-password" label={t('account.password')} value={password} onChangeText={setPassword} error={fieldErr.password} onSubmitEditing={submit} />
      <View style={{ alignItems: 'flex-end' }}>
        <TextLink testID="login-forgot" label={t('account.forgot_link')} onPress={() => router.push({ pathname: '/account/forgot', params: { email } })} />
      </View>
      <TButton testID="login-submit" label={t('account.sign_in')} block loading={busy} disabled={busy} onPress={submit} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: spacing.xxs, marginTop: spacing.xs }}>
        <TText variant="body" color="textSecondary">
          {t('account.no_account')}
        </TText>
        <TextLink testID="login-register" label={t('account.create')} onPress={() => router.replace('/account/register')} />
      </View>
    </AccountForm>
  );
}

// ---------------------------------------------------------------- Register

export function RegisterScreen() {
  const { t, i18n } = useTranslation();
  const { spacing } = useTheme();
  const errorText = useAuthErrorText();
  const register = useAccount((s) => s.register);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [consent, setConsent] = useState(false);
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string; confirm?: string; consent?: string }>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const errs = {
      email: validEmail(email) ? undefined : t('account.err_invalid_email'),
      password: validPassword(password) ? undefined : t('account.err_password_policy'),
      confirm: confirm === password ? undefined : t('account.err_password_mismatch'),
      consent: consent ? undefined : t('account.err_consent'),
    };
    setFieldErr(errs);
    setError(null);
    if (errs.email || errs.password || errs.confirm || errs.consent) return;
    setBusy(true);
    try {
      await register(normalizeEmail(email), password);
      router.replace('/account/verify');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountForm title={t('account.register_title')} testID="account-register">
      <View style={{ gap: spacing.xxs, marginBottom: spacing.xs }}>
        <TText variant="headline" weight="700">
          {t('account.register_title')}
        </TText>
        <TText variant="body" color="textSecondary">
          {t('account.register_subtitle')}
        </TText>
      </View>
      <ErrorBanner
        message={error ? errorText(error) : null}
        action={isAuthError(error, 'email_exists') ? { label: t('account.sign_in'), onPress: () => router.replace({ pathname: '/account/login', params: { email } }) } : undefined}
      />
      <EmailField testID="register-email" value={email} onChangeText={setEmail} error={fieldErr.email} />
      <PasswordField testID="register-password" label={t('account.password')} value={password} onChangeText={setPassword} error={fieldErr.password} newPassword hint={t('account.password_hint')} />
      <PasswordField testID="register-confirm" label={t('account.confirm_password')} value={confirm} onChangeText={setConfirm} error={fieldErr.confirm} newPassword />
      <Checkbox testID="register-consent" checked={consent} onChange={setConsent} error={!!fieldErr.consent}>
        <TText variant="body">
          {t('account.consent_before')}{' '}
          <TextLink label={t('account.terms')} onPress={() => openLegal('terms', i18n.language)} /> {t('account.consent_and')}{' '}
          <TextLink label={t('account.privacy_policy')} onPress={() => openLegal('privacy', i18n.language)} />
        </TText>
        {fieldErr.consent ? (
          <TText variant="bodySmall" color="error" style={{ marginTop: 4 }}>
            {fieldErr.consent}
          </TText>
        ) : null}
      </Checkbox>
      <TButton testID="register-submit" label={t('account.create')} block loading={busy} disabled={busy} onPress={submit} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: spacing.xxs }}>
        <TText variant="body" color="textSecondary">
          {t('account.have_account')}
        </TText>
        <TextLink label={t('account.sign_in')} onPress={() => router.replace('/account/login')} />
      </View>
    </AccountForm>
  );
}

// ---------------------------------------------------------------- Verify email

async function openMailApp() {
  if (Platform.OS === 'android') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const IntentLauncher = require('expo-intent-launcher') as typeof import('expo-intent-launcher');
      await IntentLauncher.startActivityAsync('android.intent.action.MAIN', { category: 'android.intent.category.APP_EMAIL', flags: 0x10000000 });
      return;
    } catch {
      // no email app with a launcher entry: fall through
    }
  }
  await Linking.openURL('mailto:').catch(() => undefined);
}

export function VerifyEmailScreen() {
  const { t } = useTranslation();
  const { spacing, colors } = useTheme();
  const toast = useToast();
  const errorText = useAuthErrorText();
  const pendingEmail = useAccount((s) => s.pendingEmail);
  const resend = useAccount((s) => s.resendVerification);
  const clearPending = useAccount((s) => s.clearPendingEmail);
  const [wait, setWait] = useState(RESEND_COOLDOWN_S);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timer.current = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const doResend = async () => {
    if (!pendingEmail || wait > 0) return;
    setBusy(true);
    setError(null);
    try {
      await resend(pendingEmail);
      toast(t('account.resent'), 'success');
      setWait(RESEND_COOLDOWN_S);
    } catch (e) {
      setError(e);
      if (isAuthError(e, 'rate_limited')) setWait(RESEND_COOLDOWN_S);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountForm title={t('account.verify_title')} testID="account-verify">
      <View style={{ alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' }}>
          <TText variant="headline" color="brand" accessible={false}>
            @
          </TText>
        </View>
        <TText variant="body" color="textSecondary" align="center">
          {t('account.verify_sent_to')}
        </TText>
        <TText testID="verify-email" variant="titleLarge" weight="600" align="center">
          {pendingEmail ?? ''}
        </TText>
        <TText variant="body" color="textSecondary" align="center">
          {t('account.verify_body')}
        </TText>
      </View>
      <ErrorBanner message={error ? errorText(error) : null} />
      <TButton testID="verify-open-mail" label={t('account.open_mail')} icon="mail" block onPress={openMailApp} />
      <TButton
        testID="verify-resend"
        label={wait > 0 ? t('account.resend_wait', { seconds: wait }) : t('account.resend')}
        variant="outline"
        block
        loading={busy}
        disabled={busy || wait > 0 || !pendingEmail}
        onPress={doResend}
      />
      <TButton
        label={t('account.change_email')}
        variant="text"
        block
        onPress={async () => {
          await clearPending();
          router.replace('/account/register');
        }}
      />
      <TButton label={t('account.back_to_login')} variant="text" block onPress={() => router.replace({ pathname: '/account/login', params: { email: pendingEmail ?? '' } })} />
    </AccountForm>
  );
}

// ---------------------------------------------------------------- Forgot / reset password

export function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const errorText = useAuthErrorText();
  const params = useLocalSearchParams<{ email?: string }>();
  const request = useAccount((s) => s.requestPasswordReset);
  const [email, setEmail] = useState(params.email ?? '');
  const [fieldErr, setFieldErr] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setFieldErr(validEmail(email) ? null : t('account.err_invalid_email'));
    setError(null);
    if (!validEmail(email)) return;
    setBusy(true);
    try {
      await request(normalizeEmail(email));
      setSent(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountForm title={t('account.forgot_title')} testID="account-forgot">
      <TText variant="body" color="textSecondary">
        {t('account.forgot_body')}
      </TText>
      {sent ? <Notice message={t('account.reset_sent')} icon="mail" /> : null}
      <ErrorBanner message={error ? errorText(error) : null} />
      <EmailField testID="forgot-email" value={email} onChangeText={setEmail} error={fieldErr} />
      <TButton testID="forgot-submit" label={t('account.send_reset')} block loading={busy} disabled={busy} onPress={submit} />
      <TButton label={t('account.back_to_login')} variant="text" block onPress={() => router.replace({ pathname: '/account/login', params: { email } })} />
    </AccountForm>
  );
}

export function ResetPasswordScreen() {
  const { t } = useTranslation();
  const errorText = useAuthErrorText();
  const reset = useAccount((s) => s.resetPassword);
  const hasRecovery = useAccount((s) => !!s.recovery);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErr, setFieldErr] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const errs = {
      password: validPassword(password) ? undefined : t('account.err_password_policy'),
      confirm: confirm === password ? undefined : t('account.err_password_mismatch'),
    };
    setFieldErr(errs);
    setError(null);
    if (errs.password || errs.confirm) return;
    setBusy(true);
    try {
      await reset(password);
      router.replace({ pathname: '/account/login', params: { notice: 'reset' } });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountForm title={t('account.reset_title')} testID="account-reset">
      <TText variant="body" color="textSecondary">
        {t('account.reset_body')}
      </TText>
      <ErrorBanner
        message={!hasRecovery ? t('account.err_expired_link') : error ? errorText(error) : null}
        action={!hasRecovery ? { label: t('account.send_reset'), onPress: () => router.replace('/account/forgot') } : undefined}
      />
      <PasswordField testID="reset-password" label={t('account.new_password')} value={password} onChangeText={setPassword} error={fieldErr.password} newPassword hint={t('account.password_hint')} />
      <PasswordField testID="reset-confirm" label={t('account.confirm_new_password')} value={confirm} onChangeText={setConfirm} error={fieldErr.confirm} newPassword />
      <TButton testID="reset-submit" label={t('account.reset_save')} block loading={busy} disabled={busy || !hasRecovery} onPress={submit} />
    </AccountForm>
  );
}

// ---------------------------------------------------------------- Email link callback

const TOKEN = /^[A-Za-z0-9_-]{8,256}$/;

/** Parses `token_hash` and `type` from a query (?…) or fragment (#…) of a link URL. */
export function parseLink(url: string | null | undefined, params: Record<string, string | string[] | undefined> = {}) {
  const pick = (k: string) => {
    const v = params[k];
    return typeof v === 'string' ? v : undefined;
  };
  let tokenHash = pick('token_hash');
  let type = pick('type');
  if ((!tokenHash || !type) && url) {
    const frag = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
    const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
    for (const part of [frag, query]) {
      const p = new URLSearchParams(part);
      tokenHash = tokenHash ?? p.get('token_hash') ?? undefined;
      type = type ?? p.get('type') ?? undefined;
    }
  }
  if (!tokenHash || !TOKEN.test(tokenHash) || (type !== 'email' && type !== 'recovery')) return null;
  return { tokenHash, type: type as 'email' | 'recovery' };
}

const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Session from Supabase's default email links: `/verify` redirects with
 * `#access_token=…&refresh_token=…&expires_in=…&type=signup|recovery`, or `#error_code=…` when
 * the link is used or expired. Returns 'error' for those, null when the URL is not such a link.
 */
export function parseSessionLink(url: string | null | undefined, now = Date.now()): SessionLink | 'error' | null {
  if (!url || !url.includes('#')) return null;
  const p = new URLSearchParams(url.slice(url.indexOf('#') + 1));
  if (p.get('error') || p.get('error_code')) return 'error';
  const accessToken = p.get('access_token') ?? '';
  const refreshToken = p.get('refresh_token') ?? '';
  const raw = p.get('type');
  const type = raw === 'signup' || raw === 'email' ? 'email' : raw === 'recovery' ? 'recovery' : null;
  if (!type || !JWT.test(accessToken) || accessToken.length > 4096 || !TOKEN.test(refreshToken)) return null;
  const at = Number(p.get('expires_at'));
  const inS = Number(p.get('expires_in'));
  const expiresAt = Number.isFinite(at) && at > 0 ? at * 1000 : now + (Number.isFinite(inS) && inS > 0 ? Math.min(inS, 3600) : 300) * 1000;
  return { accessToken, refreshToken, expiresAt, type };
}

export function AuthCallbackScreen() {
  const { t } = useTranslation();
  const { spacing, colors } = useTheme();
  const errorText = useAuthErrorText();
  const params = useLocalSearchParams<Record<string, string>>();
  const completeLink = useAccount((s) => s.completeLink);
  const completeSessionLink = useAccount((s) => s.completeSessionLink);
  const [state, setState] = useState<'working' | 'verified' | 'verified_signin' | 'error'>('working');
  const [error, setError] = useState<unknown>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const url = takeAuthLink() ?? (await Linking.getInitialURL().catch(() => null));
      const link = parseLink(url, params);
      const session = link ? null : parseSessionLink(url);
      if (!link && (!session || session === 'error')) {
        setError(new Error('link'));
        setState('error');
        return;
      }
      try {
        const r = link ? await completeLink(link.tokenHash, link.type) : await completeSessionLink(session as SessionLink);
        if (r === 'recovery') router.replace('/account/reset');
        else setState(r === 'verified_login' || link ? 'verified' : 'verified_signin');
      } catch (e) {
        setError(e);
        setState('error');
      }
    })();
  }, [completeLink, completeSessionLink, params]);

  return (
    <TScreen surface="container" header={<TNavigationBar title={t('account.title')} onBack={() => router.dismissTo('/profile')} />} contentStyle={{ padding: spacing.lg, justifyContent: 'center', gap: spacing.md }}>
      {state === 'working' ? (
        <View style={{ alignItems: 'center', gap: spacing.sm }}>
          <TLoading />
          <TText variant="body" color="textSecondary">
            {t('account.verifying')}
          </TText>
        </View>
      ) : state === 'verified' || state === 'verified_signin' ? (
        <View testID="callback-verified" style={{ alignItems: 'center', gap: spacing.sm }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.successLight ?? colors.brandLight, alignItems: 'center', justifyContent: 'center' }}>
            <TText variant="headline" color="success" accessible={false}>
              ✓
            </TText>
          </View>
          <TText variant="titleLarge" weight="600" align="center" accessibilityRole="header">
            {t('account.verified_title')}
          </TText>
          <TText variant="body" color="textSecondary" align="center">
            {t(state === 'verified' ? 'account.verified_body' : 'account.verified_signin_body')}
          </TText>
          {state === 'verified' ? (
            <TButton label={t('account.go_account')} block onPress={() => router.dismissTo('/profile')} style={{ marginTop: spacing.md }} />
          ) : (
            <TButton label={t('account.back_to_login')} block onPress={() => router.replace('/account/login')} style={{ marginTop: spacing.md }} />
          )}
        </View>
      ) : (
        <View testID="callback-error" style={{ gap: spacing.md }}>
          <ErrorBanner message={isAuthError(error) ? errorText(error) : t('account.err_expired_link')} />
          <TButton label={t('account.back_to_login')} block onPress={() => router.replace('/account/login')} />
        </View>
      )}
    </TScreen>
  );
}
