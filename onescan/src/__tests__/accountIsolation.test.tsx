/**
 * The account is an optional layer: the scanner, documents, OCR, PDF and search never import
 * it, and app startup never touches the network or the account.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..');

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name.startsWith('__') ? [] : files(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}
const rel = (p: string) => path.relative(SRC, p).split(path.sep).join('/');
const imports = (p: string) => [...fs.readFileSync(p, 'utf8').matchAll(/(?:from\s+|require\()\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);

describe('account isolation (static)', () => {
  const all = files(SRC);
  const ACCOUNT = /^@\/(services\/auth|features\/account)(\/|$)/;
  const ALLOWED = [/^services\/auth\//, /^features\/account\//, /^features\/profile\/ProfileScreen\.tsx$/, /^app\/account\//, /^app\/auth\//];

  it('only the Me tab and account screens import the account layer', () => {
    const offenders = all.filter((f) => imports(f).some((i) => ACCOUNT.test(i)) && !ALLOWED.some((a) => a.test(rel(f)))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('scanner, document engine, documents, viewer, search, editor and startup are account-free', () => {
    const local = all.filter((f) => /^(features\/(scanner|documents|viewer|search|editor|home|tools|shared|onboarding)|core\/document-engine|core\/database|app\/_layout|app\/scanner|app\/\(tabs\)\/(index|documents|scan|tools))/.test(rel(f)));
    expect(local.length).toBeGreaterThan(30);
    for (const f of local) expect(imports(f).filter((i) => ACCOUNT.test(i) || i.startsWith('@/core/identity'))).toEqual([]);
  });

  it('the account layer never imports documents, files, PDF/OCR engines or encryption', () => {
    const acct = all.filter((f) => /^(services\/auth|features\/account|core\/identity)\//.test(rel(f)));
    expect(acct.length).toBeGreaterThan(8);
    for (const f of acct) {
      const bad = imports(f).filter((i) => /document-engine|repositories|DocumentFileStore|SecureFiles|OneScanVision|native\/|expo-file-system|expo-sharing/.test(i));
      expect({ file: rel(f), bad }).toEqual({ file: rel(f), bad: [] });
    }
  });

  it('only the account and remote-config clients talk to the network', () => {
    const net = all.filter((f) => /\bfetch\(|XMLHttpRequest|new WebSocket/.test(fs.readFileSync(f, 'utf8'))).map(rel);
    expect(net.sort()).toEqual(['core/networking/apiClient.ts']);
  });
});

describe('startup does not depend on the account or the network', () => {
  it('AppProviders mounts with every network request failing and never initialises the account', async () => {
    jest.resetModules();
    jest.doMock('@/core/storage/kvStorage', () => ({ kvStore: { getItem: jest.fn(async () => null), setItem: jest.fn(), removeItem: jest.fn() }, persistentJSONStorage: undefined }));
    jest.doMock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
    const fetchSpy = jest.fn(async () => {
      throw new TypeError('offline');
    });
    (globalThis as { fetch: unknown }).fetch = fetchSpy;
    /* eslint-disable @typescript-eslint/no-require-imports */
    const React = require('react') as typeof import('react');
    const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
    const { Text } = require('react-native') as typeof import('react-native');
    const { AppProviders } = require('@/features/shared/AppProviders') as typeof import('@/features/shared/AppProviders');
    const { useAccount } = require('@/services/auth/accountStore') as typeof import('@/services/auth/accountStore');
    /* eslint-enable @typescript-eslint/no-require-imports */
    let r: import('react-test-renderer').ReactTestRenderer;
    await TestRenderer.act(async () => {
      r = TestRenderer.create(React.createElement(AppProviders, null, React.createElement(Text, null, 'scanner-ready')));
    });
    // Mounted (SafeAreaProvider renders its children once it has measured the window).
    expect(r!.toJSON()).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(useAccount.getState().initialized).toBe(false);
    TestRenderer.act(() => r!.unmount());
  });

  it('remote config failure keeps the local default (account flag included) and does not throw', async () => {
    jest.resetModules();
    jest.doMock('@/core/storage/kvStorage', () => ({ kvStore: { getItem: jest.fn(async () => '{not json'), setItem: jest.fn(), removeItem: jest.fn() } }));
    jest.doMock('@/core/networking/apiClient', () => ({ apiClient: { isConfigured: () => true, get: jest.fn(async () => { throw new Error('503'); }) } }));
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { useRemoteConfig, fallbackConfig } = require('@/core/config/remoteConfig') as typeof import('@/core/config/remoteConfig');
    /* eslint-enable @typescript-eslint/no-require-imports */
    await expect(useRemoteConfig.getState().load()).resolves.toBeUndefined();
    expect(useRemoteConfig.getState().config).toEqual(fallbackConfig);
    expect(useRemoteConfig.getState().source).toBe('fallback');
  });

  it('account_enabled defaults off in a build without account servers (1.2 behaviour)', () => {
    jest.resetModules();
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { fallbackConfig } = require('@/core/config/remoteConfig') as typeof import('@/core/config/remoteConfig');
    const { accountConfigured } = require('@/services/auth/accountStore') as typeof import('@/services/auth/accountStore');
    /* eslint-enable @typescript-eslint/no-require-imports */
    expect(fallbackConfig.flags.account_enabled).toBe(false);
    expect(accountConfigured()).toBe(false);
  });
});
