import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  TButton, TCell, TCellGroup, TDialog, TEmpty, TIcon, TLoading, TNavigationBar, TScreen, TTag, TText, useTheme, useToast,
} from '@/design-system';
import { formatDate, formatRelativeDay } from '@/core/i18n/format';
import { useFeature } from '@/core/config/remoteConfig';
import { accountConfigured, useAccount } from '@/services/auth/accountStore';
import type { DeviceInfo } from '@/services/auth/accountApi';
import { isAuthError } from '@/services/auth/errors';
import { AccountForm } from './AuthScreens';
import { Checkbox, ErrorBanner, normalizeEmail, Notice, openLegal, PasswordField, useAuthErrorText, validEmail, EmailField } from './ui';

/** Account available in this build: configured at build time and not switched off remotely. */
export function useAccountEnabled() {
  return useFeature('account_enabled') && accountConfigured();
}

/** Local-only initialisation (no network), on first use of an account surface. */
function useAccountInit() {
  const init = useAccount((s) => s.init);
  useEffect(() => {
    void init();
  }, [init]);
}

const dateText = (iso: string | null | undefined, language: string) => (iso ? formatDate(Date.parse(iso), language) : '');

// ---------------------------------------------------------------- Me: account card + menu

/**
 * Top of the Me tab. Not signed in: OneScan Account entry. Signed in: the account and its menu.
 * Settings below it are unchanged; nothing here blocks the rest of the app.
 */
export function AccountSection() {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const toast = useToast();
  const errorText = useAuthErrorText();
  useAccountInit();
  const status = useAccount((s) => s.status);
  const account = useAccount((s) => s.account);
  const pendingEmail = useAccount((s) => s.pendingEmail);
  const initialized = useAccount((s) => s.initialized);
  const refreshAccount = useAccount((s) => s.refreshAccount);
  const logout = useAccount((s) => s.logout);
  const cancelDeletion = useAccount((s) => s.cancelDeletion);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const signedIn = status === 'AUTHENTICATED' || status === 'TOKEN_REFRESHING' || status === 'OFFLINE_AUTHENTICATED';

  // Refresh account details when the tab is shown (background; failures only mark the card).
  useFocusEffect(
    useCallback(() => {
      if (!initialized || !signedIn) return;
      refreshAccount()
        .then(() => setUnavailable(false))
        .catch((e) => setUnavailable(isAuthError(e, 'server')));
      // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when the tab gains focus or sign-in changes
    }, [initialized, signedIn]),
  );

  if (!initialized) return null;

  if (!signedIn) {
    const expired = status === 'SESSION_EXPIRED';
    return (
      <TCellGroup title={t('account.title')}>
        <View testID="account-entry" style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs }}>
          <TText variant="body" color="textSecondary">
            {expired ? t('account.expired_body') : t('account.not_signed_in')}
          </TText>
          {pendingEmail && !expired ? (
            <TText variant="bodySmall" color="brand" onPress={() => router.push('/account/verify')} accessibilityRole="link">
              {t('account.pending_verify', { email: pendingEmail })}
            </TText>
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xxs }}>
            <TButton
              testID="account-sign-in"
              label={t('account.sign_in')}
              size="medium"
              onPress={() => router.push({ pathname: '/account/login', params: expired && account?.email ? { email: account.email } : {} })}
              style={{ flex: 1 }}
            />
            {expired ? null : (
              <TButton
                testID="account-create"
                label={t('account.create')}
                variant="outline"
                size="medium"
                onPress={() => router.push('/account/register')}
                style={{ flex: 1 }}
              />
            )}
          </View>
        </View>
      </TCellGroup>
    );
  }

  const pendingDelete = account?.status === 'pending_deletion' && account.deletionScheduledFor;
  return (
    <View testID="account-signed-in">
      <TCellGroup title={t('account.section')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
            <TText variant="bodyLarge" weight="600" style={{ color: colors.textAnti }}>
              {(account?.email?.[0] ?? '?').toUpperCase()}
            </TText>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <TText testID="account-email" variant="bodyLarge" weight="600" numberOfLines={1}>
              {account?.email ?? ''}
            </TText>
            <TText variant="caption" color={account?.verified === false ? 'warning' : 'success'}>
              {account?.verified === false ? t('account.not_verified') : t('account.verified')}
            </TText>
          </View>
        </View>
        {status === 'OFFLINE_AUTHENTICATED' ? (
          <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xxs }}>
            <TText variant="bodySmall" color="textSecondary">
              {t('account.offline')}
            </TText>
          </View>
        ) : unavailable ? (
          <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xxs }}>
            <TText variant="bodySmall" color="textSecondary">
              {t('account.unavailable')}
            </TText>
          </View>
        ) : null}
        {pendingDelete ? (
          <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xs, gap: spacing.xs }}>
            <TText variant="body" color="error">
              {t('account.pending_delete', { date: dateText(account?.deletionScheduledFor, i18n.language) })}
            </TText>
            <TButton
              testID="account-cancel-delete"
              label={t('account.cancel_delete')}
              variant="outline"
              size="medium"
              onPress={async () => {
                try {
                  await cancelDeletion();
                  toast(t('account.delete_cancelled'), 'success');
                } catch (e) {
                  toast(errorText(e), 'error');
                }
              }}
            />
          </View>
        ) : null}
        <TCell icon="profile" title={t('account.my_account')} arrow onPress={() => router.push('/account' as any)} testID="account-my" />
        <TCell icon="devices" title={t('account.devices')} arrow onPress={() => router.push('/account/devices')} testID="account-devices" />
        <TCell icon="shield" title={t('account.privacy_policy')} arrow onPress={() => openLegal('privacy')} />
        <TCell icon="info" title={t('account.terms')} arrow onPress={() => openLegal('terms')} />
        <TCell icon="logout" title={t('account.logout')} onPress={() => setConfirmLogout(true)} testID="account-logout" />
      </TCellGroup>
      <TDialog
        visible={confirmLogout}
        title={t('account.logout_title')}
        content={t('account.logout_body')}
        onRequestClose={() => setConfirmLogout(false)}
        actions={[
          { label: t('common.cancel'), onPress: () => setConfirmLogout(false) },
          {
            label: t('account.logout'),
            tone: 'primary',
            onPress: async () => {
              setConfirmLogout(false);
              await logout();
              toast(t('account.signed_out'), 'success');
            },
          },
        ]}
      />
    </View>
  );
}

export function AccountDeleteCell() {
  const { t } = useTranslation();
  const status = useAccount((s) => s.status);
  const signedIn = status === 'AUTHENTICATED' || status === 'TOKEN_REFRESHING' || status === 'OFFLINE_AUTHENTICATED';
  if (!signedIn) return null;
  return (
    <TCellGroup>
      <TCell icon="delete" title={t('account.delete')} danger arrow onPress={() => router.push('/account/delete')} testID="account-delete" />
    </TCellGroup>
  );
}

// ---------------------------------------------------------------- My account

export function MyAccountScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  useAccountInit();
  const account = useAccount((s) => s.account);
  return (
    <TScreen scroll header={<TNavigationBar title={t('account.my_account')} onBack={() => router.back()} backLabel={t('common.back')} />}>
      <TCellGroup>
        <TCell title={t('account.email')} note={account?.email ?? ''} />
        <TCell title={t('account.status')} note={account?.verified === false ? t('account.not_verified') : t('account.verified')} />
        <TCell title={t('account.plan')} note={t('account.plan_free')} />
      </TCellGroup>
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.xs }}>
        <Notice message={t('account.documents_local')} icon="info" />
      </View>
    </TScreen>
  );
}

// ---------------------------------------------------------------- Devices and sessions

export function DevicesScreen() {
  const { t, i18n } = useTranslation();
  const { spacing } = useTheme();
  const toast = useToast();
  const errorText = useAuthErrorText();
  useAccountInit();
  const list = useAccount((s) => s.devices);
  const revoke = useAccount((s) => s.revokeDevice);
  const logoutAll = useAccount((s) => s.logoutAll);
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [confirm, setConfirm] = useState<DeviceInfo | 'all' | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDevices(await list());
    } catch (e) {
      setError(e);
    }
  }, [list]);

  useEffect(() => {
    let live = true;
    list()
      .then((d) => live && setDevices(d))
      .catch((e) => live && setError(e));
    return () => {
      live = false;
    };
  }, [list]);

  const name = (d: DeviceInfo) => d.label ?? t('account.unknown_device');
  const when = (d: DeviceInfo) =>
    t('account.last_active', { when: formatRelativeDay(Date.parse(d.lastSeenAt), i18n.language, { today: t('common.today'), yesterday: t('common.yesterday') }) });

  return (
    <TScreen scroll header={<TNavigationBar title={t('account.devices')} onBack={() => router.back()} backLabel={t('common.back')} />} onRefresh={load} refreshing={false}>
      {error ? (
        <View style={{ padding: spacing.md }}>
          <ErrorBanner message={errorText(error)} action={{ label: t('common.retry'), onPress: load }} />
        </View>
      ) : devices === null ? (
        <View style={{ padding: spacing.xl }}>
          <TLoading />
        </View>
      ) : (
        <>
          <TCellGroup>
            {devices.map((d) => (
              <TCell
                key={d.deviceId}
                testID={`device-${d.deviceId}`}
                icon="devices"
                title={name(d)}
                description={d.current ? `${t('account.this_device')} · ${when(d)}` : when(d)}
                right={
                  d.current ? (
                    <TTag label={t('account.this_device')} theme="brand" />
                  ) : (
                    <TButton label={t('account.revoke_device')} variant="text" size="small" onPress={() => setConfirm(d)} />
                  )
                }
              />
            ))}
          </TCellGroup>
          {devices.filter((d) => !d.current).length === 0 ? (
            <TEmpty icon="devices" title={t('account.no_devices')} />
          ) : null}
          <View style={{ padding: spacing.md }}>
            <TButton testID="devices-logout-all" label={t('account.logout_all')} variant="outline" block onPress={() => setConfirm('all')} style={{ borderRadius: 24 }} />
          </View>
        </>
      )}
      <TDialog
        visible={confirm !== null}
        title={confirm === 'all' ? t('account.logout_all_title') : confirm ? t('account.revoke_title', { name: name(confirm) }) : ''}
        content={confirm === 'all' ? t('account.logout_all_body') : t('account.revoke_body')}
        onRequestClose={() => setConfirm(null)}
        actions={[
          { label: t('common.cancel'), onPress: () => setConfirm(null) },
          {
            label: confirm === 'all' ? t('account.logout_all') : t('account.revoke_device'),
            tone: 'danger',
            onPress: async () => {
              const target = confirm;
              setConfirm(null);
              try {
                if (target === 'all') {
                  await logoutAll();
                  toast(t('account.signed_out'), 'success');
                  router.dismissTo('/profile');
                } else if (target) {
                  await revoke(target.deviceId);
                  toast(t('account.revoked'), 'success');
                  await load();
                }
              } catch (e) {
                toast(errorText(e), 'error');
              }
            },
          },
        ]}
      />
    </TScreen>
  );
}

// ---------------------------------------------------------------- Delete account

export function DeleteAccountScreen() {
  const { t, i18n } = useTranslation();
  const { spacing, colors } = useTheme();
  const errorText = useAuthErrorText();
  useAccountInit();
  const account = useAccount((s) => s.account);
  const deleteAccount = useAccount((s) => s.deleteAccount);
  const [email, setEmail] = useState(account?.email ?? '');
  const [password, setPassword] = useState('');
  const [understand, setUnderstand] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  if (done) {
    return (
      <AccountForm title={t('account.delete_title')} testID="delete-done">
        <TText variant="titleLarge" weight="600" accessibilityRole="header">
          {t('account.delete_requested_title')}
        </TText>
        <TText variant="body">{t('account.delete_requested_body', { date: dateText(done, i18n.language) })}</TText>
        <TButton label={t('account.done')} block onPress={() => router.dismissTo('/profile')} style={{ borderRadius: 24 }} />
      </AccountForm>
    );
  }

  const point = (text: string, icon: 'delete' | 'documents' | 'recent', color: string) => (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <TIcon name={icon} size="md" color={color} />
      <TText variant="body" style={{ flex: 1 }}>
        {text}
      </TText>
    </View>
  );

  return (
    <AccountForm title={t('account.delete_title')} testID="account-delete-screen">
      <View style={{ gap: spacing.sm }}>
        {point(t('account.delete_point_server'), 'delete', colors.error)}
        {point(t('account.delete_point_local'), 'documents', colors.success)}
        {point(t('account.delete_point_cancel'), 'recent', colors.textSecondary)}
      </View>
      <ErrorBanner message={error ? errorText(error) : null} />
      {account?.email ? null : <EmailField value={email} onChangeText={setEmail} />}
      <PasswordField testID="delete-password" label={t('account.delete_password')} value={password} onChangeText={setPassword} />
      <Checkbox testID="delete-understand" checked={understand} onChange={setUnderstand}>
        <TText variant="body">{t('account.delete_understand')}</TText>
      </Checkbox>
      <TButton
        testID="delete-submit"
        label={t('account.delete_confirm')}
        variant="danger"
        block
        loading={busy}
        disabled={busy || !understand || !password || !validEmail(email)}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            setDone(await deleteAccount(normalizeEmail(email), password));
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}
        style={{ borderRadius: 24 }}
      />
    </AccountForm>
  );
}
