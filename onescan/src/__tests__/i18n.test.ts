/// <reference types="node" />
/**
 * Translation QA: every production language is complete and consistent with English, every
 * key the code uses exists, and a missing translation can never show a raw key or crash.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import en from '@/core/i18n/locales/en';
import { resources } from '@/core/i18n/locales';
import { pseudoString } from '@/core/i18n/locales/pseudo';
import { i18n, initI18n } from '@/core/i18n';
import { availableLanguages, languageRegistry, resolveLanguage, usableLanguage } from '@/core/i18n/languages';
import { formatBytes, formatDate, intlLocale } from '@/core/i18n/format';
import { availableOcrLanguages, ocrLanguageRegistry, ocrLanguagesFor } from '@/core/document-engine/ocr/ocrLanguages';

const SRC = path.join(__dirname, '..');

function flatten(o: object, p = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[`${p}${k}`, v]] : Object.entries(flatten(v, `${p}${k}.`)))),
  );
}
const placeholders = (s: string) => [...s.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map((m) => m[1]).sort();
/** i18next plural suffixes: en uses _one/_other, th only _other. */
const baseKey = (k: string) => k.replace(/_(zero|one|two|few|many|other)$/, '');

const english = flatten(en);
const production = languageRegistry.filter((l) => l.status === 'production');

describe('language registry', () => {
  it('production build offers exactly English and Thai; previews only in development', () => {
    expect(availableLanguages(false).map((l) => l.code)).toEqual(['en', 'th']);
    expect(availableLanguages(true).map((l) => l.code)).toContain('en-XA');
    expect(usableLanguage('en-XA', false)).toBeNull();
    expect(usableLanguage('th', false)).toBe('th');
    expect(usableLanguage('xx', false)).toBeNull();
  });

  it('every registered language has resources, a valid direction and Intl locale', () => {
    for (const l of languageRegistry) {
      expect(resources[l.code]).toBeDefined();
      expect(['ltr', 'rtl']).toContain(l.dir);
      expect(() => new Intl.DateTimeFormat(l.intlLocale)).not.toThrow();
    }
  });

  it('resolves device locales: exact, base language, otherwise English', () => {
    expect(resolveLanguage(['th-TH'], false)).toBe('th');
    expect(resolveLanguage(['en_US'], false)).toBe('en');
    expect(resolveLanguage(['ja-JP', 'th-TH'], false)).toBe('th');
    expect(resolveLanguage(['ar-SA', 'zh-Hant-TW'], false)).toBe('en');
    expect(resolveLanguage([], false)).toBe('en');
    expect(resolveLanguage(['en-XA'], false)).toBe('en');
  });
});

describe.each(production.map((l) => l.code))('production language %s', (code) => {
  const lang = flatten(resources[code]);

  it('has every English key and no extra keys', () => {
    const missing = Object.keys(english).filter((k) => !(k in lang) && !(baseKey(k) !== k && `${baseKey(k)}_other` in lang));
    const extra = Object.keys(lang).filter((k) => !(k in english) && !(baseKey(k) !== k && `${baseKey(k)}_other` in english));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it('has no empty, placeholder or untranslated-key text', () => {
    const bad = Object.entries(lang).filter(([k, v]) => !v.trim() || v === k || /^(TODO|TBD|FIXME|xxx)\b/i.test(v) || /^[a-z_]+(\.[a-z_]+)+$/.test(v));
    expect(bad).toEqual([]);
  });

  it('uses the same {{variables}} as English', () => {
    const wrong = Object.entries(lang).filter(([k, v]) => {
      const src = english[k] ?? english[`${baseKey(k)}_other`];
      return src !== undefined && placeholders(v).join() !== placeholders(src).join();
    });
    expect(wrong).toEqual([]);
  });

  it('has well-formed placeholders', () => {
    const broken = Object.entries(lang).filter(([, v]) => (v.match(/\{\{/g) ?? []).length !== (v.match(/\}\}/g) ?? []).length || /\{\{\s*\}\}/.test(v));
    expect(broken).toEqual([]);
  });
});

describe('locale source files', () => {
  it('have no duplicate keys within an object', () => {
    for (const file of fs.readdirSync(path.join(SRC, 'core/i18n/locales')).filter((f) => /^[a-zA-Z-]+\.ts$/.test(f) && !['index.ts', 'pseudo.ts'].includes(f))) {
      const stack: Set<string>[] = [new Set()];
      const dups: string[] = [];
      for (const line of fs.readFileSync(path.join(SRC, 'core/i18n/locales', file), 'utf8').split('\n')) {
        const m = line.match(/^\s*'?([\w-]+)'?\s*:\s*(\{)?/);
        if (m && !line.trim().startsWith('//')) {
          const seen = stack[stack.length - 1];
          if (seen.has(m[1])) dups.push(`${file}: ${m[1]}`);
          seen.add(m[1]);
          if (m[2] && !line.includes('}')) stack.push(new Set());
        } else if (/^\s*\},?\s*$/.test(line) && stack.length > 1) stack.pop();
      }
      expect(dups).toEqual([]);
    }
  });
});

describe('keys used in code', () => {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!['__tests__', 'locales'].includes(e.name)) walk(p);
      } else if (/\.tsx?$/.test(e.name)) files.push(p);
    }
  };
  walk(SRC);
  const exists = (k: string) => k in english || `${k}_other` in english;
  const isGroup = (k: string) => Object.keys(english).some((e) => e.startsWith(`${k}.`));

  it('every static t(\'key\') exists in English', () => {
    const missing: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*'([a-z0-9_]+(?:\.[a-z0-9_]+)+)'/g)) if (!exists(m[1])) missing.push(`${path.relative(SRC, f)}: ${m[1]}`);
      // Keys built from a prefix (t(`appearance.${x}`)) must at least name an existing group.
      for (const m of src.matchAll(/\bt\(\s*`([a-z0-9_.]+)\.\$\{/g)) if (!isGroup(m[1])) missing.push(`${path.relative(SRC, f)}: ${m[1]}.*`);
    }
    expect(missing).toEqual([]);
  });

  it('OCR language labels exist', () => {
    for (const l of ocrLanguageRegistry) expect(exists(l.labelKey)).toBe(true);
  });
});

describe('runtime fallback', () => {
  beforeAll(() => {
    initI18n('en');
  });
  afterAll(() => i18n.changeLanguage('en'));

  it('a key missing in a language falls back to English', async () => {
    i18n.addResourceBundle('zz', 'translation', { common: { cancel: 'Zz-cancel' } });
    await i18n.changeLanguage('zz');
    expect(i18n.t('common.cancel')).toBe('Zz-cancel');
    expect(i18n.t('common.save')).toBe(english['common.save']);
  });

  it('an unknown key shows nothing rather than the key, and does not throw', async () => {
    await i18n.changeLanguage('th');
    const t = i18n.t as unknown as (k: string) => string;
    expect(t('no_such.screen_key')).toBe('');
  });

  it('interpolates and pluralises', async () => {
    await i18n.changeLanguage('en');
    const t = i18n.t as unknown as (k: string, o: object) => string;
    expect(t('ocr.matches', { count: 3 })).toContain('3');
    await i18n.changeLanguage('th');
    expect(t('ocr.matches', { count: 3 })).toContain('3');
  });
});

describe('pseudo-locale', () => {
  it('lengthens text by ~40% and keeps variables intact', () => {
    const s = pseudoString('Saved {{count}} pages');
    expect(s).toContain('{{count}}');
    expect(s.length).toBeGreaterThanOrEqual(Math.floor('Saved {{count}} pages'.length * 1.4));
    expect(placeholders(s)).toEqual(['count']);
  });
});

describe('locale-aware formatting', () => {
  it('uses the registry Intl locale (Thai: Buddhist calendar)', () => {
    expect(intlLocale('th')).toBe('th-TH');
    expect(intlLocale('unknown')).toBe('en-GB');
    expect(formatDate(Date.UTC(2026, 0, 15, 12), 'th')).toContain('2569');
    expect(formatDate(Date.UTC(2026, 0, 15, 12), 'en')).toContain('2026');
  });

  it('formats file sizes with locale separators', () => {
    expect(formatBytes(512, 'en')).toBe('512 B');
    expect(formatBytes(1536, 'en')).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024, 'th')).toBe('5 MB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });
});

describe('OCR language (independent of app language)', () => {
  it('production offers the QA-passed Thai+English pack only; default auto reads Thai and English', () => {
    expect(availableOcrLanguages(false).map((l) => l.id)).toEqual(['auto', 'th+en']);
    expect(ocrLanguagesFor('auto', false)).toEqual(['th', 'en']);
    expect(ocrLanguagesFor('latin', false)).toEqual(['th', 'en']);
    expect(ocrLanguagesFor(undefined, false)).toEqual(['th', 'en']);
    expect(ocrLanguagesFor('latin', true)).toEqual(['en']);
  });

  it('every OCR pack is bundled (no downloads, no cloud OCR yet)', () => {
    expect(ocrLanguageRegistry.every((l) => l.source === 'bundled')).toBe(true);
  });
});

describe('hard-coded UI strings', () => {
  it('none in production UI code', () => {
    let python = true;
    try {
      execFileSync('python3', ['--version']);
    } catch {
      python = false;
    }
    if (!python) return;
    const out = execFileSync('python3', [path.join(SRC, '../tools/i18n/find_hardcoded.py'), SRC, '--json'], { encoding: 'utf8' });
    expect(JSON.parse(out)).toEqual([]);
  });
});
