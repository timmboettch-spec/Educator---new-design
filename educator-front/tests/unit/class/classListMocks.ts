/**
 * Test stand-ins for the class page's list hooks (`useGetSchoolGroupsInfiniteQuery`,
 * `useGetClassesInfiniteQuery`, `useGetClassesQuery`). They serve fixture data and
 * emulate the BE filters (school, class id, status, search, measure), so page tests
 * exercise the real param builders end to end.
 *
 * Usage inside a `vi.mock('.../classesApi')` factory:
 *   const { classListHookMocks } = await import('./classListMocks');
 *   return { ...actual, ...classListHookMocks, ...mutationMocks };
 */
import type { Dispatch, UnknownAction } from '@reduxjs/toolkit';
import { fireEvent, screen } from '@testing-library/react';
import { vi } from 'vitest';
import type {
  ClassSummaryResDto,
  SchoolGroupResDto,
} from '../../../src/redux/api/classes/classes.types';
import { CommonStatus } from '../../../src/redux/api/classes/classes.types';
import type {
  ClassesInfiniteArg,
  ClassOptionsInfiniteArg,
  SchoolGroupsInfiniteArg,
  SchoolOptionsInfiniteArg,
} from '../../../src/redux/api/classes/classesApi';

export const DEFAULT_TEST_SCHOOL = {
  schoolId: 'sch-1',
  schoolName: 'Test School',
};

interface FixtureClass extends ClassSummaryResDto {
  schoolId: string;
}

interface LegacyClassFixture {
  id: string;
  class_name: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  school_id?: string;
  school_name?: string;
  students?: unknown[];
  sims?: unknown[];
}

export const classListFixture = {
  schools: [] as SchoolGroupResDto[],
  classes: [] as FixtureClass[],
  /** Class ids the BE returns for each attention measure. */
  measureClassIds: {} as Record<string, string[]>,
  /** Makes the attention-count query report an error. */
  attentionCountError: false,
  schoolArgs: [] as SchoolGroupsInfiniteArg[],
  classArgs: [] as ClassesInfiniteArg[],
  countArgs: [] as ClassesInfiniteArg[],
};

export function resetClassListFixture() {
  classListFixture.schools = [];
  classListFixture.classes = [];
  classListFixture.measureClassIds = {};
  classListFixture.attentionCountError = false;
  classListFixture.schoolArgs = [];
  classListFixture.classArgs = [];
  classListFixture.countArgs = [];
}

const toStatus = (status?: string) =>
  Object.values(CommonStatus).find((s) => s === status) ?? CommonStatus.ACTIVE;

/** Builds the school groups + class rows the BE would return for legacy class fixtures. */
export function setClassListFromLegacy(classes: LegacyClassFixture[]) {
  classListFixture.classes = classes.map((cls) => ({
    classId: cls.id,
    className: cls.class_name,
    startDate: cls.start_date ?? '',
    endDate: cls.end_date ?? '',
    studentsCount: cls.students?.length ?? 0,
    simsCount: cls.sims?.length ?? 0,
    reportsCount: 0,
    status: toStatus(cls.status),
    schoolId: cls.school_id ?? DEFAULT_TEST_SCHOOL.schoolId,
  }));
  const schools = new Map<string, SchoolGroupResDto>();
  classes.forEach((cls) => {
    const schoolId = cls.school_id ?? DEFAULT_TEST_SCHOOL.schoolId;
    const existing = schools.get(schoolId);
    if (existing) existing.classCount += 1;
    else
      schools.set(schoolId, {
        schoolId,
        schoolName: cls.school_name ?? DEFAULT_TEST_SCHOOL.schoolName,
        classCount: 1,
      });
  });
  classListFixture.schools = Array.from(schools.values());
}

const singlePage = <T>(data: T[]) => ({
  pages: [
    {
      data,
      meta: {
        total: data.length,
        page: 1,
        pageSize: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    },
  ],
  pageParams: [1],
});

const infiniteResult = <T>(data: T[] | undefined) => ({
  data: data ? singlePage(data) : undefined,
  currentData: data ? singlePage(data) : undefined,
  isLoading: false,
  isFetching: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
});

const matchesClassFilters = (
  cls: FixtureClass,
  arg: Partial<ClassesInfiniteArg & SchoolGroupsInfiniteArg>
) => {
  if (arg.classId?.length && !arg.classId.includes(cls.classId)) return false;
  if (arg.status?.length && !arg.status.includes(cls.status)) return false;
  const search = (arg.search ?? arg.className ?? '').toLowerCase();
  if (search && !cls.className.toLowerCase().includes(search)) return false;
  if (arg.measure) {
    const ids = classListFixture.measureClassIds[arg.measure] ?? [];
    if (!ids.includes(cls.classId)) return false;
  }
  return true;
};

export const classListHookMocks = {
  useGetSchoolGroupsInfiniteQuery: (arg: SchoolGroupsInfiniteArg | symbol) => {
    if (typeof arg === 'symbol') return infiniteResult(undefined);
    classListFixture.schoolArgs.push(arg);
    const schools = classListFixture.schools.filter((school) => {
      if (arg.schoolId?.length && !arg.schoolId.includes(school.schoolId ?? ''))
        return false;
      if (!arg.className && !arg.measure && !arg.classId?.length) return true;
      return classListFixture.classes.some(
        (cls) =>
          cls.schoolId === school.schoolId && matchesClassFilters(cls, arg)
      );
    });
    return infiniteResult(schools);
  },

  useGetClassesInfiniteQuery: (arg: ClassesInfiniteArg) => {
    classListFixture.classArgs.push(arg);
    const rows = classListFixture.classes.filter(
      (cls) =>
        (!arg.schoolIds?.length || arg.schoolIds.includes(cls.schoolId)) &&
        matchesClassFilters(cls, arg)
    );
    return infiniteResult(rows);
  },

  // The "Showing:" chip's count: classes matching every list filter.
  useGetClassesQuery: (arg: ClassesInfiniteArg | symbol) => {
    if (typeof arg === 'symbol') {
      return { data: undefined, currentData: undefined, isError: false };
    }
    classListFixture.countArgs.push(arg);
    const total = classListFixture.classes.filter(
      (cls) =>
        (!arg.schoolIds?.length || arg.schoolIds.includes(cls.schoolId)) &&
        matchesClassFilters(cls, arg)
    ).length;
    const data = classListFixture.attentionCountError
      ? undefined
      : { data: [], meta: { total } };
    return {
      data,
      currentData: data,
      isError: classListFixture.attentionCountError,
    };
  },
};

// Filter-panel option lists (each skipped until its dropdown is first opened).
const infiniteOptionsResult = <T>(arg: unknown, data: () => T[]) => {
  const current = typeof arg === 'symbol' ? undefined : singlePage(data());
  return {
    ...infiniteResult(undefined),
    data: current,
    currentData: current,
    isFetching: false,
    isFetchNextPageError: false,
    refetch: vi.fn(),
  };
};

export const classFilterOptionHookMocks = {
  useGetSchoolOptionsInfiniteQuery: (arg: SchoolOptionsInfiniteArg | symbol) =>
    infiniteOptionsResult(arg, () => {
      const search =
        typeof arg === 'symbol' ? '' : (arg.schoolName ?? '').toLowerCase();
      return classListFixture.schools.filter((school) =>
        school.schoolName.toLowerCase().includes(search)
      );
    }),
  useGetClassOptionsInfiniteQuery: (arg: ClassOptionsInfiniteArg | symbol) =>
    infiniteOptionsResult(arg, () => {
      if (typeof arg === 'symbol') return [];
      const search = (arg.search ?? '').toLowerCase();
      return classListFixture.classes
        .filter(
          (cls) =>
            (!arg.schoolIds?.length || arg.schoolIds.includes(cls.schoolId)) &&
            cls.className.toLowerCase().includes(search)
        )
        .map(({ classId, className }) => ({ classId, className }));
    }),
};

/**
 * Clicks every collapsed school accordion (they start collapsed). Only one
 * school can be open at a time, so with several schools the last one wins;
 * the page fixtures use a single default school.
 */
export function expandAllSchools() {
  screen
    .queryAllByRole('button', { name: /^School: / })
    .filter((button) => button.getAttribute('aria-expanded') === 'false')
    .forEach((button) => fireEvent.click(button));
}

const isClassesUiAction = (action: unknown): action is UnknownAction =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  typeof action.type === 'string' &&
  action.type.startsWith('classesUi/');

/**
 * A `useDispatch` for page tests that mock dispatch: class list query actions
 * (`classesUi/*`) reach the real store so search/filters/quick filters work,
 * and everything else goes to the test's mock. Stable per store, like the
 * real hook. Use inside `vi.mock('react-redux', …)`.
 */
export const createRoutedUseDispatch =
  (
    realUseDispatch: () => Dispatch<UnknownAction>,
    useMemo: <T>(factory: () => T, deps: unknown[]) => T,
    mockDispatch: (action: unknown) => unknown
  ) =>
  () => {
    const realDispatch = realUseDispatch();
    return useMemo(
      () => (action: unknown) =>
        isClassesUiAction(action) ? realDispatch(action) : mockDispatch(action),
      [realDispatch]
    );
  };
