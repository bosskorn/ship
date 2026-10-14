import { redirectSystemPath } from '@/app/+native-intent';
import { takeAuthLink } from '@/services/auth/linkInbox';

describe('native intent: email links', () => {
  it('keeps the full auth link (fragment included) for the callback screen, once', () => {
    const url = 'onescan://auth/callback#access_token=a.b.c&refresh_token=abcdefgh12&type=signup';
    expect(redirectSystemPath({ path: url, initial: false })).toBe('/auth/callback');
    expect(takeAuthLink()).toBe(url);
    expect(takeAuthLink()).toBeNull();
  });

  it('passes every other path through untouched', () => {
    expect(redirectSystemPath({ path: 'onescan://document/abc', initial: true })).toBe('onescan://document/abc');
    expect(redirectSystemPath({ path: 'onescan://auth/callbackx', initial: true })).toBe('onescan://auth/callbackx');
    expect(takeAuthLink()).toBeNull();
  });
});

describe('production: verified App Links (M1)', () => {
  const HOST = 'links.onescan.app';
  let mod: { redirectSystemPath: typeof redirectSystemPath; take: typeof takeAuthLink; inbox: typeof import('@/services/auth/linkInbox') };
  beforeAll(() => {
    (process.env as Record<string, string | undefined>).EXPO_PUBLIC_APP_LINK_HOST = HOST;
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports -- fresh modules with the production env */
      const intent = require('@/app/+native-intent') as { redirectSystemPath: typeof redirectSystemPath };
      const inbox = require('@/services/auth/linkInbox') as typeof import('@/services/auth/linkInbox');
      /* eslint-enable @typescript-eslint/no-require-imports */
      mod = { redirectSystemPath: intent.redirectSystemPath, take: inbox.takeAuthLink, inbox };
    });
  });
  afterAll(() => {
    delete (process.env as Record<string, string | undefined>).EXPO_PUBLIC_APP_LINK_HOST;
  });

  it('routes https://<host>/auth/link (fragment kept) to the callback screen', () => {
    const url = `https://${HOST}/auth/link#token_hash=pkce_abc12345&type=recovery`;
    expect(mod.redirectSystemPath({ path: url, initial: true })).toBe('/auth/callback');
    expect(mod.take()).toBe(url);
  });

  it('never accepts a custom-scheme email link, another host, or http', () => {
    expect(mod.redirectSystemPath({ path: 'onescan://auth/callback#access_token=a.b.c&refresh_token=abcdefgh12&type=signup', initial: true })).toBe('/');
    expect(mod.take()).toBeNull();
    expect(mod.inbox.isAuthLink(`https://evil.example/auth/link#token_hash=x`)).toBe(false);
    expect(mod.inbox.isAuthLink(`https://${HOST}.evil.example/auth/link`)).toBe(false);
    expect(mod.inbox.isAuthLink(`http://${HOST}/auth/link`)).toBe(false);
    expect(mod.inbox.isAuthLink(`https://${HOST}/auth/linkx`)).toBe(false);
  });

  it('verification and reset emails point at the App Link', () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { emailRedirectUrl } = require('@/services/auth/goTrue') as typeof import('@/services/auth/goTrue');
      expect(emailRedirectUrl()).toBe(`https://${HOST}/auth/link`);
    });
  });
});
