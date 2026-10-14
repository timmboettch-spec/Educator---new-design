import {
  extractOverallScoreFromRow,
  extractPerformanceQualityFromRow,
  isPracticeReport,
} from '../../../src/simulation-reports/utils/report-score.util';

describe('report-score.util', () => {
  describe('isPracticeReport', () => {
    it('detects Practice mode from the mode column', () => {
      expect(isPracticeReport('Practice')).toBe(true);
      expect(isPracticeReport(' practice ')).toBe(true);
      expect(isPracticeReport('Assessment')).toBe(false);
      expect(isPracticeReport(null)).toBe(false);
    });
  });

  describe('extractOverallScoreFromRow', () => {
    it('reads the score column', () => {
      expect(extractOverallScoreFromRow({ score: 78.5, scoreJson: { overallScore: 40 } })).toBe(
        78.5,
      );
    });

    it('falls back to score_json.overallScore when the score column is null', () => {
      expect(extractOverallScoreFromRow({ score: null, scoreJson: { overallScore: 64 } })).toBe(64);
    });

    it('keeps a zero score instead of falling back', () => {
      expect(extractOverallScoreFromRow({ score: 0, scoreJson: { overallScore: 64 } })).toBe(0);
    });

    it('clamps to 0-100', () => {
      expect(extractOverallScoreFromRow({ score: 140, scoreJson: null })).toBe(100);
    });

    it('returns null when neither source has a usable score', () => {
      expect(extractOverallScoreFromRow({ score: null, scoreJson: null })).toBeNull();
      expect(extractOverallScoreFromRow({ score: null, scoreJson: {} })).toBeNull();
      expect(
        extractOverallScoreFromRow({ score: null, scoreJson: { overallScore: null } }),
      ).toBeNull();
    });
  });

  describe('extractPerformanceQualityFromRow', () => {
    it('prefers score_json.overallLabel over the performance_label column', () => {
      expect(
        extractPerformanceQualityFromRow({
          scoreJson: { overallLabel: 'Exceptional' },
          performanceLabel: 'Needs Improvement',
        }),
      ).toBe('Exceptional');
    });

    it('falls back to the performance_label column', () => {
      expect(
        extractPerformanceQualityFromRow({ scoreJson: {}, performanceLabel: 'Needs Improvement' }),
      ).toBe('Needs Improvement');
      expect(
        extractPerformanceQualityFromRow({
          scoreJson: null,
          performanceLabel: 'Needs Improvement',
        }),
      ).toBe('Needs Improvement');
    });

    it('skips a blank score_json.overallLabel', () => {
      expect(
        extractPerformanceQualityFromRow({
          scoreJson: { overallLabel: '   ' },
          performanceLabel: 'Proficient',
        }),
      ).toBe('Proficient');
    });

    it('returns null when no label is stored', () => {
      expect(
        extractPerformanceQualityFromRow({ scoreJson: null, performanceLabel: null }),
      ).toBeNull();
    });
  });
});
