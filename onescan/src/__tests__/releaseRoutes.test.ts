import fs from 'fs';
import path from 'path';
import { PRODUCTION_OFF, type FeatureFlag } from '@/core/config/remoteConfig';

jest.mock('@/core/storage/kvStorage', () => ({ kvStore: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));

/**
 * 1.2.x release gate: a disabled feature must not be reachable from the UI, a deep link
 * (onescan://<route>) or another navigation path. Every file in src/app is a deep-linkable route.
 */
const APP = path.join(__dirname, '..', 'app');
function routes(dir = APP): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? routes(p) : /\.tsx?$/.test(e.name) ? [path.relative(APP, p)] : [];
  });
}
const all = routes();
const src = (r: string) => fs.readFileSync(path.join(APP, r), 'utf8');

describe('release routes (1.2.x)', () => {
  it('has no route for features that do not exist in this release (advanced PDF, convert, account)', () => {
    const forbidden = /(^|\/)(account|auth|tools)(\/|$)|merge|split|convert|to-images|compress|pages\.tsx|\+native-intent/;
    expect(all.filter((r) => forbidden.test(r))).toEqual([]);
    expect(PRODUCTION_OFF.has('advancedPdf')).toBe(true);
    expect(PRODUCTION_OFF.has('convert')).toBe(true);
  });

  it('wraps every route of a release-off feature in featureRoute (redirects home in release)', () => {
    const gated: Record<string, FeatureFlag> = {
      '(tabs)/ai.tsx': 'ai',
      'ai-consent.tsx': 'ai',
      'cloud.tsx': 'cloudBackup',
      'pricing.tsx': 'pro',
      'scan-diagnostics.tsx': 'devTools',
      'unavailable.tsx': 'devTools',
    };
    for (const [route, flag] of Object.entries(gated)) {
      expect(all).toContain(route);
      expect(src(route)).toContain(`featureRoute('${flag}'`);
      expect(PRODUCTION_OFF.has(flag)).toBe(true);
    }
  });

  it('no other route is wrapped with a flag that is missing from the list above', () => {
    const wrapped = all.filter((r) => /featureRoute\(/.test(src(r)));
    expect(wrapped.sort()).toEqual(['(tabs)/ai.tsx', 'ai-consent.tsx', 'cloud.tsx', 'pricing.tsx', 'scan-diagnostics.tsx', 'unavailable.tsx'].sort());
  });
});
