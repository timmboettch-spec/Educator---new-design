import type {
  SimulationsCompletedGraphMonthResDto,
  SimulationsCompletedGraphMonthSeriesResDto,
  SimulationsCompletedGraphMonths,
} from '@/redux/api/classes/classes.types';

export type CompletionTimeframe = SimulationsCompletedGraphMonths | 'all';

export const COMPLETION_TIMEFRAMES: CompletionTimeframe[] = [
  3,
  6,
  12,
  24,
  'all',
];

export const DEFAULT_COMPLETION_TIMEFRAME: CompletionTimeframe = 12;

export interface MonthBucket {
  key: string; // YYYY-MM
  label: string; // e.g. "Apr 26"
  count: number;
}

const monthKey = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, '0')}`;

/**
 * One bucket per month in the window, oldest first, ending with the current month.
 * Months the BE omits are filled with 0. For 'all', the window starts at the earliest
 * month the BE returns (no data → no buckets).
 */
export function buildMonthBuckets(
  timeframe: CompletionTimeframe,
  byMonth: SimulationsCompletedGraphMonthResDto[],
  now: Date,
  locale: string
): MonthBucket[] {
  const counts = new Map<string, number>();
  byMonth.forEach(({ year, month, count }) => {
    const key = monthKey(year, month);
    counts.set(key, (counts.get(key) ?? 0) + count);
  });

  let monthsBack: number;
  if (timeframe === 'all') {
    if (byMonth.length === 0) return [];
    const earliest = byMonth.reduce((a, b) =>
      b.year * 12 + b.month < a.year * 12 + a.month ? b : a
    );
    monthsBack =
      now.getFullYear() * 12 +
      (now.getMonth() + 1) -
      (earliest.year * 12 + earliest.month) +
      1;
    monthsBack = Math.max(monthsBack, 1);
  } else {
    monthsBack = timeframe;
  }

  const buckets: MonthBucket[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d.getFullYear(), d.getMonth() + 1);
    buckets.push({
      key,
      label: d.toLocaleDateString(locale, { month: 'short', year: '2-digit' }),
      count: counts.get(key) ?? 0,
    });
  }
  return buckets;
}

export interface CompareSeries {
  id: string;
  label: string;
  /** One count per month bucket, in bucket order. */
  counts: number[];
}

/**
 * Compare series aligned to the month buckets, one per item in `items` (in that order),
 * so an item with no completions still gets a row of zeros. Months and series the BE
 * omits count as 0; series for ids not in `items` are ignored.
 */
export function buildSeriesBuckets(
  buckets: MonthBucket[],
  byMonthSeries: SimulationsCompletedGraphMonthSeriesResDto[],
  items: { id: string; label: string }[]
): CompareSeries[] {
  const counts = new Map<string, number>();
  byMonthSeries.forEach(({ year, month, series }) => {
    const key = monthKey(year, month);
    series.forEach(({ seriesId, count }) => {
      if (seriesId === null) return;
      const cell = `${seriesId}|${key}`;
      counts.set(cell, (counts.get(cell) ?? 0) + count);
    });
  });
  return items.map(({ id, label }) => ({
    id,
    label,
    counts: buckets.map((bucket) => counts.get(`${id}|${bucket.key}`) ?? 0),
  }));
}
