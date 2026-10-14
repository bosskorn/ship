import { flagOn, PRODUCTION_OFF } from '@/core/config/remoteConfig';

jest.mock('@/core/storage/kvStorage', () => ({ kvStore: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));

describe('production feature gate (1.2.0 audit)', () => {
  const g = globalThis as unknown as { __DEV__: boolean };
  const dev = g.__DEV__;
  afterEach(() => {
    g.__DEV__ = dev;
  });

  it('keeps unready features off in release builds even if the config turns them on', () => {
    g.__DEV__ = false;
    const all = Object.fromEntries([...PRODUCTION_OFF].map((f) => [f, true]));
    for (const f of PRODUCTION_OFF) expect(flagOn(all, f)).toBe(false);
    for (const f of ['ai', 'cloudBackup', 'pro', 'appLock', 'redaction', 'trash', 'devTools', 'auto_capture_enabled'] as const) {
      expect(PRODUCTION_OFF.has(f)).toBe(true);
    }
  });

  it('leaves shipped features to the config', () => {
    g.__DEV__ = false;
    expect(flagOn({ custom_scanner_enabled: true, quality_coach_enabled: true }, 'custom_scanner_enabled')).toBe(true);
    expect(flagOn({ custom_scanner_enabled: false }, 'custom_scanner_enabled')).toBe(false);
  });
});
