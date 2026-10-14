import { describe, expect, it } from 'vitest';
import {
  buildMonthBuckets,
  buildSeriesBuckets,
} from '../../../src/utils/completionTrend';

// Local-time date in the middle of the month, so month arithmetic isn't timezone-sensitive.
const APR_2026 = new Date(2026, 3, 15);

describe('buildMonthBuckets', () => {
  it('builds N months ending with the current month, oldest first', () => {
    const buckets = buildMonthBuckets(3, [], APR_2026, 'en-US');
    expect(buckets.map((b) => b.key)).toEqual([
      '2026-02',
      '2026-03',
      '2026-04',
    ]);
  });

  it('labels months as short month + 2-digit year', () => {
    const [bucket] = buildMonthBuckets(3, [], APR_2026, 'en-US').slice(-1);
    expect(bucket?.label).toBe('Apr 26');
  });

  it('fills months missing from the BE with 0 and places counts by year-month', () => {
    const buckets = buildMonthBuckets(
      6,
      [
        { year: 2026, month: 2, count: 5 },
        { year: 2026, month: 4, count: 7 },
      ],
      APR_2026,
      'en-US'
    );
    expect(buckets.map((b) => b.count)).toEqual([0, 0, 0, 5, 0, 7]);
  });

  it('crosses a year boundary', () => {
    const buckets = buildMonthBuckets(
      6,
      [{ year: 2025, month: 12, count: 2 }],
      APR_2026,
      'en-US'
    );
    expect(buckets.map((b) => b.key)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
    ]);
    expect(buckets[1]?.count).toBe(2);
  });

  it('ignores BE months outside the window', () => {
    const buckets = buildMonthBuckets(
      3,
      [{ year: 2025, month: 1, count: 99 }],
      APR_2026,
      'en-US'
    );
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(0);
  });

  it('starts all-time from the earliest month the BE returns', () => {
    const buckets = buildMonthBuckets(
      'all',
      [
        { year: 2026, month: 3, count: 1 },
        { year: 2025, month: 11, count: 4 },
      ],
      APR_2026,
      'en-US'
    );
    expect(buckets[0]?.key).toBe('2025-11');
    expect(buckets[buckets.length - 1]?.key).toBe('2026-04');
    expect(buckets).toHaveLength(6);
  });

  it('returns no buckets for all-time with no data', () => {
    expect(buildMonthBuckets('all', [], APR_2026, 'en-US')).toEqual([]);
  });

  it('localises labels', () => {
    const [bucket] = buildMonthBuckets(3, [], APR_2026, 'es-ES').slice(-1);
    expect(bucket?.label.toLowerCase()).toContain('abr');
  });
});

describe('buildSeriesBuckets', () => {
  const buckets = buildMonthBuckets(3, [], APR_2026, 'en-US'); // Feb–Apr 2026
  const items = [
    { id: 'c1', label: 'Biology 101' },
    { id: 'c2', label: 'Chemistry 202' },
  ];

  it('aligns each item to the month buckets, in item order', () => {
    const series = buildSeriesBuckets(
      buckets,
      [
        {
          year: 2026,
          month: 2,
          total: 3,
          series: [{ seriesId: 'c2', seriesName: 'Chemistry 202', count: 3 }],
        },
        {
          year: 2026,
          month: 4,
          total: 5,
          series: [
            { seriesId: 'c1', seriesName: 'Biology 101', count: 4 },
            { seriesId: 'c2', seriesName: 'Chemistry 202', count: 1 },
          ],
        },
      ],
      items
    );
    expect(series).toEqual([
      { id: 'c1', label: 'Biology 101', counts: [0, 0, 4] },
      { id: 'c2', label: 'Chemistry 202', counts: [3, 0, 1] },
    ]);
  });

  it('gives an item with no completions a row of zeros', () => {
    expect(buildSeriesBuckets(buckets, [], items)).toEqual([
      { id: 'c1', label: 'Biology 101', counts: [0, 0, 0] },
      { id: 'c2', label: 'Chemistry 202', counts: [0, 0, 0] },
    ]);
  });

  it('ignores series outside the items and months outside the window', () => {
    const series = buildSeriesBuckets(
      buckets,
      [
        {
          year: 2025,
          month: 12,
          total: 9,
          series: [{ seriesId: 'c1', seriesName: 'Biology 101', count: 9 }],
        },
        {
          year: 2026,
          month: 3,
          total: 2,
          series: [
            { seriesId: 'other', seriesName: 'Other', count: 1 },
            { seriesId: null, seriesName: null, count: 1 },
          ],
        },
      ],
      items.slice(0, 1)
    );
    expect(series).toEqual([
      { id: 'c1', label: 'Biology 101', counts: [0, 0, 0] },
    ]);
  });
});
