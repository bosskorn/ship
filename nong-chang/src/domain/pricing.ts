/**
 * Pricing engine (spec §55).
 *
 *   Base Service + Complexity + Parts + Urgency + Distance Adjustment
 *   - Promotion - Credit = Customer Total
 *
 * All amounts are THB. Discounts can never push the total below zero, and
 * credit is applied after promotions.
 */
export type PricingModel = 'fixed' | 'inspection';

export interface PriceLine {
  key: string;
  label: string;
  amount: number; // negative for discounts
  kind: 'base' | 'complexity' | 'labor' | 'part' | 'urgency' | 'distance' | 'addon' | 'promotion' | 'credit' | 'inspection';
}

export interface PriceInput {
  base: number;
  quantity?: number;
  complexity?: number;
  parts?: { label: string; amount: number }[];
  addons?: { label: string; amount: number }[];
  urgent?: boolean;
  urgencyFee?: number;
  distanceAdjustment?: number;
  promotion?: { label: string; amount?: number; percent?: number; maxDiscount?: number };
  credit?: number;
  /** Inspection fee that is refunded against the final quote. */
  inspectionCredit?: number;
}

export interface PriceBreakdown {
  lines: PriceLine[];
  subtotal: number;
  discount: number;
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calculatePrice(input: PriceInput): PriceBreakdown {
  const qty = Math.max(1, input.quantity ?? 1);
  const lines: PriceLine[] = [{ key: 'base', label: 'ค่าบริการ', amount: input.base * qty, kind: 'base' }];

  if (input.complexity) lines.push({ key: 'complexity', label: 'ความซับซ้อนของงาน', amount: input.complexity, kind: 'complexity' });
  input.parts?.forEach((p, i) => lines.push({ key: `part-${i}`, label: p.label, amount: p.amount, kind: 'part' }));
  input.addons?.forEach((a, i) => lines.push({ key: `addon-${i}`, label: a.label, amount: a.amount, kind: 'addon' }));
  if (input.urgent && input.urgencyFee) lines.push({ key: 'urgency', label: 'ค่าบริการด่วน', amount: input.urgencyFee, kind: 'urgency' });
  if (input.distanceAdjustment) lines.push({ key: 'distance', label: 'ค่าเดินทางเพิ่มเติม', amount: input.distanceAdjustment, kind: 'distance' });

  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  let remaining = subtotal;

  const discount = (key: string, label: string, raw: number, kind: PriceLine['kind']) => {
    const amount = round2(Math.min(Math.max(0, raw), remaining));
    if (amount <= 0) return 0;
    remaining = round2(remaining - amount);
    lines.push({ key, label, amount: -amount, kind });
    return amount;
  };

  let totalDiscount = 0;
  if (input.inspectionCredit) totalDiscount += discount('inspection', 'หักค่าสำรวจ', input.inspectionCredit, 'inspection');
  if (input.promotion) {
    const { amount = 0, percent = 0, maxDiscount = Infinity, label } = input.promotion;
    const promo = Math.min(amount + (remaining * percent) / 100, maxDiscount);
    totalDiscount += discount('promotion', label, promo, 'promotion');
  }
  if (input.credit) totalDiscount += discount('credit', 'เครดิต', input.credit, 'credit');

  return { lines, subtotal, discount: round2(totalDiscount), total: remaining };
}

/** Quote built by the technician on-site (spec §32–33). */
export interface Quote {
  labor: number;
  parts: { label: string; amount: number }[];
  inspectionCredit: number;
}

export function quoteTotal(q: Quote): PriceBreakdown {
  const breakdown = calculatePrice({
    base: q.labor,
    parts: q.parts,
    inspectionCredit: q.inspectionCredit,
  });
  breakdown.lines[0] = { ...breakdown.lines[0], label: 'ค่าแรง', kind: 'labor' };
  return breakdown;
}

/** Platform commission → technician net earning (spec §49 shows 590 → 501.50). */
export const PLATFORM_COMMISSION = 0.15;
export function technicianNet(customerTotal: number, commission = PLATFORM_COMMISSION) {
  return round2(customerTotal * (1 - commission));
}

/** Withdrawal preview (spec §51). */
export function withdrawalPreview(amount: number, fee = 10) {
  const applied = Math.min(fee, amount);
  return { amount: round2(amount), fee: applied, net: round2(amount - applied) };
}
