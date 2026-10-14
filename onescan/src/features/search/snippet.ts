/**
 * Matched-text snippet for a search result, cut from the document's OCR text in the UI
 * layer (the search engine itself is unchanged). Finds the first query term that occurs,
 * case-insensitively, and returns the words around it with the match separated so the
 * screen can highlight it. Works for Thai (no spaces) as well as spaced languages.
 */
export interface Snippet {
  before: string;
  match: string;
  after: string;
}

/** Query terms worth highlighting: words of 2+ characters, without operator prefixes (type:, before:…). */
export function queryTerms(query: string): string[] {
  return query
    .split(/\s+/)
    .map((w) => w.replace(/^["'(]+|["')]+$/g, ''))
    .filter((w) => w.length >= 2 && !/^[a-z]+:/i.test(w) && !/^(AND|OR|NOT)$/.test(w));
}

export function matchSnippet(text: string, query: string, radius = 48): Snippet | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, ' ').trim();
  const lower = flat.toLocaleLowerCase();
  for (const term of queryTerms(query)) {
    const at = lower.indexOf(term.toLocaleLowerCase());
    if (at < 0) continue;
    const start = Math.max(0, at - radius);
    const end = Math.min(flat.length, at + term.length + radius * 2);
    return {
      before: (start > 0 ? '…' : '') + flat.slice(start, at),
      match: flat.slice(at, at + term.length),
      after: flat.slice(at + term.length, end) + (end < flat.length ? '…' : ''),
    };
  }
  return null;
}
