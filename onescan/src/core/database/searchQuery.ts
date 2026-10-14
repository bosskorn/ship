/**
 * Local search query parser. Turns "invoice October 2026" into structured
 * filters + full-text terms so search never needs a server.
 */
export interface ParsedQuery {
  terms: string[];
  month?: number; // 1-12
  year?: number; // Gregorian
  docTypes: string[];
}

const months: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  'มกราคม': 1, 'ม.ค.': 1, 'กุมภาพันธ์': 2, 'ก.พ.': 2, 'มีนาคม': 3, 'มี.ค.': 3, 'เมษายน': 4, 'เม.ย.': 4,
  'พฤษภาคม': 5, 'พ.ค.': 5, 'มิถุนายน': 6, 'มิ.ย.': 6, 'กรกฎาคม': 7, 'ก.ค.': 7, 'สิงหาคม': 8, 'ส.ค.': 8,
  'กันยายน': 9, 'ก.ย.': 9, 'ตุลาคม': 10, 'ต.ค.': 10, 'พฤศจิกายน': 11, 'พ.ย.': 11, 'ธันวาคม': 12, 'ธ.ค.': 12,
};

const docTypeAliases: Record<string, string> = {
  invoice: 'invoice', invoices: 'invoice', 'ใบแจ้งหนี้': 'invoice', 'ใบกำกับภาษี': 'invoice',
  receipt: 'receipt', receipts: 'receipt', 'ใบเสร็จ': 'receipt',
  contract: 'contract', contracts: 'contract', 'สัญญา': 'contract',
  id: 'id_card', 'บัตร': 'id_card', 'บัตรประชาชน': 'id_card',
  'business card': 'business_card', 'นามบัตร': 'business_card',
};

/** Thai Buddhist Era years (e.g. 2569) are converted to Gregorian (2026). */
export function normalizeYear(y: number): number {
  return y >= 2400 ? y - 543 : y;
}

export function parseSearchQuery(input: string): ParsedQuery {
  const tokens = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const out: ParsedQuery = { terms: [], docTypes: [] };
  for (const tok of tokens) {
    if (months[tok] && out.month === undefined) {
      out.month = months[tok];
      continue;
    }
    if (/^\d{4}$/.test(tok)) {
      const y = normalizeYear(Number(tok));
      if (y >= 1900 && y <= 2200) {
        out.year = y;
        continue;
      }
    }
    if (docTypeAliases[tok]) {
      out.docTypes.push(docTypeAliases[tok]);
      // Keep the word as a text term too: titles often contain it.
    }
    out.terms.push(tok);
  }
  return out;
}

/** Builds a safe FTS5 MATCH expression: each term quoted + prefix-matched. */
export function toFtsMatch(terms: string[]): string | null {
  const safe = terms.map((t) => t.replace(/"/g, '')).filter((t) => t.length > 0);
  if (!safe.length) return null;
  return safe.map((t) => `"${t}"*`).join(' OR ');
}

export function monthRange(year: number, month: number): [number, number] {
  return [new Date(year, month - 1, 1).getTime(), new Date(year, month, 1).getTime()];
}
