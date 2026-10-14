import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

/**
 * Shared dayjs instance with the UTC plugin enabled. Import dayjs from here
 * (not from 'dayjs' directly) so the plugin is always registered.
 */
export { dayjs };

/** Current moment in UTC. */
export function nowUtc(): dayjs.Dayjs {
  return dayjs.utc();
}

/** Parses a date-like value as UTC. */
export function toUtc(value?: dayjs.ConfigType): dayjs.Dayjs {
  return dayjs.utc(value);
}

/** Formats a date-like value as an ISO-8601 UTC string. */
export function toUtcIsoString(value?: dayjs.ConfigType): string {
  return dayjs.utc(value).toISOString();
}

/** Whole seconds (rounded up, never negative) from now until `start` + `minutes` elapses. */
export function secondsUntilWindowEnds(start: dayjs.ConfigType, minutes: number): number {
  const seconds = dayjs.utc(start).add(minutes, 'minute').diff(nowUtc(), 'second', true);
  return Math.max(0, Math.ceil(seconds));
}
