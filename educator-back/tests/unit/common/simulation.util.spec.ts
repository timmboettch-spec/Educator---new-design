import {
  collapseWhitespace,
  normalizeFilterText,
  toLearningObjectiveList,
} from 'src/common/utils/simulation.util';
import { toRepeatedStringArray } from 'src/common/utils/query-array.util';

describe('collapseWhitespace', () => {
  it.each([
    ['  a   b ', 'a b'],
    ['a\tb\nc', 'a b c'],
    ['   ', ''],
  ])('turns %p into %p', (input, expected) => {
    expect(collapseWhitespace(input)).toBe(expected);
  });
});

describe('normalizeFilterText', () => {
  it('treats a non-breaking space like any other whitespace', () => {
    expect(normalizeFilterText('\u00a0Knee\u00a0\u00a0Set\u00a0')).toBe('knee set');
  });

  it('collapses whitespace and lowercases', () => {
    expect(normalizeFilterText('  Knee   SET ')).toBe('knee set');
  });
});

describe('toRepeatedStringArray', () => {
  it.each([[undefined], [null], [''], ['   '], [[]], [['', '  ']]])(
    'reads %p as no filter',
    (value) => {
      expect(toRepeatedStringArray(value)).toBeUndefined();
    },
  );

  it('wraps a single value in a list', () => {
    expect(toRepeatedStringArray('Easy')).toEqual(['Easy']);
  });

  it('keeps every entry of a repeated parameter', () => {
    expect(toRepeatedStringArray(['Easy', 'Hard'])).toEqual(['Easy', 'Hard']);
  });

  it('does not split on commas, because a product name can contain one', () => {
    expect(toRepeatedStringArray('Knee set, large')).toEqual(['Knee set, large']);
  });

  it('trims entries and drops blank ones', () => {
    expect(toRepeatedStringArray([' Easy ', '  ', ''])).toEqual(['Easy']);
  });

  it('keeps an exact repeat once', () => {
    expect(toRepeatedStringArray(['Easy', 'Easy', 'Hard', 'Easy'])).toEqual(['Easy', 'Hard']);
  });

  it('leaves a non-string value for validation to refuse', () => {
    expect(toRepeatedStringArray([1, 'Easy'])).toEqual([1, 'Easy']);
    expect(toRepeatedStringArray({ a: 1 })).toEqual({ a: 1 });
  });
});

describe('toLearningObjectiveList', () => {
  it('splits a newline-separated text, trimming and dropping blank lines', () => {
    expect(toLearningObjectiveList(' Recognise arrest \n\n Start CPR \n  ')).toEqual([
      'Recognise arrest',
      'Start CPR',
    ]);
  });

  it('cleans an array of texts and drops blank or non-string entries', () => {
    expect(toLearningObjectiveList([' A ', '', '   ', 'B'])).toEqual(['A', 'B']);
    expect(toLearningObjectiveList([1, 'B'] as unknown as string[])).toEqual(['B']);
  });

  it.each([[null], [undefined], [''], [[]]])('gives an empty list for %p', (value) => {
    expect(toLearningObjectiveList(value as string | string[] | null | undefined)).toEqual([]);
  });
});
