/**
 * Natural-language service matching (spec §17, §24).
 *
 * Thai has no word spaces, so matching is substring-based against curated
 * keywords and service names, weighted by match length. This is a local
 * baseline; the AI recommender (server) replaces `rankServices` and returns
 * the same shape. Results are recommendations, never a guaranteed diagnosis.
 */
export interface Searchable {
  id: string;
  name: string;
  keywords: string[];
  available?: boolean;
}

export interface SearchHit<T> {
  item: T;
  score: number;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/[ๆ.,!?]/g, '');

export function rankServices<T extends Searchable>(query: string, items: T[], limit = 5): SearchHit<T>[] {
  const q = norm(query);
  if (!q) return [];
  return items
    .map((item) => {
      let score = 0;
      const name = norm(item.name);
      if (name === q) score += 100;
      else if (name.includes(q)) score += 40 + q.length;
      else if (q.includes(name)) score += 30 + name.length;
      for (const k of item.keywords.map(norm)) {
        if (k === q) score += 60;
        else if (q.includes(k)) score += 10 + k.length * 2; // longer keyword = more specific
        else if (k.includes(q) && q.length >= 2) score += 5 + q.length;
      }
      if (item.available === false) score *= 0.5;
      return { item, score };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
