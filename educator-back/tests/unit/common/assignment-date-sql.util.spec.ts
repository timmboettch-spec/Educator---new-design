import { buildAssignmentDateExpr } from 'src/common/utils/assignment-date-sql.util';

/** Shape checks only; real behaviour is tested against Postgres in the integration spec. */
describe('buildAssignmentDateExpr', () => {
  const sql = buildAssignmentDateExpr('cs.start_date');

  it('never calls to_date, which raises on an impossible calendar date', () => {
    expect(sql).not.toContain('to_date');
  });

  it('only accepts months 01-12 and days 01-31 in both supported formats', () => {
    expect(sql).toContain("cs.start_date ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])'");
    expect(sql).toContain("cs.start_date ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])-[0-9]{4}$'");
  });

  it('rejects year 0 and a day past the end of its month before calling make_date', () => {
    expect(sql).toContain('WHEN substring(cs.start_date from 1 for 4)::int = 0 THEN NULL');
    expect(sql).toMatch(
      /WHEN substring\(cs\.start_date from 9 for 2\)::int > EXTRACT\(DAY FROM \(make_date\(.*INTERVAL '1 month - 1 day'\)\) THEN NULL/,
    );
  });

  it('falls back to NULL for anything else', () => {
    expect(sql).toMatch(/ELSE NULL\s+END\)$/);
  });
});
