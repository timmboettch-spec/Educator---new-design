import { describe, expect, it, vi } from 'vitest';

import {
  buildActivityOverviewParams,
  buildAttentionParams,
  buildBreakdownGraphParams,
  buildGraphParams,
  COMPARE_MAX_ITEMS,
  getCompareLevel,
  buildCreateClassBody,
  buildUpdateClassBody,
  buildStudentCodesFileName,
  getApiErrorMessage,
  getExportErrorMessage,
  parseStudentCodesCsv,
} from '../../../src/redux/api/classes/classesService';
import {
  ClassAttentionMeasure,
  CommonStatus,
  StudentCodesExportFormat,
} from '../../../src/redux/api/classes/classes.types';

describe('buildBreakdownGraphParams', () => {
  it('sends only the window at the school level', () => {
    expect(buildBreakdownGraphParams({ level: 'school' }, 12)).toEqual({
      months: 12,
    });
  });

  it('sends forSchool to list a school by class', () => {
    expect(
      buildBreakdownGraphParams({ level: 'class', schoolId: 'sch-1' }, 'all')
    ).toEqual({ forSchool: 'sch-1', allTime: true });
  });

  it('sends only forClass (never with forSchool) to list a class by student', () => {
    expect(
      buildBreakdownGraphParams(
        { level: 'student', schoolId: 'sch-1', classId: 'c1' },
        6
      )
    ).toEqual({ forClass: 'c1', months: 6 });
  });
});

describe('buildGraphParams with compareBy', () => {
  it('sends compareBy with the compared ids', () => {
    expect(
      buildGraphParams({
        schoolIds: [],
        classIds: ['c1', 'c2'],
        studentIds: [],
        timeframe: 6,
        compareBy: 'class',
      })
    ).toEqual({ classIds: ['c1', 'c2'], months: 6, compareBy: 'class' });
  });

  it('leaves compareBy out for the Total chart', () => {
    expect(
      buildGraphParams({
        schoolIds: [],
        classIds: ['c1', 'c2'],
        studentIds: [],
        timeframe: 'all',
      })
    ).not.toHaveProperty('compareBy');
  });

  it('never sends compareBy with a Breakdown drill (the BE rejects it)', () => {
    expect(
      buildBreakdownGraphParams({ level: 'class', schoolId: 'sch-1' }, 12)
    ).not.toHaveProperty('compareBy');
  });
});

describe('getCompareLevel', () => {
  const none = { schoolIds: [], classIds: [], studentIds: [] };

  it('needs two or more items in a filter', () => {
    expect(getCompareLevel(none)).toBeUndefined();
    expect(
      getCompareLevel({ schoolIds: ['a'], classIds: ['b'], studentIds: ['c'] })
    ).toBeUndefined();
  });

  it('compares the deepest filter with two or more items', () => {
    expect(getCompareLevel({ ...none, schoolIds: ['a', 'b'] })).toBe('school');
    expect(
      getCompareLevel({ ...none, schoolIds: ['a', 'b'], classIds: ['c', 'd'] })
    ).toBe('class');
    expect(
      getCompareLevel({
        schoolIds: ['a', 'b'],
        classIds: ['c'],
        studentIds: ['e', 'f'],
      })
    ).toBe('student');
  });

  it('caps Compare at five items', () => {
    expect(COMPARE_MAX_ITEMS).toBe(5);
  });
});

describe('buildGraphParams', () => {
  it('sends months for a fixed window and omits empty filters', () => {
    expect(
      buildGraphParams({
        schoolIds: [],
        classIds: [],
        studentIds: [],
        timeframe: 6,
      })
    ).toEqual({ months: 6 });
  });

  it('sends allTime instead of months and keeps selected ids', () => {
    expect(
      buildGraphParams({
        schoolIds: ['sch-1'],
        classIds: ['c1'],
        studentIds: ['s1', 's2'],
        timeframe: 'all',
      })
    ).toEqual({
      schoolIds: ['sch-1'],
      classIds: ['c1'],
      studentIds: ['s1', 's2'],
      allTime: true,
    });
  });
});

describe('buildAttentionParams', () => {
  it('scopes one measure to active classes on the first page', () => {
    expect(
      buildAttentionParams(ClassAttentionMeasure.UNREAD_REPORTS, 50)
    ).toEqual({
      measure: 'unreadReports',
      status: [CommonStatus.ACTIVE],
      page: 1,
      pageSize: 50,
    });
  });
});

describe('buildActivityOverviewParams', () => {
  it('omits school_id when not provided', () => {
    expect(buildActivityOverviewParams(undefined)).toEqual({});
  });

  it('includes school_id when provided', () => {
    expect(buildActivityOverviewParams('school-1')).toEqual({
      school_id: 'school-1',
    });
  });
});

describe('buildCreateClassBody', () => {
  const values = {
    school_id: 'school-1',
    class_name: 'Bio 101',
    status: 'ACTIVE' as const,
    start_date: '2026-01-01',
    end_date: '2026-06-30',
    total_no_of_students: '25',
  };

  it('maps form values to the camelCase create DTO', () => {
    expect(buildCreateClassBody(values)).toEqual({
      schoolId: 'school-1',
      className: 'Bio 101',
      status: CommonStatus.ACTIVE,
      startDate: '2026-01-01',
      endDate: '2026-06-30',
      totalNoOfStudents: 25,
    });
  });

  it('never sends a DRAFT or ATTENTION status', () => {
    const asStatus = (status: string) =>
      buildCreateClassBody({ ...values, status } as typeof values).status;
    expect(asStatus('DRAFT')).toBeUndefined();
    expect(asStatus('ATTENTION')).toBeUndefined();
  });

  it('omits an empty school and student count', () => {
    const body = buildCreateClassBody({
      ...values,
      school_id: '',
      total_no_of_students: '',
    });
    expect(body).not.toHaveProperty('schoolId');
    expect(body).not.toHaveProperty('totalNoOfStudents');
  });

  it('keeps the ARCHIEVED status spelling', () => {
    expect(
      buildCreateClassBody({ ...values, status: 'ARCHIEVED' }).status
    ).toBe(CommonStatus.ARCHIEVED);
  });
});

describe('buildUpdateClassBody', () => {
  it('sends every PUT field, even empty dates', () => {
    expect(
      buildUpdateClassBody({
        class_name: 'Bio 101',
        status: 'INACTIVE',
        start_date: '',
        end_date: '2026-06-30',
      })
    ).toEqual({
      className: 'Bio 101',
      status: CommonStatus.INACTIVE,
      startDate: '',
      endDate: '2026-06-30',
      schoolId: undefined,
    });
  });
});

describe('getApiErrorMessage', () => {
  it('returns the BE message', () => {
    expect(
      getApiErrorMessage({ status: 400, data: { message: 'Taken' } }, 'x')
    ).toBe('Taken');
  });

  it.each([
    [
      'a raw axios message string',
      { status: undefined, data: 'Network Error' },
    ],
    ['no message', { status: 500, data: {} }],
    ['a non-object', 'boom'],
  ])('falls back for %s', (_, error) => {
    expect(getApiErrorMessage(error, 'Fallback')).toBe('Fallback');
  });
});

describe('buildStudentCodesFileName', () => {
  it.each([
    ['Math 101', StudentCodesExportFormat.CSV, 'student-codes-Math 101.csv'],
    [
      'Ciencias Básicas',
      StudentCodesExportFormat.PDF,
      'student-codes-Ciencias Básicas.pdf',
    ],
    [
      '数学クラス',
      StudentCodesExportFormat.CSV,
      'student-codes-数学クラス.csv',
    ],
  ])('keeps %j as typed', (className, format, expected) => {
    expect(buildStudentCodesFileName(className, format)).toBe(expected);
  });

  it('replaces characters a file system rejects and collapses spaces', () => {
    expect(
      buildStudentCodesFileName(
        'Bio: A/B <Lab>  "1"?',
        StudentCodesExportFormat.CSV
      )
    ).toBe('student-codes-Bio A B Lab 1.csv');
  });

  it('drops trailing dots so the extension survives on Windows', () => {
    expect(
      buildStudentCodesFileName('Grade 9...', StudentCodesExportFormat.PDF)
    ).toBe('student-codes-Grade 9.pdf');
  });

  it('caps the class name at 100 characters', () => {
    expect(
      buildStudentCodesFileName('x'.repeat(250), StudentCodesExportFormat.CSV)
    ).toBe(`student-codes-${'x'.repeat(100)}.csv`);
  });

  it('never splits an emoji when it cuts a long name', () => {
    // 99 letters then emoji: the 100th character is a whole 🎓 (2 UTF-16 units).
    const fileName = buildStudentCodesFileName(
      `${'x'.repeat(99)}🎓🎓🎓`,
      StudentCodesExportFormat.CSV
    );
    expect(fileName).toBe(`student-codes-${'x'.repeat(99)}🎓.csv`);
    expect(fileName).not.toMatch(/[\uD800-\uDFFF](?![\uDC00-\uDFFF])/u);
  });

  it('never splits a joined emoji when it cuts a long name', () => {
    // A family emoji is 7 code points but one visible character.
    const family = '👨‍👩‍👧‍👦';
    expect(
      buildStudentCodesFileName(
        `${'x'.repeat(99)}${family}${family}`,
        StudentCodesExportFormat.CSV
      )
    ).toBe(`student-codes-${'x'.repeat(99)}${family}.csv`);
  });

  it('falls back to code points without Intl.Segmenter', () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
    try {
      expect(
        buildStudentCodesFileName(
          `${'x'.repeat(99)}🎓🎓`,
          StudentCodesExportFormat.PDF
        )
      ).toBe(`student-codes-${'x'.repeat(99)}🎓.pdf`);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('counts an emoji as one character toward the limit', () => {
    expect(
      buildStudentCodesFileName('🎓'.repeat(120), StudentCodesExportFormat.PDF)
    ).toBe(`student-codes-${'🎓'.repeat(100)}.pdf`);
  });

  it.each(['', '   ', '???'])('falls back to "class" for %j', (className) => {
    expect(
      buildStudentCodesFileName(className, StudentCodesExportFormat.CSV)
    ).toBe('student-codes-class.csv');
  });
});

describe('getExportErrorMessage', () => {
  const fallback = 'Download failed';
  const blobError = (body: string) => ({
    response: { status: 404, data: new Blob([body]) },
  });

  it('reads the BE message from a JSON error body returned as a Blob', async () => {
    await expect(
      getExportErrorMessage(
        blobError(JSON.stringify({ message: 'Class not found.' })),
        fallback
      )
    ).resolves.toBe('Class not found.');
  });

  it('reads the BE message from a plain object body', async () => {
    await expect(
      getExportErrorMessage(
        { response: { data: { message: 'Forbidden' } } },
        fallback
      )
    ).resolves.toBe('Forbidden');
  });

  it.each([
    ['a non-JSON Blob body', blobError('<html>Bad gateway</html>')],
    ['a JSON body without a message', blobError('{}')],
    ['a network error without a response', new Error('Network Error')],
    ['a non-object', 'boom'],
  ])('returns the fallback for %s', async (_label, error) => {
    await expect(getExportErrorMessage(error, fallback)).resolves.toBe(
      fallback
    );
  });
});

describe('parseStudentCodesCsv', () => {
  const csv = (...studentLines: string[]) =>
    [
      '\uFEFFClass Name,Math 101',
      'School,Lincoln High',
      'Start Date,2026-09-01',
      'End Date,2026-12-15',
      '',
      'Student Code,Student Name',
      ...studentLines,
    ].join('\r\n');

  it('reads code and name for each student after the header block', () => {
    expect(parseStudentCodesCsv(csv('AB12,Ana López', 'CD34,Bo Chen'))).toEqual(
      [
        { code: 'AB12', name: 'Ana López' },
        { code: 'CD34', name: 'Bo Chen' },
      ]
    );
  });

  it('unquotes RFC 4180 cells with commas, quotes and line breaks', () => {
    expect(
      parseStudentCodesCsv(
        csv('AB12,"Smith, Jo"', 'CD34,"Say ""hi"""', 'EF56,"Line\r\nTwo"')
      )
    ).toEqual([
      { code: 'AB12', name: 'Smith, Jo' },
      { code: 'CD34', name: 'Say "hi"' },
      { code: 'EF56', name: 'Line\r\nTwo' },
    ]);
  });

  it("removes the BE's formula guard so names print as entered", () => {
    expect(
      parseStudentCodesCsv(csv("AB12,'=Ana", "CD34,'-Bo", "EF56,'Neil"))
    ).toEqual([
      { code: 'AB12', name: '=Ana' },
      { code: 'CD34', name: '-Bo' },
      { code: 'EF56', name: "'Neil" },
    ]);
  });

  it('keeps students without a name', () => {
    expect(parseStudentCodesCsv(csv('AB12,'))).toEqual([
      { code: 'AB12', name: '' },
    ]);
  });

  it('returns no students for an empty class', () => {
    expect(parseStudentCodesCsv(csv())).toEqual([]);
    expect(parseStudentCodesCsv(`${csv()}\r\n`)).toEqual([]);
  });

  it('fails loudly when the layout is not recognised', () => {
    expect(() => parseStudentCodesCsv('code,name\nAB12,Ana')).toThrow(
      /Unrecognised/
    );
  });
});
