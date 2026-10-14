import {
  assignmentRangesOverlap,
  isSameAssignmentRange,
  normalizeAssignmentDate,
  parseStrictAssignmentDate,
} from 'src/common/utils/assignment-date.util';

describe('normalizeAssignmentDate', () => {
  it.each([
    ['10-06-2026', '2026-10-06'],
    ['2026-10-06', '2026-10-06'],
    ['2026-10-06T12:06:31.003Z', '2026-10-06'],
    ['  10-06-2026  ', '2026-10-06'],
    // Shape-only, as legacy `assign` always behaved — not a calendar check.
    ['02-31-2026', '2026-02-31'],
  ])('maps %p to %p', (input, expected) => {
    expect(normalizeAssignmentDate(input)).toBe(expected);
  });

  it.each([undefined, null, '', 'garbage', '10/06/2026', '6-10-2026'])(
    'returns undefined for %p',
    (input) => {
      expect(normalizeAssignmentDate(input)).toBeUndefined();
    },
  );
});

describe('parseStrictAssignmentDate', () => {
  it.each([
    ['10-06-2026', '2026-10-06'],
    ['2026-10-06', '2026-10-06'],
    ['2026-10-06T23:59:59Z', '2026-10-06'],
    ['02-29-2028', '2028-02-29'],
    ['12-31-2026', '2026-12-31'],
  ])('accepts %p as %p', (input, expected) => {
    expect(parseStrictAssignmentDate(input)).toBe(expected);
  });

  it.each(['02-31-2026', '13-01-2026', '00-10-2026', '10-00-2026', '2026-02-29', '2026-13-01'])(
    'rejects impossible date %p',
    (input) => {
      expect(parseStrictAssignmentDate(input)).toBeNull();
    },
  );

  it.each([undefined, null, '', '10/06/2026', '2026-10-6', 'today'])(
    'rejects malformed %p',
    (input) => {
      expect(parseStrictAssignmentDate(input)).toBeNull();
    },
  );
});

describe('assignmentRangesOverlap', () => {
  const range = { startDate: '2026-09-01', endDate: '2026-12-15' };

  it.each([
    ['identical', { startDate: '2026-09-01', endDate: '2026-12-15' }],
    ['contained', { startDate: '2026-10-01', endDate: '2026-10-31' }],
    ['touching at the end', { startDate: '2026-12-15', endDate: '2027-01-31' }],
    ['touching at the start', { startDate: '2026-08-01', endDate: '2026-09-01' }],
    ['in MM-DD-YYYY', { startDate: '11-01-2026', endDate: '01-31-2027' }],
  ])('overlaps when %s', (_label, other) => {
    expect(assignmentRangesOverlap(range, other)).toBe(true);
  });

  it.each([
    ['entirely before', { startDate: '2026-01-01', endDate: '2026-08-31' }],
    ['entirely after', { startDate: '2026-12-16', endDate: '2027-01-31' }],
    ['missing a start', { startDate: null, endDate: '2026-10-01' }],
    ['missing an end', { startDate: '2026-10-01', endDate: undefined }],
  ])('does not overlap when %s', (_label, other) => {
    expect(assignmentRangesOverlap(range, other)).toBe(false);
  });
});

describe('isSameAssignmentRange', () => {
  it('matches across MM-DD-YYYY and ISO', () => {
    expect(
      isSameAssignmentRange(
        { startDate: '09-01-2026', endDate: '12-15-2026' },
        { startDate: '2026-09-01', endDate: '2026-12-15T00:00:00Z' },
      ),
    ).toBe(true);
  });

  it('differs when either bound differs', () => {
    const range = { startDate: '2026-09-01', endDate: '2026-12-15' };
    expect(isSameAssignmentRange(range, { ...range, endDate: '2026-12-16' })).toBe(false);
    expect(isSameAssignmentRange(range, { ...range, startDate: '2026-09-02' })).toBe(false);
  });
});
