import { QueryFailedError } from 'typeorm';
import { isPgError } from 'src/common/utils/pg-error.util';

const queryFailed = (driverError: Record<string, unknown>): QueryFailedError =>
  new QueryFailedError('q', [], Object.assign(new Error('pg'), driverError));

describe('isPgError', () => {
  it('matches the SQLSTATE on a QueryFailedError', () => {
    expect(isPgError(queryFailed({ code: '23505' }), '23505')).toBe(true);
    expect(isPgError(queryFailed({ code: '23503' }), '23505')).toBe(false);
  });

  it('matches the constraint only when one is asked for', () => {
    const error = queryFailed({ code: '23505', constraint: 'uq_a' });
    expect(isPgError(error, '23505', 'uq_a')).toBe(true);
    expect(isPgError(error, '23505', 'uq_b')).toBe(false);
    expect(isPgError(queryFailed({ code: '23505' }), '23505', 'uq_a')).toBe(false);
  });

  it('accepts a bare driver error', () => {
    expect(isPgError({ code: '22P02' }, '22P02')).toBe(true);
  });

  it('is false for non-objects and errors without a code', () => {
    expect(isPgError(null, '23505')).toBe(false);
    expect(isPgError('23505', '23505')).toBe(false);
    expect(isPgError(new Error('x'), '23505')).toBe(false);
  });
});
