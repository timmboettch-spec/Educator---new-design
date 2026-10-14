import { describe, expect, it, vi } from 'vitest';
import {
  buildPrintPreparingHtml,
  buildStudentCodesPrintHtml,
  escapeHtml,
  writeWindowDocument,
} from '../../../src/utils/studentCodesPrint';

const labels = {
  windowTitle: 'Student Codes',
  heading: 'All Student Codes',
  studentName: 'Student Name',
  studentCode: 'Student Code',
  noStudents: 'No students with active codes',
  missingName: '—',
};

const bodyOf = (html: string) =>
  new DOMParser().parseFromString(html, 'text/html');

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(escapeHtml(`<b a="1">'x' & y</b>`)).toBe(
      '&lt;b a=&quot;1&quot;&gt;&#39;x&#39; &amp; y&lt;/b&gt;'
    );
  });
});

describe('buildStudentCodesPrintHtml', () => {
  it('renders the class, heading and a row per student sorted by name', () => {
    const doc = bodyOf(
      buildStudentCodesPrintHtml(
        'Math 101',
        [
          { code: 'C3', name: 'Cara' },
          { code: 'X9', name: '' },
          { code: 'A1', name: 'Ana' },
        ],
        labels
      )
    );

    expect(doc.title).toBe('Student Codes');
    expect(doc.querySelector('.class-name')?.textContent).toBe('Math 101');
    expect(doc.querySelector('.title')?.textContent).toBe('All Student Codes');
    expect(
      Array.from(doc.querySelectorAll('th')).map((th) => th.textContent)
    ).toEqual(['Student Name', 'Student Code']);
    expect(
      Array.from(doc.querySelectorAll('tbody tr')).map((tr) =>
        Array.from(tr.querySelectorAll('td')).map((td) => td.textContent)
      )
    ).toEqual([
      ['Ana', 'A1'],
      ['Cara', 'C3'],
      ['—', 'X9'],
    ]);
  });

  it('prints names and class names as text, never as markup', () => {
    const html = buildStudentCodesPrintHtml(
      '<script>alert(1)</script>',
      [{ code: 'A1', name: '<img src=x onerror=alert(1)>' }],
      labels
    );
    const doc = bodyOf(html);

    expect(doc.querySelector('script')).toBeNull();
    expect(doc.querySelector('img')).toBeNull();
    expect(doc.querySelector('.class-name')?.textContent).toBe(
      '<script>alert(1)</script>'
    );
    expect(doc.querySelector('tbody td')?.textContent).toBe(
      '<img src=x onerror=alert(1)>'
    );
  });

  it('shows the empty state when the class has no students', () => {
    const doc = bodyOf(buildStudentCodesPrintHtml('Math 101', [], labels));
    expect(doc.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(doc.querySelector('tbody td')?.textContent).toBe(
      'No students with active codes'
    );
  });
});

describe('buildPrintPreparingHtml', () => {
  it('shows the escaped message', () => {
    const doc = bodyOf(
      buildPrintPreparingHtml('Student Codes', 'Preparing <…>')
    );
    expect(doc.querySelector('.status')?.textContent).toBe('Preparing <…>');
  });
});

describe('writeWindowDocument', () => {
  it('replaces the whole document', () => {
    const document = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
    writeWindowDocument({ document } as unknown as Window, '<p>x</p>');
    expect(document.open).toHaveBeenCalled();
    expect(document.write).toHaveBeenCalledWith('<p>x</p>');
    expect(document.close).toHaveBeenCalled();
  });
});
