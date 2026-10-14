import { redactCode, redactCodes, redactEmail } from 'src/common/utils/redact.util';

describe('redactEmail', () => {
  it('keeps the first character and the domain only', () => {
    expect(redactEmail('teacher@school.edu')).toBe('t***@school.edu');
  });

  it('does not leak the local part for a long address', () => {
    expect(redactEmail('firstname.lastname+tag@district.k12.us')).toBe('f***@district.k12.us');
  });

  it('redacts a single-character local part rather than exposing it whole', () => {
    expect(redactEmail('a@school.edu')).toBe('a***@school.edu');
  });

  it('redacts anything that is not a usable address', () => {
    expect(redactEmail(undefined)).toBe('[redacted]');
    expect(redactEmail(null)).toBe('[redacted]');
    expect(redactEmail('   ')).toBe('[redacted]');
    expect(redactEmail('not-an-email')).toBe('[redacted]');
    expect(redactEmail('@school.edu')).toBe('[redacted]');
    expect(redactEmail('teacher@')).toBe('[redacted]');
  });
});

describe('redactCode', () => {
  it('keeps only the last four characters', () => {
    expect(redactCode('REP-PH9N')).toBe('***PH9N');
  });

  it('never returns the full code', () => {
    const code = 'NURSING101-4821';
    expect(redactCode(code)).not.toContain(code);
    expect(redactCode(code)).toBe('***4821');
  });

  it('redacts codes short enough that a suffix would reveal them', () => {
    expect(redactCode('PH9N')).toBe('[redacted]');
    expect(redactCode('X')).toBe('[redacted]');
    expect(redactCode('')).toBe('[redacted]');
    expect(redactCode(undefined)).toBe('[redacted]');
  });
});

describe('redactCodes', () => {
  it('redacts every candidate in a list', () => {
    expect(redactCodes(['REP-PH9N', 'REP-QQ12'])).toBe('***PH9N, ***QQ12');
  });

  it('renders an empty list explicitly', () => {
    expect(redactCodes([])).toBe('(none)');
  });
});
