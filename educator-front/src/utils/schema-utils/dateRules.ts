import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date in YYYY-MM-DD form (2024-02-31 is not). */
export const isIsoDate = (value: string): boolean =>
  ISO_DATE_REGEX.test(value) && dayjs(value, 'YYYY-MM-DD', true).isValid();

export type DateRangeError = 'invalid' | 'endBeforeStart';

export interface DateRangeErrors {
  start?: DateRangeError;
  end?: DateRangeError;
}

/**
 * Checks a from/to date pair where each side is empty, an ISO date, or text
 * that isn't a complete date yet. An empty side is valid (not filtered on).
 */
export const getDateRangeErrors = (
  start: string,
  end: string
): DateRangeErrors => {
  const errors: DateRangeErrors = {};
  if (start && !isIsoDate(start)) errors.start = 'invalid';
  if (end && !isIsoDate(end)) errors.end = 'invalid';
  if (!errors.start && !errors.end && start && end && end < start) {
    errors.end = 'endBeforeStart';
  }
  return errors;
};

/** True when the date falls on today or any later day (time of day is ignored). */
export const isTodayOrFutureDate = (value: string): boolean =>
  dayjs(value).isSame(dayjs(), 'day') || dayjs(value).isAfter(dayjs(), 'day');
