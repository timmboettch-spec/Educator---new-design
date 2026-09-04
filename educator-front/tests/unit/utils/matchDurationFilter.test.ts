import { describe, it, expect } from 'vitest';
import { matchDurationFilter } from '../../../src/utils/helpers/matchDurationFilter';

describe('matchDurationFilter', () => {
  describe('New duration ranges', () => {
    it('matches <15 min correctly', () => {
      expect(matchDurationFilter('5 minutes', '<15 min')).toBe(true);
      expect(matchDurationFilter('10 min', '<15 min')).toBe(true);
      expect(matchDurationFilter('14 minutes', '<15 min')).toBe(true);
      expect(matchDurationFilter('15 min', '<15 min')).toBe(false);
      expect(matchDurationFilter('20 minutes', '<15 min')).toBe(false);
    });

    it('matches 15–30 min correctly', () => {
      expect(matchDurationFilter('15 minutes', '15–30 min')).toBe(true);
      expect(matchDurationFilter('20 min', '15–30 min')).toBe(true);
      expect(matchDurationFilter('30 minutes', '15–30 min')).toBe(true);
      expect(matchDurationFilter('14 min', '15–30 min')).toBe(false);
      expect(matchDurationFilter('31 minutes', '15–30 min')).toBe(false);
    });

    it('matches 30–60 min correctly', () => {
      expect(matchDurationFilter('35 minutes', '30–60 min')).toBe(true);
      expect(matchDurationFilter('45 min', '30–60 min')).toBe(true);
      expect(matchDurationFilter('60 minutes', '30–60 min')).toBe(true);
      expect(matchDurationFilter('30 min', '30–60 min')).toBe(false);
      expect(matchDurationFilter('61 minutes', '30–60 min')).toBe(false);
    });

    it('matches 60+ min correctly', () => {
      expect(matchDurationFilter('65 minutes', '60+ min')).toBe(true);
      expect(matchDurationFilter('90 min', '60+ min')).toBe(true);
      expect(matchDurationFilter('120 minutes', '60+ min')).toBe(true);
      expect(matchDurationFilter('60 min', '60+ min')).toBe(false);
      expect(matchDurationFilter('45 minutes', '60+ min')).toBe(false);
    });
  });

  describe('Hour conversions', () => {
    it('converts hours to minutes for filtering', () => {
      expect(matchDurationFilter('1 hour', '<15 min')).toBe(false);
      expect(matchDurationFilter('1 hour', '30–60 min')).toBe(true);
      expect(matchDurationFilter('2 hours', '60+ min')).toBe(true);
      expect(matchDurationFilter('1.5 hr', '60+ min')).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('returns true for non-numeric duration strings', () => {
      expect(matchDurationFilter('N/A', '<15 min')).toBe(true);
      expect(matchDurationFilter('', '15–30 min')).toBe(true);
      expect(matchDurationFilter('varies', '30–60 min')).toBe(true);
    });

    it('handles alternative dash formats', () => {
      expect(matchDurationFilter('20 minutes', '15-30 min')).toBe(true);
      expect(matchDurationFilter('45 min', '30-60 min')).toBe(true);
    });
  });

  describe('Complex duration strings', () => {
    it('extracts duration from descriptive text', () => {
      expect(matchDurationFilter('Estimated time: 25 minutes', '15–30 min')).toBe(true);
      expect(matchDurationFilter('This simulation takes 10 mins', '<15 min')).toBe(true);
      expect(matchDurationFilter('Duration: 45 minutes', '30–60 min')).toBe(true);
    });
  });

  describe('Legacy filter support', () => {
    it('supports old filter values for backward compatibility', () => {
      expect(matchDurationFilter('5 minutes', 'Less than 10 minutes')).toBe(true);
      expect(matchDurationFilter('15 min', '10–20 minutes')).toBe(true);
      expect(matchDurationFilter('25 minutes', '20–30 minutes')).toBe(true);
      expect(matchDurationFilter('35 min', '30+ minutes')).toBe(true);
    });
  });
});
