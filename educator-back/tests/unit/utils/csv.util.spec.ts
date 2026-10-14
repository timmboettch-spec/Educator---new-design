import { buildAttachmentDisposition, escapeCsvCell, toCsvLine } from 'src/common/utils/csv.util';

describe('escapeCsvCell', () => {
  it('returns plain text unchanged', () => {
    expect(escapeCsvCell('BIO-4ZPT')).toBe('BIO-4ZPT');
  });

  it('renders null/undefined as an empty cell', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('quotes cells containing a comma', () => {
    expect(escapeCsvCell('Thompson, Ava')).toBe('"Thompson, Ava"');
  });

  it('quotes and doubles embedded quotes', () => {
    expect(escapeCsvCell('Ava "AJ" Thompson')).toBe('"Ava ""AJ"" Thompson"');
  });

  it('quotes cells containing a line break', () => {
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it.each(['=SUM(A1:A2)', '+1', '-1', '@cmd', '\tTab'])(
    'neutralises formula-trigger prefix in %p with a leading apostrophe',
    (value) => {
      expect(escapeCsvCell(value)).toBe(`'${value}`);
    },
  );

  it('neutralises and quotes when a formula cell also needs quoting', () => {
    expect(escapeCsvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
  });

  it('does not touch a formula character that is not the first character', () => {
    expect(escapeCsvCell('BIO-4ZPT=1')).toBe('BIO-4ZPT=1');
  });
});

describe('toCsvLine', () => {
  it('joins escaped cells with commas', () => {
    expect(toCsvLine(['School', 'Lincoln, High', null])).toBe('School,"Lincoln, High",');
  });
});

describe('buildAttachmentDisposition', () => {
  it('builds an ASCII-safe filename and an RFC 5987 filename*', () => {
    expect(buildAttachmentDisposition('student-codes-Biology 101.csv')).toBe(
      `attachment; filename="student-codes-Biology_101.csv"; filename*=UTF-8''student-codes-Biology%20101.csv`,
    );
  });

  it('strips quotes and CRLF from the plain filename so the header cannot be broken out of', () => {
    const header = buildAttachmentDisposition('a"\r\nX-Evil: 1.csv');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).toContain('filename="a_X-Evil_1.csv"');
  });

  it('keeps non-ASCII names in filename* only', () => {
    const header = buildAttachmentDisposition('student-codes-Biología.csv');
    expect(header).toContain('filename="student-codes-Biolog_a.csv"');
    expect(header).toContain(`filename*=UTF-8''student-codes-Biolog%C3%ADa.csv`);
  });
});
