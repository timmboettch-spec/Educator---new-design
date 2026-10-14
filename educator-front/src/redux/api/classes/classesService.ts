import type {
  Class,
  ClassFormValues,
  ClassWithStudents,
} from '../../../types/Class_types';
import {
  CommonStatus,
  type ActivityOverviewReqDto,
  type ClassAttentionMeasure,
  type ClassSortField,
  type ClassSummaryResDto,
  type CreateClassReqDto,
  type ListClassesReqDto,
  type SimulationsCompletedGraphCompareBy,
  type SimulationsCompletedGraphMonths,
  type SimulationsCompletedGraphReqDto,
  type SchoolGroupResDto,
  type SortDir,
  type SelectableClassStatus,
  type StudentCodesExportFormat,
  type UpdateClassReqDto,
  SELECTABLE_CLASS_STATUSES,
  UNASSIGNED_SCHOOL,
} from './classes.types';
import type {
  ClassesInfiniteArg,
  ClassOptionsInfiniteArg,
  SchoolGroupsInfiniteArg,
  SchoolOptionsInfiniteArg,
} from './classesApi';

/** Page sizes for the class page's infinite school/class lists. */
export const SCHOOL_GROUPS_PAGE_SIZE = 10;
export const CLASSES_PAGE_SIZE = 10;

/**
 * The id that stands for a school group in requests and UI state: the school's
 * id, or the BE's `unassigned` sentinel for classes without a school.
 */
export const getSchoolGroupId = (schoolId: string | null | undefined) =>
  schoolId ?? UNASSIGNED_SCHOOL;

/** Drops empty strings/arrays so optional query params are omitted rather than sent as "". */
export const compact = <T extends Record<string, unknown>>(obj: T): T => {
  const result = {} as T;
  (Object.keys(obj) as (keyof T)[]).forEach((key) => {
    const value = obj[key];
    const isEmptyArray = Array.isArray(value) && value.length === 0;
    const isEmptyString = value === '';
    if (value !== undefined && !isEmptyArray && !isEmptyString) {
      result[key] = value;
    }
  });
  return result;
};

export const buildActivityOverviewParams = (
  schoolId?: string
): ActivityOverviewReqDto => compact({ school_id: schoolId });

/** Params for counting/listing the educator's active classes that match one attention measure. */
export const buildAttentionParams = (
  measure: ClassAttentionMeasure,
  pageSize: number
): ListClassesReqDto => ({
  measure,
  status: [CommonStatus.ACTIVE],
  page: 1,
  pageSize,
});

export interface GraphParamsInput {
  schoolIds: string[];
  classIds: string[];
  studentIds: string[];
  timeframe: SimulationsCompletedGraphMonths | 'all';
  /** Set only while Compare is on; one series per id at that level. */
  compareBy?: SimulationsCompletedGraphCompareBy;
}

/** Graph query params: `allTime` replaces `months` for the all-time window; empty filters are omitted. */
export const buildGraphParams = ({
  schoolIds,
  classIds,
  studentIds,
  timeframe,
  compareBy,
}: GraphParamsInput): SimulationsCompletedGraphReqDto =>
  compact({
    schoolIds,
    classIds,
    studentIds,
    ...timeframeParams(timeframe),
    compareBy,
  });

/** Most items Compare draws side by side (the BE allows 15; the design keeps it readable). */
export const COMPARE_MAX_ITEMS = 5;

/**
 * The level Compare splits by: the deepest filter with more than one item selected
 * (students, then classes, then schools), or undefined when nothing can be compared.
 */
export const getCompareLevel = ({
  schoolIds,
  classIds,
  studentIds,
}: Pick<GraphParamsInput, 'schoolIds' | 'classIds' | 'studentIds'>):
  SimulationsCompletedGraphCompareBy | undefined => {
  if (studentIds.length > 1) return 'student';
  if (classIds.length > 1) return 'class';
  if (schoolIds.length > 1) return 'school';
  return undefined;
};

const timeframeParams = (timeframe: GraphParamsInput['timeframe']) =>
  timeframe === 'all' ? { allTime: true } : { months: timeframe };

/** Where the Breakdown chart is drilled to: every school, one school's classes, or one class's students. */
export type GraphDrill =
  | { level: 'school' }
  | { level: 'class'; schoolId: string }
  | { level: 'student'; schoolId: string; classId: string };

/**
 * Breakdown graph params. The BE rejects forSchool/forClass combined with each other or
 * with the id filters, so only the drill target and the window are sent.
 */
export const buildBreakdownGraphParams = (
  drill: GraphDrill,
  timeframe: GraphParamsInput['timeframe']
): SimulationsCompletedGraphReqDto => ({
  ...(drill.level === 'class' ? { forSchool: drill.schoolId } : {}),
  ...(drill.level === 'student' ? { forClass: drill.classId } : {}),
  ...timeframeParams(timeframe),
});

const toCommonStatus = (status: string): CommonStatus | undefined =>
  Object.values(CommonStatus).find((value) => value === status);

const toSelectableClassStatus = (
  status: string
): SelectableClassStatus | undefined =>
  SELECTABLE_CLASS_STATUSES.find((value) => value === status);

// BE validation limits for GET /api/classes (and its school-groups sibling).
const MAX_ID_FILTER_ITEMS = 100;
const MAX_SEARCH_LENGTH = 200;

const toSearchParam = (search: string) =>
  search.trim().slice(0, MAX_SEARCH_LENGTH);

/** Sorted so the same selection, in any pick order, always hits the same cache entry. */
const toIdParam = (ids: string[]) =>
  [...ids].sort().slice(0, MAX_ID_FILTER_ITEMS);

/** The class page's applied filters, in the shape the list builders take. */
export interface ClassListFilters {
  /** School ids picked in the School filter (empty = all). */
  schoolIds: string[];
  /** Class ids picked in the Class Name filter (empty = all). */
  classIds: string[];
  /** Statuses (UPPERCASE), e.g. ACTIVE, DRAFT. */
  statuses: string[];
  startDate?: string;
  endDate?: string;
  search: string;
  measure?: ClassAttentionMeasure;
  sortBy?: ClassSortField;
  sortDir?: SortDir;
}

/** True when the search box narrows the class list. */
export const hasClassSearch = (filters: ClassListFilters) =>
  toSearchParam(filters.search) !== '';

/** True when panel filters or the attention measure narrow the class list. */
export const hasClassFilters = (filters: ClassListFilters) =>
  filters.schoolIds.length > 0 ||
  filters.classIds.length > 0 ||
  filters.statuses.length > 0 ||
  !!filters.startDate ||
  !!filters.endDate ||
  !!filters.measure;

/**
 * The picked statuses the BE accepts (ACTIVE, INACTIVE, ARCHIEVED), sorted so
 * any pick order hits the same cache entry.
 */
const toStatusParam = (statuses: string[]) =>
  statuses
    .map(toSelectableClassStatus)
    .filter((s): s is SelectableClassStatus => !!s)
    .sort();

/**
 * Args for the infinite school-groups list: only schools with classes matching
 * every list filter, so each group's `classCount` equals its class list. This
 * endpoint takes the class-prefixed status/date names.
 */
export const buildSchoolGroupsInfiniteArg = (
  filters: ClassListFilters
): SchoolGroupsInfiniteArg =>
  compact({
    pageSize: SCHOOL_GROUPS_PAGE_SIZE,
    schoolId: toIdParam(filters.schoolIds),
    classId: toIdParam(filters.classIds),
    className: toSearchParam(filters.search),
    classStatus: toStatusParam(filters.statuses),
    classStartDateFrom: filters.startDate,
    classEndDateTo: filters.endDate,
    measure: filters.measure,
  });

/** The list filters (search, panel filters, attention measure) as `/api/classes` params. */
const buildClassFilterParams = (filters: ClassListFilters) =>
  compact({
    classId: toIdParam(filters.classIds),
    status: toStatusParam(filters.statuses),
    startDateFrom: filters.startDate,
    endDateTo: filters.endDate,
    search: toSearchParam(filters.search),
    measure: filters.measure,
  });

/**
 * Args for one school's infinite class list: every list filter, combined (AND)
 * with the attention measure, scoped to that school.
 */
export const buildClassesInfiniteArg = (
  filters: ClassListFilters,
  schoolId: string
): ClassesInfiniteArg =>
  compact({
    pageSize: CLASSES_PAGE_SIZE,
    schoolIds: [schoolId],
    ...buildClassFilterParams(filters),
    sortBy: filters.sortBy,
    sortDir: filters.sortBy ? filters.sortDir : undefined,
  });

/**
 * A one-row request for how many classes match the list filters across every
 * school (or the picked ones): the "Showing:" chip reads `meta.total`.
 */
export const buildFilteredClassCountArg = (
  filters: ClassListFilters
): ListClassesReqDto =>
  compact({
    page: 1,
    pageSize: 1,
    schoolIds: toIdParam(filters.schoolIds),
    ...buildClassFilterParams(filters),
  });

/** Page size for the filter panel's School and Class Name dropdowns. */
export const FILTER_OPTIONS_PAGE_SIZE = 20;

/** Args for the School dropdown's options, searched by school name. */
export const buildSchoolOptionsArg = (
  search: string
): SchoolOptionsInfiniteArg =>
  compact({
    pageSize: FILTER_OPTIONS_PAGE_SIZE,
    schoolName: toSearchParam(search),
  });

/**
 * Args for the Class Name dropdown's options: classes of the picked schools
 * (all schools when none is picked).
 */
export const buildClassOptionsArg = (
  search: string,
  schoolIds: string[]
): ClassOptionsInfiniteArg =>
  compact({
    pageSize: FILTER_OPTIONS_PAGE_SIZE,
    search: toSearchParam(search),
    schoolIds: toIdParam(schoolIds),
  });

/** Classes a simulation can be assigned to: every status except archived. */
export const ASSIGNABLE_CLASS_STATUSES = [
  CommonStatus.ACTIVE,
  CommonStatus.INACTIVE,
  CommonStatus.DRAFT,
  CommonStatus.ATTENTION,
];

/**
 * Args for the assign modal's Class Name dropdown: one school group's
 * non-archived classes (full rows, for their dates and student counts).
 */
export const buildAssignClassOptionsArg = (
  search: string,
  schoolGroupId: string
): ClassesInfiniteArg =>
  compact({
    pageSize: FILTER_OPTIONS_PAGE_SIZE,
    search: toSearchParam(search),
    schoolIds: [schoolGroupId],
    status: ASSIGNABLE_CLASS_STATUSES,
  });

const CLASS_STATUSES: ReadonlyArray<NonNullable<Class['status']>> = [
  'ACTIVE',
  'DRAFT',
  'INACTIVE',
  'ARCHIEVED',
  'ATTENTION',
];

const toClassStatus = (status: string): Class['status'] =>
  CLASS_STATUSES.find((value) => value === status);

/**
 * Maps a `/api/classes` row into the row shape the class table, row actions and
 * sub-tables use. The list endpoint has only counts, so the student/sim lists
 * come from `fullClass` (the legacy full class list) until dedicated
 * students/sims/reports APIs replace it.
 */
export const mapClassSummaryToRow = (
  summary: ClassSummaryResDto,
  school: Pick<SchoolGroupResDto, 'schoolId' | 'schoolName'>,
  fullClass?: ClassWithStudents
): ClassWithStudents => ({
  ...fullClass,
  id: summary.classId,
  class_name: summary.className,
  start_date: summary.startDate,
  end_date: summary.endDate,
  status: toClassStatus(summary.status) ?? fullClass?.status,
  school_id: school.schoolId ?? fullClass?.school_id,
  school_name: school.schoolName,
  students: fullClass?.students ?? [],
  sims: fullClass?.sims ?? [],
  studentsCount: summary.studentsCount,
  simsCount: summary.simsCount,
  reportsCount: summary.reportsCount,
});

export const buildCreateClassBody = (
  values: ClassFormValues
): CreateClassReqDto =>
  compact({
    className: values.class_name,
    startDate: values.start_date,
    endDate: values.end_date,
    schoolId: values.school_id,
    status: toSelectableClassStatus(values.status),
    totalNoOfStudents: values.total_no_of_students
      ? Number(values.total_no_of_students)
      : undefined,
  });

export interface UpdateClassInput {
  class_name: string;
  status: string;
  start_date: string;
  end_date: string;
  school_id?: string;
}

/** PUT replaces the class fields, so every field is sent as-is (not compacted). */
export const buildUpdateClassBody = (
  values: UpdateClassInput
): UpdateClassReqDto => ({
  className: values.class_name,
  status: toCommonStatus(values.status),
  startDate: values.start_date,
  endDate: values.end_date,
  schoolId: values.school_id,
});

/** Reads the BE `{ message }` from an RTK Query mutation error, or returns the fallback. */
export const getApiErrorMessage = (
  error: unknown,
  fallback: string
): string => {
  if (typeof error !== 'object' || error === null || !('data' in error)) {
    return fallback;
  }
  const { data } = error;
  if (
    typeof data === 'object' &&
    data !== null &&
    'message' in data &&
    typeof data.message === 'string' &&
    data.message
  ) {
    return data.message;
  }
  return fallback;
};

// Characters Windows/macOS/Linux reject in file names, plus control characters.
// eslint-disable-next-line no-control-regex
const UNSAFE_FILE_NAME_CHARS = /[\\/:*?"<>|\u0000-\u001f\u007f]+/g;
const MAX_FILE_NAME_STEM = 100;

// Splits into user-perceived characters, so a joined emoji (👨‍👩‍👧, flags, skin
// tones) stays whole. Falls back to code points where `Intl.Segmenter` is missing.
const toGraphemes = (text: string): string[] =>
  typeof Intl.Segmenter === 'function'
    ? Array.from(
        new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
          text
        ),
        ({ segment }) => segment
      )
    : Array.from(text);

/**
 * `student-codes-<class name>.<format>`. Keeps the class name as typed (case,
 * accents, non-Latin scripts) and only drops characters a file system rejects.
 */
export const buildStudentCodesFileName = (
  className: string,
  format: StudentCodesExportFormat
): string => {
  const cleaned = className
    .replace(UNSAFE_FILE_NAME_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Cut by visible character, not code point or UTF-16 unit, so no emoji is split.
  const safeName = toGraphemes(cleaned)
    .slice(0, MAX_FILE_NAME_STEM)
    .join('')
    // Windows strips trailing dots/spaces, which would break the extension.
    .replace(/[.\s]+$/, '');
  return `student-codes-${safeName || 'class'}.${format}`;
};

/** One student from the BE student codes export. */
export interface StudentCodeRow {
  code: string;
  name: string;
}

// The BE prefixes `'` to cells starting like a spreadsheet formula (CSV injection guard).
const FORMULA_GUARDED_CELL = /^'[=+\-@\t\r]/;

const unguardCell = (cell: string) =>
  FORMULA_GUARDED_CELL.test(cell) ? cell.slice(1) : cell;

/** RFC 4180 rows: quoted cells may hold commas, line breaks and doubled quotes. */
const parseCsvRows = (text: string): string[][] => {
  const source = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source.charAt(i);
    if (inQuotes) {
      if (char !== '"') cell += char;
      else if (source.charAt(i + 1) === '"') {
        cell += '"';
        i += 1;
      } else inQuotes = false;
    } else if (char === '"') inQuotes = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && source.charAt(i + 1) === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
};

/**
 * Students from the BE student codes CSV: a class header block, a blank line,
 * the `Student Code,Student Name` header, then one row per student. Throws when
 * the layout isn't recognised, so a BE format change fails loudly.
 */
export const parseStudentCodesCsv = (text: string): StudentCodeRow[] => {
  const rows = parseCsvRows(text);
  const blankIndex = rows.findIndex((row) => row.every((cell) => cell === ''));
  if (blankIndex === -1 || !rows[blankIndex + 1]) {
    throw new Error('Unrecognised student codes CSV layout.');
  }
  return rows
    .slice(blankIndex + 2)
    .filter((row) => row.some((cell) => cell !== ''))
    .map(([code = '', name = '']) => ({
      code: unguardCell(code),
      name: unguardCell(name),
    }));
};

/**
 * Reads the BE `{ message }` from a failed file download. With `responseType: 'blob'`
 * axios hands the JSON error body back as a Blob, so it's parsed here.
 */
export const getExportErrorMessage = async (
  error: unknown,
  fallback: string
): Promise<string> => {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return fallback;
  }
  const { response } = error;
  if (
    typeof response !== 'object' ||
    response === null ||
    !('data' in response)
  ) {
    return fallback;
  }
  const { data } = response;
  if (!(data instanceof Blob)) return getApiErrorMessage({ data }, fallback);
  try {
    const body: unknown = JSON.parse(await data.text());
    return getApiErrorMessage({ data: body }, fallback);
  } catch {
    return fallback;
  }
};

export {
  useCreateClassMutation,
  useDeleteClassMutation,
  useGetActivityOverviewQuery,
  useGetAttentionSummaryQuery,
  useGetClassesQuery,
  useGetClassOptionsQuery,
  useGetSchoolGroupsQuery,
  useGetSimulationsCompletedGraphQuery,
  useLazyGetClassesQuery,
  useUpdateClassMutation,
} from './classesApi';
