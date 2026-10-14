import { escapeLikeWildcards } from 'src/common/utils/sql-like.util';

describe('escapeLikeWildcards', () => {
  it('returns plain text unchanged', () => {
    expect(escapeLikeWildcards('BIO-4ZPT')).toBe('BIO-4ZPT');
  });

  it('escapes a lone %', () => {
    expect(escapeLikeWildcards('50%')).toBe('50\\%');
  });

  it('escapes a lone _', () => {
    expect(escapeLikeWildcards('A_B')).toBe('A\\_B');
  });

  it('escapes multiple mixed occurrences', () => {
    expect(escapeLikeWildcards('a%b_c%d')).toBe('a\\%b\\_c\\%d');
  });

  it('returns an empty string unchanged', () => {
    expect(escapeLikeWildcards('')).toBe('');
  });

  it('escapes a lone backslash', () => {
    expect(escapeLikeWildcards('a\\b')).toBe('a\\\\b');
  });

  it('escapes a backslash immediately before a wildcard without neutralizing the wildcard escape', () => {
    // Naively escaping % / _ only would turn "a\_b" into "a\\_b", which Postgres reads as a
    // literal backslash followed by an UNESCAPED `_` wildcard — not what the caller intended.
    expect(escapeLikeWildcards('a\\_b')).toBe('a\\\\\\_b');
  });
});
