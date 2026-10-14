/**
 * Pseudo-localisation for QA (development builds only): accented letters, ~40% longer
 * text and visible brackets, so clipped labels, fixed widths and untranslated strings
 * stand out. {{placeholders}} and $t() nesting are left intact.
 */
const MAP: Record<string, string> = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'đ', e: 'é', f: 'ƒ', g: 'ğ', h: 'ħ', i: 'î', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ',
  n: 'ñ', o: 'ö', p: 'þ', r: 'ř', s: 'š', t: 'ŧ', u: 'ü', w: 'ŵ', y: 'ý', z: 'ž',
  A: 'Á', C: 'Ç', D: 'Đ', E: 'É', G: 'Ğ', I: 'Î', N: 'Ñ', O: 'Ö', S: 'Š', U: 'Ü', Y: 'Ý', Z: 'Ž',
};

export function pseudoString(s: string): string {
  const parts = s.split(/(\{\{[^}]+\}\}|\$t\([^)]*\))/);
  const body = parts.map((p, i) => (i % 2 ? p : p.replace(/[A-Za-z]/g, (c) => MAP[c] ?? c))).join('');
  const pad = '·'.repeat(Math.ceil(s.length * 0.4));
  return `[${body}${pad ? ` ${pad}` : ''}]`;
}

export function pseudoLocalize<T>(obj: T): T {
  if (typeof obj === 'string') return pseudoString(obj) as T;
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, pseudoLocalize(v)])) as T;
  }
  return obj;
}
