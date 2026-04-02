import { describe, expect, it } from 'vitest';
import {
  normalizeIsoOrNull,
  normalizeObject,
  normalizeRequiredIso,
  normalizeStringOrNull,
} from '../../server/services/oracleValueNormalization';

describe('oracle value normalization', () => {
  it('normalizes iso strings and falls back when required', () => {
    expect(normalizeIsoOrNull('2026-04-02T13:58:55.000Z')).toBe('2026-04-02T13:58:55.000Z');
    expect(normalizeIsoOrNull('not-a-date')).toBeNull();
    expect(normalizeRequiredIso('not-a-date', '2026-04-02T13:58:55.000Z')).toBe('2026-04-02T13:58:55.000Z');
  });

  it('normalizes nullable text and plain objects', () => {
    expect(normalizeStringOrNull('  hello  ')).toBe('hello');
    expect(normalizeStringOrNull('   ')).toBeNull();
    expect(normalizeObject({ ok: true })).toEqual({ ok: true });
    expect(normalizeObject(['nope'])).toBeNull();
  });
});
