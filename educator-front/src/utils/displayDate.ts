import dayjs from 'dayjs';

/** How dates are shown on the Classes screen (RE-131). */
export const DISPLAY_DATE_FORMAT = 'MM-DD-YYYY';

/** Formats a stored (ISO) date as MM-DD-YYYY, or returns `fallback` when there is none. */
export const formatDisplayDate = (value?: string, fallback = '') =>
  value ? dayjs(value).format(DISPLAY_DATE_FORMAT) : fallback;
