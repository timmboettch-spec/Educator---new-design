/**
 * @jest-environment ./tests/unit/common/dayjs.utils.spec.ts
 */
import NodeEnvironment from 'jest-environment-node';
import { dayjs, nowUtc, toUtc, toUtcIsoString } from '../../../src/common/utils/dayjs.utils';

// This file doubles as its own Jest environment (see the docblock above). A spec's `process.env`
// is a sandboxed copy, so assigning TZ inside a test never reaches Node; the environment runs in
// the real process instead. A +05:30 zone makes any local-time leak visible whatever the host TZ.
export default class KolkataTzEnvironment extends NodeEnvironment {
  static readonly TZ = 'Asia/Kolkata';

  private readonly hostTz = process.env.TZ;

  async setup(): Promise<void> {
    process.env.TZ = KolkataTzEnvironment.TZ;
    await super.setup();
  }

  async teardown(): Promise<void> {
    if (this.hostTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = this.hostTz;
    }
    await super.teardown();
  }
}

// Jest loads this file twice: once as the environment (no test globals) and once as the spec.
if (typeof describe === 'function') {
  describe('dayjs.utils (non-UTC process TZ)', () => {
    it('UNIT: runs under a non-UTC local zone', () => {
      expect(new Date('2026-01-01T00:00:00Z').getTimezoneOffset()).toBe(-330);
    });

    it('UNIT: re-exports dayjs with the utc plugin registered', () => {
      expect(typeof dayjs.utc).toBe('function');
      expect(dayjs.utc().isUTC()).toBe(true);
    });

    it('UNIT: nowUtc() is in UTC mode with a zero offset', () => {
      const now = nowUtc();
      expect(now.isUTC()).toBe(true);
      expect(now.utcOffset()).toBe(0);
    });

    it('UNIT: toUtc() converts an offset input to UTC', () => {
      const value = toUtc('2026-03-10T10:00:00+05:30');
      expect(value.isUTC()).toBe(true);
      expect(value.format('YYYY-MM-DD HH:mm')).toBe('2026-03-10 04:30');
    });

    it('UNIT: toUtc() parses a naive input as UTC, not local time', () => {
      const value = toUtc('2026-03-10 10:00');
      expect(value.format('YYYY-MM-DD HH:mm')).toBe('2026-03-10 10:00');
      expect(value.toISOString()).toBe('2026-03-10T10:00:00.000Z');
    });

    it('UNIT: toUtc() keeps a Date instant unchanged', () => {
      const date = new Date('2026-03-10T23:30:00Z');
      expect(toUtc(date).valueOf()).toBe(date.valueOf());
      expect(toUtc(date).format('YYYY-MM-DD')).toBe('2026-03-10');
    });

    it('UNIT: toUtcIsoString() outputs an ISO-8601 Z string', () => {
      expect(toUtcIsoString('2026-03-10T10:00:00+05:30')).toBe('2026-03-10T04:30:00.000Z');
      expect(toUtcIsoString('2026-03-10 10:00')).toBe('2026-03-10T10:00:00.000Z');
    });

    it('UNIT: toUtcIsoString() with no argument formats the current moment as Z', () => {
      const before = Date.now();
      const iso = toUtcIsoString();
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(Date.parse(iso)).toBeGreaterThanOrEqual(before);
    });
  });
}
