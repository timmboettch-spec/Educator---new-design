import { isSimulationVisibleToEducators } from './simulation-visibility.util';

describe('isSimulationVisibleToEducators', () => {
  it.each(['published', 'PUBLISHED', '  Published  ', 'live', ''])(
    'treats status %p as visible',
    (status) => {
      expect(isSimulationVisibleToEducators(status)).toBe(true);
    },
  );

  it.each([
    'draft',
    'DRAFT',
    ' Draft ',
    'archived',
    'Archived',
    'ARCHIVED',
    '\tarchived\n',
    '\u00a0draft\u00a0',
  ])('treats status %p as hidden', (status) => {
    expect(isSimulationVisibleToEducators(status)).toBe(false);
  });

  it.each([undefined, null])('treats a missing status (%p) as visible', (status) => {
    expect(isSimulationVisibleToEducators(status)).toBe(true);
  });

  it('treats a non-string status as visible rather than throwing', () => {
    expect(isSimulationVisibleToEducators(42)).toBe(true);
  });
});
