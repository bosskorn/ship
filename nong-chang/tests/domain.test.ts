// Run with: npm test  (Node ≥22.18 strips TypeScript types natively)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_WEIGHTS, rankCandidates, scoreCandidate, type Candidate } from '../src/domain/dispatch.ts';
import { canStartWork, canTransition, hasReached, isActive } from '../src/domain/job.ts';
import { calculatePrice, quoteTotal, technicianNet, withdrawalPreview } from '../src/domain/pricing.ts';
import { rankServices } from '../src/domain/search.ts';

describe('pricing engine', () => {
  it('reproduces the spec quote: 450 + 220 + 80 - 199 = 551', () => {
    const q = quoteTotal({ labor: 450, parts: [{ label: 'วาล์ว', amount: 220 }, { label: 'ข้อต่อ', amount: 80 }], inspectionCredit: 199 });
    assert.equal(q.subtotal, 750);
    assert.equal(q.discount, 199);
    assert.equal(q.total, 551);
    assert.equal(q.lines[0].label, 'ค่าแรง');
  });

  it('applies quantity, urgency, promotion then credit', () => {
    const p = calculatePrice({ base: 590, quantity: 2, urgent: true, urgencyFee: 100, promotion: { label: 'P', percent: 10 }, credit: 50 });
    assert.equal(p.subtotal, 1280);
    assert.equal(p.total, 1280 - 128 - 50);
  });

  it('caps percentage promotions and never goes below zero', () => {
    assert.equal(calculatePrice({ base: 1000, promotion: { label: 'P', percent: 50, maxDiscount: 100 } }).total, 900);
    const free = calculatePrice({ base: 100, promotion: { label: 'P', amount: 80 }, credit: 500 });
    assert.equal(free.total, 0);
    assert.equal(free.discount, 100);
  });

  it('matches spec technician earnings and withdrawal preview', () => {
    assert.equal(technicianNet(590), 501.5);
    assert.deepEqual(withdrawalPreview(1000, 10), { amount: 1000, fee: 10, net: 990 });
    assert.deepEqual(withdrawalPreview(5, 10), { amount: 5, fee: 5, net: 0 });
  });
});

describe('dispatch engine', () => {
  const base: Candidate = {
    id: 'a', online: true, busy: false, distanceKm: 2, skills: ['aircon'],
    rating: 4.8, successRate: 0.95, acceptanceRate: 0.9, cancellationRate: 0.02,
  };

  it('default weights sum to 100', () => {
    assert.equal(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  });

  it('filters ineligible technicians', () => {
    const ranked = rankCandidates(
      [
        base,
        { ...base, id: 'offline', online: false },
        { ...base, id: 'busy', busy: true },
        { ...base, id: 'noskill', skills: ['plumbing'] },
        { ...base, id: 'far', distanceKm: 50 },
      ],
      { skill: 'aircon' },
    );
    assert.deepEqual(ranked.map((r) => r.candidate.id), ['a']);
  });

  it('prefers closer, better-rated technicians', () => {
    const ranked = rankCandidates([{ ...base, id: 'far', distanceKm: 8 }, base, { ...base, id: 'low', rating: 3.5 }], { skill: 'aircon' });
    assert.equal(ranked[0].candidate.id, 'a');
    assert.ok(ranked[0].score > ranked[1].score);
  });

  it('respects admin-configured weights', () => {
    const near = { ...base, id: 'near', distanceKm: 0.5, rating: 4.0 };
    const star = { ...base, id: 'star', distanceKm: 6, rating: 5.0 };
    const distanceOnly = { ...DEFAULT_WEIGHTS, distance: 100, rating: 0, skill: 0, jobSuccess: 0, acceptanceRate: 0, cancellation: 0 };
    const ratingOnly = { ...DEFAULT_WEIGHTS, distance: 0, rating: 100, skill: 0, jobSuccess: 0, acceptanceRate: 0, cancellation: 0 };
    assert.equal(rankCandidates([near, star], { skill: 'aircon', weights: distanceOnly })[0].candidate.id, 'near');
    assert.equal(rankCandidates([near, star], { skill: 'aircon', weights: ratingOnly })[0].candidate.id, 'star');
  });

  it('scores within 0–100', () => {
    const s = scoreCandidate({ ...base, distanceKm: 0, rating: 5, successRate: 1, acceptanceRate: 1, cancellationRate: 0 }, { skill: 'aircon' });
    assert.equal(s.score, 100);
  });
});

describe('job state machine', () => {
  it('blocks work before customer approval', () => {
    assert.equal(canTransition('quoted', 'in_progress'), false);
    assert.equal(canTransition('started', 'in_progress'), false);
    assert.equal(canTransition('quoted', 'approved'), true);
    assert.equal(canStartWork('quoted'), false);
    assert.equal(canStartWork('approved'), true);
  });

  it('orders statuses and classifies active jobs', () => {
    assert.ok(hasReached('en_route', 'matched'));
    assert.ok(!hasReached('matched', 'en_route'));
    assert.ok(!hasReached('cancelled', 'created'));
    assert.ok(isActive('in_progress'));
    assert.ok(!isActive('paid'));
    assert.ok(!isActive('created')); // scheduled, not yet active
  });
});

describe('natural-language search', () => {
  const items = [
    { id: 'wash', name: 'ล้างแอร์ติดผนัง', keywords: ['ล้างแอร์', 'แอร์'] },
    { id: 'notcold', name: 'แอร์ไม่เย็น', keywords: ['แอร์ไม่เย็น', 'แอร์ร้อน'] },
    { id: 'leak', name: 'น้ำรั่ว', keywords: ['น้ำรั่ว', 'ท่อรั่ว'] },
    { id: 'outlet', name: 'ปลั๊กไฟ', keywords: ['ปลั๊กเสีย', 'ปลั๊ก'] },
  ];

  it('maps the spec examples to services', () => {
    assert.equal(rankServices('แอร์ไม่เย็น', items)[0].item.id, 'notcold');
    assert.equal(rankServices('น้ำรั่ว', items)[0].item.id, 'leak');
    assert.equal(rankServices('ปลั๊กเสีย', items)[0].item.id, 'outlet');
  });

  it('understands sentences containing a keyword', () => {
    assert.equal(rankServices('ที่บ้านแอร์ไม่เย็นเลยครับ', items)[0].item.id, 'notcold');
  });

  it('returns nothing for empty queries', () => {
    assert.deepEqual(rankServices('  ', items), []);
  });
});
