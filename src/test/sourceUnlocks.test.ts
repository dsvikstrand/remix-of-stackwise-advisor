import { describe, expect, it } from 'vitest';
import { computeUnlockCost } from '../../server/services/sourceUnlocks';

describe('source unlock pricing', () => {
  it('charges 1.000 for single subscriber', () => {
    expect(computeUnlockCost(1)).toBe(1);
  });

  it('keeps manual unlocks at 1.000 for shared assets', () => {
    expect(computeUnlockCost(3)).toBe(1);
  });

  it('ignores subscriber count for manual display cost', () => {
    expect(computeUnlockCost(1000)).toBe(1);
  });
});
