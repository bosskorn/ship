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
