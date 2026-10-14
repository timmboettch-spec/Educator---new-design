import dayjs from 'dayjs';
import { describe, it, expect } from 'vitest';
import {
  ISO_DATE_REGEX,
  getDateRangeErrors,
  isIsoDate,
  isTodayOrFutureDate,
} from '../../../src/utils/schema-utils/dateRules';

describe('ISO_DATE_REGEX', () => {
  it.each(['2026-01-31', '1999-12-01'])('accepts %s', (value) => {
    expect(ISO_DATE_REGEX.test(value)).toBe(true);
  });

  it.each(['01-31-2026', '2026/01/31', '2026-1-31', '2026-01-31T00:00:00'])(
    'rejects %s',
    (value) => {
      expect(ISO_DATE_REGEX.test(value)).toBe(false);
    }
  );
});

describe('isIsoDate', () => {
  it.each(['2024-02-29', '2026-01-31'])('accepts %s', (value) => {
    expect(isIsoDate(value)).toBe(true);
  });

  it.each(['2024-02-31', '2023-02-29', '2024-13-01', '01/02/2024', ''])(
    'rejects %s',
    (value) => {
      expect(isIsoDate(value)).toBe(false);
    }
  );
});

describe('getDateRangeErrors', () => {
  it('accepts empty sides', () => {
    expect(getDateRangeErrors('', '')).toEqual({});
    expect(getDateRangeErrors('2024-01-01', '')).toEqual({});
    expect(getDateRangeErrors('', '2024-01-01')).toEqual({});
  });

  it('accepts an end date on or after the start date', () => {
    expect(getDateRangeErrors('2024-01-01', '2024-01-01')).toEqual({});
    expect(getDateRangeErrors('2024-01-01', '2024-12-31')).toEqual({});
  });

  it('flags an end date before the start date on the end side', () => {
    expect(getDateRangeErrors('2024-03-10', '2024-03-09')).toEqual({
      end: 'endBeforeStart',
    });
  });

  it('flags text that is not a complete date on its own side', () => {
    expect(getDateRangeErrors('12/03', '2024-03-09')).toEqual({
      start: 'invalid',
    });
    expect(getDateRangeErrors('2024-03-09', '31/02/2024')).toEqual({
      end: 'invalid',
    });
    expect(getDateRangeErrors('2024-02-31', '')).toEqual({ start: 'invalid' });
  });

  it('does not compare the order while either side is invalid', () => {
    expect(getDateRangeErrors('2025-01-01', 'abc')).toEqual({ end: 'invalid' });
  });
});

describe('isTodayOrFutureDate', () => {
  it('returns true for today', () => {
    expect(isTodayOrFutureDate(dayjs().format('YYYY-MM-DD'))).toBe(true);
  });

  it('returns true for a future date', () => {
    expect(
      isTodayOrFutureDate(dayjs().add(1, 'day').format('YYYY-MM-DD'))
    ).toBe(true);
  });

  it('returns false for a past date', () => {
    expect(
      isTodayOrFutureDate(dayjs().subtract(1, 'day').format('YYYY-MM-DD'))
    ).toBe(false);
  });
});
