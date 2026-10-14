import { toIsoStartDateTime, toIsoEndDateTime } from './lti-date-format.util';

describe('lti-date-format.util', () => {
  describe('toIsoStartDateTime', () => {
    it('should convert MM-DD-YYYY to ISO start datetime', () => {
      expect(toIsoStartDateTime('03-15-2026')).toBe('2026-03-15T00:00:00Z');
    });

    it('should convert YYYY-MM-DD to ISO start datetime', () => {
      expect(toIsoStartDateTime('2026-03-15')).toBe('2026-03-15T00:00:00Z');
    });

    it('should handle YYYY-MM-DD with existing time component', () => {
      expect(toIsoStartDateTime('2026-03-15T12:34:56')).toBe('2026-03-15T00:00:00Z');
    });

    it('should return undefined for null', () => {
      expect(toIsoStartDateTime(null)).toBeUndefined();
    });

    it('should return undefined for undefined', () => {
      expect(toIsoStartDateTime(undefined)).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      expect(toIsoStartDateTime('')).toBeUndefined();
    });

    it('should return undefined for string containing undefined', () => {
      expect(toIsoStartDateTime('undefined')).toBeUndefined();
    });

    it('should return undefined for invalid format', () => {
      expect(toIsoStartDateTime('invalid-date')).toBeUndefined();
    });

    it('should return undefined for out-of-range MM-DD-YYYY', () => {
      expect(toIsoStartDateTime('13-40-2026')).toBeUndefined();
    });

    it('should return undefined for out-of-range YYYY-MM-DD', () => {
      expect(toIsoStartDateTime('2026-13-40')).toBeUndefined();
    });
  });

  describe('toIsoEndDateTime', () => {
    it('should convert MM-DD-YYYY to ISO end datetime', () => {
      expect(toIsoEndDateTime('03-15-2026')).toBe('2026-03-15T23:59:59Z');
    });

    it('should convert YYYY-MM-DD to ISO end datetime', () => {
      expect(toIsoEndDateTime('2026-03-15')).toBe('2026-03-15T23:59:59Z');
    });

    it('should handle YYYY-MM-DD with existing time component', () => {
      expect(toIsoEndDateTime('2026-03-15T12:34:56')).toBe('2026-03-15T23:59:59Z');
    });

    it('should return undefined for null', () => {
      expect(toIsoEndDateTime(null)).toBeUndefined();
    });

    it('should return undefined for undefined', () => {
      expect(toIsoEndDateTime(undefined)).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      expect(toIsoEndDateTime('')).toBeUndefined();
    });

    it('should return undefined for string containing undefined', () => {
      expect(toIsoEndDateTime('undefined')).toBeUndefined();
    });

    it('should return undefined for invalid format', () => {
      expect(toIsoEndDateTime('invalid-date')).toBeUndefined();
    });

    it('should return undefined for out-of-range MM-DD-YYYY', () => {
      expect(toIsoEndDateTime('13-40-2026')).toBeUndefined();
    });

    it('should return undefined for out-of-range YYYY-MM-DD', () => {
      expect(toIsoEndDateTime('2026-13-40')).toBeUndefined();
    });
  });
});
