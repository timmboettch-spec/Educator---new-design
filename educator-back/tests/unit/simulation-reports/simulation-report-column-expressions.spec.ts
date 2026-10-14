import {
  buildScoreColumnExpr,
  buildTimeSpentColumnExpr,
} from 'src/common/utils/simulation-report-jsonb-expressions.util';

const squash = (sql: string): string => sql.replace(/\s+/g, ' ');

describe('column-based report sort/filter expressions', () => {
  describe('buildScoreColumnExpr', () => {
    it('reads the score column first, then score_json.overallScore as a safe numeric', () => {
      const expr = squash(buildScoreColumnExpr('sr'));
      const columnAt = expr.indexOf('sr.score::numeric');
      const fallbackAt = expr.indexOf(`sr.score_json->>'overallScore'`);
      expect(columnAt).toBeGreaterThanOrEqual(0);
      expect(fallbackAt).toBeGreaterThan(columnAt);
      expect(expr).toContain(`~ '^-?[0-9]+(\\.[0-9]+)?$'`);
    });

    it('qualifies columns with the given alias and never touches report_data', () => {
      const expr = buildScoreColumnExpr('rep');
      expect(expr).toContain('rep.score');
      expect(expr).not.toContain('sr.');
      expect(expr).not.toContain('report_data');
    });
  });

  describe('buildTimeSpentColumnExpr', () => {
    it('reads the total_time_seconds column as numeric', () => {
      expect(buildTimeSpentColumnExpr('sr')).toBe('sr.total_time_seconds::numeric');
    });
  });
});
