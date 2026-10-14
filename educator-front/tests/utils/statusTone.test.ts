import { describe, it, expect } from 'vitest';
import { getStatusTone } from '../../src/utils/statusTone';

describe('getStatusTone', () => {
  it.each([
    ['ACTIVE', 'success'],
    ['active', 'success'],
    ['ATTENTION', 'warning'],
    ['PENDING', 'warning'],
    ['pending', 'warning'],
    ['DRAFT', 'neutral'],
    ['INACTIVE', 'neutral'],
    ['ARCHIEVED', 'neutral'],
    ['ARCHIVED', 'neutral'],
  ] as const)('maps %s to tone %s', (status, tone) => {
    expect(getStatusTone(status)).toBe(tone);
  });

  it('falls back to neutral for unknown values', () => {
    expect(getStatusTone('SOMETHING_ELSE')).toBe('neutral');
  });

  it('falls back to neutral for undefined/null', () => {
    expect(getStatusTone(undefined)).toBe('neutral');
    expect(getStatusTone(null)).toBe('neutral');
  });
});
