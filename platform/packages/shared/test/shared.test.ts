import { describe, expect, it } from 'vitest';
import {
  applyBasisPoints,
  applyMilli,
  canTransition,
  haversineMeters,
  numericToSatang,
  satangToNumeric,
  ORDER_TRANSITIONS,
} from '../src';

describe('money', () => {
  it('round-trips numeric strings without float error', () => {
    expect(numericToSatang('110.50')).toBe(11050);
    expect(numericToSatang('0.1')).toBe(10);
    expect(numericToSatang('-8.05')).toBe(-805);
    expect(satangToNumeric(11050)).toBe('110.50');
    expect(satangToNumeric(-805)).toBe('-8.05');
    expect(satangToNumeric(7)).toBe('0.07');
  });
  it('applies basis points half-up', () => {
    expect(applyBasisPoints(11000, 800)).toBe(880); // 8% of 110 = 8.80
    expect(applyBasisPoints(12345, 500)).toBe(617); // 617.25 -> 617
    expect(applyBasisPoints(12350, 500)).toBe(618); // 617.5 -> 618
    expect(applyBasisPoints(-12350, 500)).toBe(-618);
  });
  it('applies milli multipliers', () => {
    expect(applyMilli(10000, 1250)).toBe(12500);
    expect(applyMilli(333, 1500)).toBe(500); // 499.5 -> 500
  });
});

describe('order state machine', () => {
  it('lets drivers progress but not skip states', () => {
    expect(canTransition('GOING_TO_PICKUP', 'ARRIVED_PICKUP', 'DRIVER')).toBe(true);
    expect(canTransition('GOING_TO_PICKUP', 'DELIVERED', 'DRIVER')).toBe(false);
    expect(canTransition('IN_TRANSIT', 'DELIVERED', 'DRIVER')).toBe(false);
  });
  it('does not let customers move delivery states', () => {
    expect(canTransition('ARRIVED_DESTINATION', 'DELIVERED', 'CUSTOMER')).toBe(false);
    expect(canTransition('SEARCHING_DRIVER', 'CANCELLED', 'CUSTOMER')).toBe(true);
    expect(canTransition('PICKED_UP', 'CANCELLED', 'CUSTOMER')).toBe(false);
  });
  it('terminal states have no exits', () => {
    for (const s of ['DELIVERED', 'CANCELLED', 'FAILED', 'RETURNED'] as const) {
      expect(ORDER_TRANSITIONS[s]).toHaveLength(0);
    }
  });
});

describe('geo', () => {
  it('computes Lat Phrao -> Bang Na roughly 13 km', () => {
    const d = haversineMeters({ lat: 13.8167, lng: 100.5615 }, { lat: 13.6681, lng: 100.6045 });
    expect(d).toBeGreaterThan(15_000);
    expect(d).toBeLessThan(18_000);
  });
});
