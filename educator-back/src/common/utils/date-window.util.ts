/** UTC-safe [today, today + windowDays] date-string window, e.g. for a "closing soon" filter. */
export function getUtcDateWindow(windowDays: number): { todayStr: string; windowEndStr: string } {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const windowEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + windowDays),
  );
  return {
    todayStr: today.toISOString().slice(0, 10),
    windowEndStr: windowEnd.toISOString().slice(0, 10),
  };
}
