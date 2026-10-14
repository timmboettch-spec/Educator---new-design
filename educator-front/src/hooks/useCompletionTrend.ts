import { useEffect, useMemo, useState } from 'react';
import type { MultiSelectOption } from '@/components/ui/MultiSelect';
import {
  useGetClassOptionsQuery,
  useGetSchoolGroupsQuery,
  useGetSimulationsCompletedGraphQuery,
} from '@/redux/api/classes/classesApi';
import {
  ClassSortField,
  type SimulationsCompletedGraphCompareBy,
} from '@/redux/api/classes/classes.types';
import {
  buildBreakdownGraphParams,
  buildGraphParams,
  COMPARE_MAX_ITEMS,
  getCompareLevel,
  type GraphDrill,
} from '@/redux/api/classes/classesService';
import { useGetStudentOptionsQuery } from '@/redux/api/students/studentsApi';
import {
  buildMonthBuckets,
  buildSeriesBuckets,
  DEFAULT_COMPLETION_TIMEFRAME,
  type CompareSeries,
  type CompletionTimeframe,
} from '@/utils/completionTrend';
import { useDebouncedValue } from './useDebouncedValue';

// BE max page size. Dropdowns load one page and search server-side; `hasMore` tells the
// user to type when the BE has further pages.
const OPTIONS_PAGE_SIZE = 50;

export type CompletionView = 'time' | 'school';

export interface ChartBar {
  key: string;
  label: string;
  count: number;
}

export type BreakdownLevel = GraphDrill['level'];

/** A drilled-into school or class, named for the breadcrumb. */
interface DrillStep {
  id: string;
  name: string;
}

// The BE's "no school" bucket: shown as a bar, but it can't be drilled into.
const UNASSIGNED_BAR_KEY = 'unassigned';

interface UseCompletionTrendArgs {
  locale: string;
  // Label for the BE's "no school" (schoolId: null) bucket in the school breakdown.
  unassignedSchoolLabel: string;
  // Label for a student with no student code in the per-student breakdown.
  unknownStudentLabel: string;
  // False while the section is collapsed: every query is skipped, filter state is kept.
  enabled: boolean;
}

/**
 * Filter state, dropdown options and chart bars for the Simulations Completed chart.
 * Schools narrow classes and students; classes narrow students. Changing a filter clears
 * the ones it narrows. `view` switches between completions per month and Breakdown.
 * Breakdown ignores the filters (selections are kept for switching back) and drills
 * from schools to one school's classes to one class's students.
 * Over Time shows the Total per month, or with Compare one series per selected item at
 * the deepest filter with 2+ items (up to COMPARE_MAX_ITEMS), side by side.
 */
export function useCompletionTrend({
  locale,
  unassignedSchoolLabel,
  unknownStudentLabel,
  enabled,
}: UseCompletionTrendArgs) {
  const skip = !enabled;
  const [view, setViewState] = useState<CompletionView>('time');
  // Remembered while Compare can't apply (e.g. one item selected), as in the design.
  const [isCompareOn, setCompareOn] = useState(false);
  const [drillSchool, setDrillSchool] = useState<DrillStep | null>(null);
  const [drillClass, setDrillClass] = useState<DrillStep | null>(null);
  const [timeframe, setTimeframe] = useState<CompletionTimeframe>(
    DEFAULT_COMPLETION_TIMEFRAME
  );
  const [selectedSchools, setSelectedSchools] = useState<MultiSelectOption[]>(
    []
  );
  const [selectedClasses, setSelectedClasses] = useState<MultiSelectOption[]>(
    []
  );
  const [selectedStudents, setSelectedStudents] = useState<MultiSelectOption[]>(
    []
  );
  const [schoolSearch, setSchoolSearch] = useState('');
  const [classSearch, setClassSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const debouncedSchoolSearch = useDebouncedValue(schoolSearch.trim());
  const debouncedClassSearch = useDebouncedValue(classSearch.trim());
  const debouncedStudentSearch = useDebouncedValue(studentSearch.trim());

  const schoolIds = selectedSchools.map((o) => o.value);
  const classIds = selectedClasses.map((o) => o.value);
  const studentIds = selectedStudents.map((o) => o.value);
  // Breakdown charts every school, so the class/student filters are hidden and not sent.
  const isBreakdown = view === 'school';

  const compareLevel = getCompareLevel({ schoolIds, classIds, studentIds });
  const compareItems = useMemo((): MultiSelectOption[] => {
    if (compareLevel === 'student') return selectedStudents;
    if (compareLevel === 'class') return selectedClasses;
    if (compareLevel === 'school') return selectedSchools;
    return [];
  }, [compareLevel, selectedSchools, selectedClasses, selectedStudents]);
  // The toggle shows once a filter has 2+ items; past the limit it can't be turned on.
  const canShowCompare = !isBreakdown && compareLevel !== undefined;
  const isCompareBlocked = compareItems.length > COMPARE_MAX_ITEMS;
  const isComparing = canShowCompare && !isCompareBlocked && isCompareOn;

  // Unsearched, so Breakdown's school names don't depend on the dropdown's search box.
  const schoolGroupsQuery = useGetSchoolGroupsQuery(
    { page: 1, pageSize: OPTIONS_PAGE_SIZE },
    { skip }
  );
  // Same args as above until the user searches, so RTK Query sends one request.
  const schoolOptionsQuery = useGetSchoolGroupsQuery(
    {
      page: 1,
      pageSize: OPTIONS_PAGE_SIZE,
      ...(debouncedSchoolSearch ? { schoolName: debouncedSchoolSearch } : {}),
    },
    { skip }
  );

  const classOptionsQuery = useGetClassOptionsQuery(
    {
      page: 1,
      pageSize: OPTIONS_PAGE_SIZE,
      sortBy: ClassSortField.CLASS_NAME,
      sortDir: 'asc',
      ...(schoolIds.length > 0 ? { schoolIds } : {}),
      ...(debouncedClassSearch ? { search: debouncedClassSearch } : {}),
    },
    { skip: skip || isBreakdown }
  );

  const studentOptionsQuery = useGetStudentOptionsQuery(
    {
      page: 1,
      pageSize: OPTIONS_PAGE_SIZE,
      ...(schoolIds.length > 0 ? { schoolIds } : {}),
      ...(classIds.length > 0 ? { classIds } : {}),
      ...(debouncedStudentSearch ? { search: debouncedStudentSearch } : {}),
    },
    { skip: skip || isBreakdown }
  );

  let drill: GraphDrill = { level: 'school' };
  if (drillSchool && drillClass) {
    drill = {
      level: 'student',
      schoolId: drillSchool.id,
      classId: drillClass.id,
    };
  } else if (drillSchool) {
    drill = { level: 'class', schoolId: drillSchool.id };
  }

  const graphQuery = useGetSimulationsCompletedGraphQuery(
    isBreakdown
      ? buildBreakdownGraphParams(drill, timeframe)
      : buildGraphParams({
          schoolIds,
          classIds,
          studentIds,
          timeframe,
          compareBy: isComparing ? compareLevel : undefined,
        }),
    { skip }
  );

  const schoolNames = useMemo(
    () =>
      new Map(
        (schoolGroupsQuery.data?.data ?? []).map((g) => [
          g.schoolId,
          g.schoolName,
        ])
      ),
    [schoolGroupsQuery.data]
  );

  // The unassigned bucket (schoolId: null) can't be sent as a graph schoolIds filter.
  const schoolOptions: MultiSelectOption[] = useMemo(
    () =>
      (schoolOptionsQuery.data?.data ?? [])
        .filter(
          (g): g is typeof g & { schoolId: string } => g.schoolId !== null
        )
        .map((g) => ({ value: g.schoolId, label: g.schoolName })),
    [schoolOptionsQuery.data]
  );

  const classOptions: MultiSelectOption[] = useMemo(
    () =>
      (classOptionsQuery.data?.data ?? []).map((c) => ({
        value: c.classId,
        label: c.className,
      })),
    [classOptionsQuery.data]
  );

  const studentOptions: MultiSelectOption[] = useMemo(
    () =>
      (studentOptionsQuery.data?.data ?? []).map((s) => ({
        value: s.id,
        label: s.studentId,
        description: s.name ?? undefined,
      })),
    [studentOptionsQuery.data]
  );

  const monthBars: ChartBar[] = useMemo(
    () =>
      buildMonthBuckets(
        timeframe,
        graphQuery.data?.byMonth ?? [],
        new Date(),
        locale
      ),
    [timeframe, graphQuery.data, locale]
  );

  // One series per compared item, in selection order; [] outside Compare.
  const series: CompareSeries[] = useMemo(() => {
    const byMonthSeries = graphQuery.data?.byMonthSeries;
    if (!isComparing || !byMonthSeries) return [];
    const seriesNames = new Map(
      byMonthSeries.flatMap((m) =>
        m.series.map((s) => [s.seriesId, s.seriesName] as const)
      )
    );
    return buildSeriesBuckets(
      monthBars,
      byMonthSeries,
      compareItems.map((item) => ({
        id: item.value,
        label: item.label || seriesNames.get(item.value) || unknownStudentLabel,
      }))
    );
  }, [
    isComparing,
    graphQuery.data,
    monthBars,
    compareItems,
    unknownStudentLabel,
  ]);

  const breakdownBars: ChartBar[] = useMemo(() => {
    const data = graphQuery.data;
    if (drill.level === 'student') {
      return (data?.byStudent ?? []).map((s) => ({
        key: s.studentId,
        label: s.studentCode ?? unknownStudentLabel,
        count: s.count,
      }));
    }
    if (drill.level === 'class') {
      return (data?.byClass ?? []).map((c) => ({
        key: c.classId,
        label: c.className,
        count: c.count,
      }));
    }
    return (data?.bySchool ?? []).map((s) => ({
      key: s.schoolId ?? UNASSIGNED_BAR_KEY,
      label:
        s.schoolId === null
          ? unassignedSchoolLabel
          : (schoolNames.get(s.schoolId) ?? s.schoolId),
      count: s.count,
    }));
  }, [
    graphQuery.data,
    drill.level,
    schoolNames,
    unassignedSchoolLabel,
    unknownStudentLabel,
  ]);

  const bars = view === 'time' ? monthBars : breakdownBars;

  /** Whether a Breakdown bar opens the next level (students are the last level). */
  const canDrillInto = (bar: ChartBar) =>
    isBreakdown &&
    drill.level !== 'student' &&
    !(drill.level === 'school' && bar.key === UNASSIGNED_BAR_KEY);

  const drillInto = (bar: ChartBar) => {
    // A click on the faded previous chart while the next level loads is ignored.
    if (graphQuery.isFetching || !canDrillInto(bar)) return;
    const step = { id: bar.key, name: bar.label };
    if (drill.level === 'school') setDrillSchool(step);
    else setDrillClass(step);
  };

  /** Breadcrumb: back to every school, or to the drilled school's classes. */
  const drillToLevel = (level: 'school' | 'class') => {
    if (level === 'school') setDrillSchool(null);
    setDrillClass(null);
  };

  // Opening Breakdown always starts at every school, as in the design.
  const setView = (next: CompletionView) => {
    setViewState(next);
    if (next === 'school') {
      setDrillSchool(null);
      setDrillClass(null);
    }
  };
  const total = bars.reduce((sum, b) => sum + b.count, 0);

  const changeSchools = (next: MultiSelectOption[]) => {
    setSelectedSchools(next);
    setSelectedClasses([]);
    setSelectedStudents([]);
    setClassSearch('');
    setStudentSearch('');
  };

  const changeClasses = (next: MultiSelectOption[]) => {
    setSelectedClasses(next);
    setSelectedStudents([]);
    setStudentSearch('');
  };

  let status: 'loading' | 'failed' | 'empty' | 'ready' = 'ready';
  if (graphQuery.isError) status = 'failed';
  // isFetching covers a new selection while old data is still cached.
  else if (graphQuery.isLoading || graphQuery.isFetching) status = 'loading';
  else if (total === 0) status = 'empty';

  // The last chart that was shown, kept on screen (faded) while the next one loads so
  // drilling or changing a filter doesn't blank the chart. Cleared by an empty/failed result.
  const [previousBars, setPreviousBars] = useState<ChartBar[] | null>(null);
  const [previousSeries, setPreviousSeries] = useState<CompareSeries[]>([]);
  useEffect(() => {
    if (status === 'ready') {
      setPreviousBars(bars);
      setPreviousSeries(series);
    } else if (status !== 'loading') {
      setPreviousBars(null);
      setPreviousSeries([]);
    }
  }, [status, bars, series]);

  return {
    view,
    setView,
    breakdown: {
      level: drill.level,
      school: drillSchool,
      class: drillClass,
      canDrillInto,
      drillInto,
      drillToLevel,
    },
    compare: {
      /** Show the Total / Compare toggle: Over Time with 2+ items in a filter. */
      canShow: canShowCompare,
      /** More items selected at the compared level than Compare can draw. */
      isBlocked: isCompareBlocked,
      isOn: isComparing,
      setOn: setCompareOn,
      level: compareLevel as SimulationsCompletedGraphCompareBy | undefined,
      maxItems: COMPARE_MAX_ITEMS,
    },
    timeframe,
    setTimeframe,
    schools: {
      options: schoolOptions,
      selected: selectedSchools,
      onChange: changeSchools,
      search: schoolSearch,
      onSearchChange: setSchoolSearch,
      loading: schoolOptionsQuery.isFetching,
      error: schoolOptionsQuery.isError,
      hasMore: schoolOptionsQuery.data?.meta.hasNextPage ?? false,
    },
    classes: {
      options: classOptions,
      selected: selectedClasses,
      onChange: changeClasses,
      search: classSearch,
      onSearchChange: setClassSearch,
      loading: classOptionsQuery.isFetching,
      error: classOptionsQuery.isError,
      hasMore: classOptionsQuery.data?.meta.hasNextPage ?? false,
    },
    students: {
      options: studentOptions,
      selected: selectedStudents,
      onChange: setSelectedStudents,
      search: studentSearch,
      onSearchChange: setStudentSearch,
      loading: studentOptionsQuery.isFetching,
      error: studentOptionsQuery.isError,
      hasMore: studentOptionsQuery.data?.meta.hasNextPage ?? false,
    },
    bars,
    series,
    // While loading: the chart to keep showing faded, or null for a first load.
    previousBars: status === 'loading' ? previousBars : null,
    previousSeries: status === 'loading' ? previousSeries : [],
    total,
    status,
  };
}
