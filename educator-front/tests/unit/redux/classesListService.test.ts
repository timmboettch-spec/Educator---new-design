import { describe, expect, it } from 'vitest';

import {
  buildClassesInfiniteArg,
  buildClassOptionsArg,
  buildFilteredClassCountArg,
  buildSchoolGroupsInfiniteArg,
  buildSchoolOptionsArg,
  getSchoolGroupId,
  CLASSES_PAGE_SIZE,
  FILTER_OPTIONS_PAGE_SIZE,
  mapClassSummaryToRow,
  SCHOOL_GROUPS_PAGE_SIZE,
  type ClassListFilters,
} from '../../../src/redux/api/classes/classesService';
import {
  ClassAttentionMeasure,
  ClassSortField,
  CommonStatus,
} from '../../../src/redux/api/classes/classes.types';

const noFilters: ClassListFilters = {
  schoolIds: [],
  classIds: [],
  statuses: [],
  search: '',
};

const ids = (count: number, prefix: string) =>
  Array.from({ length: count }, (_, i) => `${prefix}-${i + 1}`);

describe('getSchoolGroupId', () => {
  it('uses the school id, or the BE unassigned sentinel for classes without a school', () => {
    expect(getSchoolGroupId('sch-1')).toBe('sch-1');
    expect(getSchoolGroupId(null)).toBe('unassigned');
    expect(getSchoolGroupId(undefined)).toBe('unassigned');
  });
});

describe('buildSchoolGroupsInfiniteArg', () => {
  it('sends only the page size when no filter is applied', () => {
    expect(buildSchoolGroupsInfiniteArg(noFilters)).toEqual({
      pageSize: SCHOOL_GROUPS_PAGE_SIZE,
    });
  });

  it('maps schools, search and measure', () => {
    expect(
      buildSchoolGroupsInfiniteArg({
        ...noFilters,
        schoolIds: ['s-1'],
        search: '  bio ',
        measure: ClassAttentionMeasure.CLOSING_SOON,
      })
    ).toEqual({
      pageSize: SCHOOL_GROUPS_PAGE_SIZE,
      schoolId: ['s-1'],
      className: 'bio',
      measure: 'closingSoon',
    });
  });

  it('narrows schools to those containing the picked classes', () => {
    expect(
      buildSchoolGroupsInfiniteArg({ ...noFilters, classIds: ['c-1'] })
    ).toEqual({ pageSize: SCHOOL_GROUPS_PAGE_SIZE, classId: ['c-1'] });
  });

  it('sends status and dates under the class-prefixed names', () => {
    const arg = buildSchoolGroupsInfiniteArg({
      ...noFilters,
      statuses: [CommonStatus.ACTIVE, CommonStatus.INACTIVE],
      startDate: '2026-01-01',
      endDate: '2026-06-30',
    });

    expect(arg).toEqual({
      pageSize: SCHOOL_GROUPS_PAGE_SIZE,
      classStatus: ['ACTIVE', 'INACTIVE'],
      classStartDateFrom: '2026-01-01',
      classEndDateTo: '2026-06-30',
    });
    // The BE rejects the unprefixed `/api/classes` names here with a 400.
    expect(arg).not.toHaveProperty('status');
    expect(arg).not.toHaveProperty('startDateFrom');
    expect(arg).not.toHaveProperty('endDateTo');
  });

  it('sends only the three statuses the BE accepts', () => {
    expect(
      buildSchoolGroupsInfiniteArg({
        ...noFilters,
        statuses: [CommonStatus.ARCHIEVED, CommonStatus.DRAFT, 'UNKNOWN'],
      })
    ).toEqual({
      pageSize: SCHOOL_GROUPS_PAGE_SIZE,
      classStatus: ['ARCHIEVED'],
    });
  });

  it('leaves out statuses that are all unsupported', () => {
    expect(
      buildSchoolGroupsInfiniteArg({ ...noFilters, statuses: ['DRAFT'] })
    ).toEqual({ pageSize: SCHOOL_GROUPS_PAGE_SIZE });
  });

  it('caps school and class ids at 100 and search at 200 characters (BE limits)', () => {
    const arg = buildSchoolGroupsInfiniteArg({
      ...noFilters,
      schoolIds: ids(120, 's'),
      classIds: ids(130, 'c'),
      search: 'x'.repeat(250),
    });
    expect(arg.schoolId).toHaveLength(100);
    expect(arg.classId).toHaveLength(100);
    expect(arg.className).toHaveLength(200);
  });
});

describe('buildClassesInfiniteArg', () => {
  it('scopes to one school and maps every filter', () => {
    expect(
      buildClassesInfiniteArg(
        {
          schoolIds: ['s-1', 's-2'],
          classIds: ['c-1'],
          statuses: [
            'ACTIVE',
            'ARCHIEVED',
            'DRAFT',
            'ATTENTION',
            'NOT_A_STATUS',
          ],
          startDate: '2026-01-01',
          endDate: '2026-06-30',
          search: 'bio',
          sortBy: ClassSortField.STUDENTS,
          sortDir: 'desc',
        },
        's-1'
      )
    ).toEqual({
      pageSize: CLASSES_PAGE_SIZE,
      schoolIds: ['s-1'],
      classId: ['c-1'],
      status: [CommonStatus.ACTIVE, CommonStatus.ARCHIEVED],
      startDateFrom: '2026-01-01',
      endDateTo: '2026-06-30',
      search: 'bio',
      sortBy: 'students',
      sortDir: 'desc',
    });
  });

  it('omits sortDir without sortBy', () => {
    expect(
      buildClassesInfiniteArg({ ...noFilters, sortDir: 'asc' }, 's-1')
    ).toEqual({ pageSize: CLASSES_PAGE_SIZE, schoolIds: ['s-1'] });
  });

  it('combines a measure with the other filters without adding a status', () => {
    expect(
      buildClassesInfiniteArg(
        {
          ...noFilters,
          classIds: ['c-1'],
          search: 'bio',
          measure: ClassAttentionMeasure.NO_STUDENTS,
        },
        's-1'
      )
    ).toEqual({
      pageSize: CLASSES_PAGE_SIZE,
      schoolIds: ['s-1'],
      classId: ['c-1'],
      search: 'bio',
      measure: 'noStudents',
    });
  });

  it('caps class ids at 100 and search at 200 characters (BE limits)', () => {
    const arg = buildClassesInfiniteArg(
      { ...noFilters, classIds: ids(150, 'c'), search: 'y'.repeat(300) },
      's-1'
    );
    expect(arg.classId).toHaveLength(100);
    expect(arg.search).toHaveLength(200);
  });
});

describe('buildFilteredClassCountArg', () => {
  it('asks for one row matching every list filter across the picked schools', () => {
    expect(
      buildFilteredClassCountArg({
        schoolIds: ['s-1', 's-2'],
        classIds: ['c-1'],
        statuses: ['ACTIVE'],
        startDate: '2026-01-01',
        endDate: '2026-06-30',
        search: ' bio ',
        measure: ClassAttentionMeasure.UNREAD_REPORTS,
        sortBy: ClassSortField.STUDENTS,
        sortDir: 'desc',
      })
    ).toEqual({
      page: 1,
      pageSize: 1,
      schoolIds: ['s-1', 's-2'],
      classId: ['c-1'],
      status: [CommonStatus.ACTIVE],
      startDateFrom: '2026-01-01',
      endDateTo: '2026-06-30',
      search: 'bio',
      measure: 'unreadReports',
    });
  });

  it('counts across every school when none is picked', () => {
    expect(
      buildFilteredClassCountArg({
        ...noFilters,
        measure: ClassAttentionMeasure.NO_STUDENTS,
      })
    ).toEqual({ page: 1, pageSize: 1, measure: 'noStudents' });
  });
});

describe('id filter order (stable cache keys)', () => {
  const picked = (schoolIds: string[], classIds: string[]) => ({
    ...noFilters,
    schoolIds,
    classIds,
  });

  it('builds the same args for the same selection in any pick order', () => {
    const inPickOrder = picked(['s-2', 's-1'], ['c-2', 'c-1']);
    const reversed = picked(['s-1', 's-2'], ['c-1', 'c-2']);

    expect(buildSchoolGroupsInfiniteArg(inPickOrder)).toEqual(
      buildSchoolGroupsInfiniteArg(reversed)
    );
    expect(buildClassesInfiniteArg(inPickOrder, 's-1')).toEqual(
      buildClassesInfiniteArg(reversed, 's-1')
    );
    expect(buildFilteredClassCountArg(inPickOrder)).toEqual(
      buildFilteredClassCountArg(reversed)
    );
    expect(buildFilteredClassCountArg(inPickOrder)).toMatchObject({
      schoolIds: ['s-1', 's-2'],
      classId: ['c-1', 'c-2'],
    });
  });

  it('does not reorder the selection it is given', () => {
    const schoolIds = ['s-2', 's-1'];
    buildFilteredClassCountArg(picked(schoolIds, []));
    expect(schoolIds).toEqual(['s-2', 's-1']);
  });
});

describe('filter dropdown option args', () => {
  it('searches schools by trimmed name, omitting an empty search', () => {
    expect(buildSchoolOptionsArg('  ')).toEqual({
      pageSize: FILTER_OPTIONS_PAGE_SIZE,
    });
    expect(buildSchoolOptionsArg(' hill ')).toEqual({
      pageSize: FILTER_OPTIONS_PAGE_SIZE,
      schoolName: 'hill',
    });
  });

  it('lists classes of the picked schools with sorted ids (stable cache key)', () => {
    expect(buildClassOptionsArg('bio', ['s-2', 's-1'])).toEqual({
      pageSize: FILTER_OPTIONS_PAGE_SIZE,
      search: 'bio',
      schoolIds: ['s-1', 's-2'],
    });
    expect(buildClassOptionsArg('', [])).toEqual({
      pageSize: FILTER_OPTIONS_PAGE_SIZE,
    });
  });

  it('caps school ids at 100 and search at 200 characters (BE limits)', () => {
    const arg = buildClassOptionsArg('z'.repeat(250), ids(120, 's'));
    expect(arg.schoolIds).toHaveLength(100);
    expect(arg.search).toHaveLength(200);
    expect(buildSchoolOptionsArg('z'.repeat(250)).schoolName).toHaveLength(200);
  });
});

describe('mapClassSummaryToRow', () => {
  const summary = {
    classId: 'c-1',
    className: 'Biology',
    startDate: '2026-01-01',
    endDate: '2026-06-30',
    studentsCount: 3,
    simsCount: 1,
    reportsCount: 5,
    status: CommonStatus.ACTIVE,
  };
  const school = { schoolId: 's-1', schoolName: 'Hillcrest' };

  it('maps the API row and school, with empty lists when the class is unknown', () => {
    expect(mapClassSummaryToRow(summary, school)).toEqual({
      id: 'c-1',
      class_name: 'Biology',
      start_date: '2026-01-01',
      end_date: '2026-06-30',
      status: 'ACTIVE',
      school_id: 's-1',
      school_name: 'Hillcrest',
      students: [],
      sims: [],
      studentsCount: 3,
      simsCount: 1,
      reportsCount: 5,
    });
  });

  it('keeps the full class data (students) while the API fields win', () => {
    const students = [
      { student_id: 'S-1', student_name: 'Ana', email: null, score: null },
    ];
    const row = mapClassSummaryToRow(summary, school, {
      id: 'c-1',
      class_name: 'Old name',
      students,
      needsAttention: true,
    });
    expect(row).toMatchObject({
      class_name: 'Biology',
      students,
      needsAttention: true,
    });
  });

  it('falls back to the full class status for statuses the table does not know', () => {
    const row = mapClassSummaryToRow(
      // A value outside the BE contract, e.g. a status added on the BE later.
      { ...summary, status: 'UNEXPECTED' as CommonStatus },
      school,
      { id: 'c-1', class_name: 'Biology', status: 'DRAFT' }
    );
    expect(row.status).toBe('DRAFT');
  });
});
