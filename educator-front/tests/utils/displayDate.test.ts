import { describe, expect, it } from 'vitest';
import { formatDisplayDate } from '../../src/utils/displayDate';

describe('formatDisplayDate', () => {
  it('shows an ISO date as MM-DD-YYYY', () => {
    expect(formatDisplayDate('2024-02-01')).toBe('02-01-2024');
  });

  it('shows a leap day', () => {
    expect(formatDisplayDate('2024-02-29')).toBe('02-29-2024');
  });

  it('returns the fallback when there is no date', () => {
    expect(formatDisplayDate(undefined, '—')).toBe('—');
    expect(formatDisplayDate('')).toBe('');
  });
});
