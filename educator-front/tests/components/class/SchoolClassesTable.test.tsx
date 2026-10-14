import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../src/i18n';
import {
  SchoolClassesTable,
  type SchoolClassesTableRowProps,
} from '../../../src/components/class/SchoolClassesTable';
import type { ClassListFilters } from '../../../src/redux/api/classes/classesService';
import { CommonStatus } from '../../../src/redux/api/classes/classes.types';
import type { ClassWithStudents } from '../../../src/types/Class_types';

const { mockUseClasses, mockClassTable } = vi.hoisted(() => ({
  mockUseClasses: vi.fn(),
  mockClassTable: vi.fn(),
}));

vi.mock('../../../src/redux/api/classes/classesApi', () => ({
  useGetClassesInfiniteQuery: (arg: unknown) => mockUseClasses(arg),
}));

vi.mock('../../../src/components/class/ClassTable', () => ({
  default: (props: { data: ClassWithStudents[] }) => {
    mockClassTable(props);
    return (
      <ul>
        {props.data.map((row) => (
          <li key={row.id}>{row.class_name}</li>
        ))}
      </ul>
    );
  },
}));

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;
let observerCallback: ObserverCallback | null = null;

const school = { schoolId: 'sch-1', schoolName: 'Hillcrest', classCount: 2 };
const filters: ClassListFilters = {
  schoolIds: [],
  classIds: [],
  statuses: ['ACTIVE'],
  search: 'bio',
};

const summary = (classId: string, className: string) => ({
  classId,
  className,
  startDate: '2026-01-01',
  endDate: '2026-06-30',
  studentsCount: 4,
  simsCount: 1,
  reportsCount: 2,
  status: CommonStatus.ACTIVE,
});

const classesResult = (
  rows: ReturnType<typeof summary>[],
  overrides: Record<string, unknown> = {}
) => ({
  currentData: { pages: [{ data: rows, meta: {} }], pageParams: [1] },
  isFetching: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
  ...overrides,
});

const renderTable = (
  props: Partial<Parameters<typeof SchoolClassesTable>[0]> = {}
) =>
  render(
    <SchoolClassesTable
      school={school}
      filters={filters}
      classById={new Map()}
      tableProps={{ targetClassId: null } as SchoolClassesTableRowProps}
      onClearSearch={vi.fn()}
      onClearFilters={vi.fn()}
      {...props}
    />
  );

beforeEach(() => {
  mockUseClasses.mockReset();
  mockClassTable.mockReset();
  observerCallback = null;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: ObserverCallback) {
        observerCallback = callback;
      }
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SchoolClassesTable', () => {
  it('requests only this school’s classes with the applied filters', () => {
    mockUseClasses.mockReturnValue(classesResult([]));
    renderTable();
    expect(mockUseClasses).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolIds: ['sch-1'],
        status: ['ACTIVE'],
        search: 'bio',
      })
    );
  });

  it("shows the loader, not the previous filters' rows, while new filters load", () => {
    mockUseClasses.mockReturnValue({
      ...classesResult([]),
      // RTK Query keeps the last result in `data`; it isn't for these filters.
      data: { pages: [{ data: [summary('c-9', 'Old row')], meta: {} }] },
      currentData: undefined,
      isFetching: true,
    });
    renderTable();

    expect(screen.queryByText('Old row')).not.toBeInTheDocument();
    expect(mockClassTable).toHaveBeenLastCalledWith(
      expect.objectContaining({ loading: true, data: [] })
    );
  });

  it('announces that the school’s classes are loading to screen readers', () => {
    mockUseClasses.mockReturnValue({
      ...classesResult([]),
      currentData: undefined,
      isFetching: true,
    });
    const { rerender } = renderTable();
    expect(screen.getByRole('status')).toHaveTextContent('Loading classes…');

    mockUseClasses.mockReturnValue(classesResult([summary('c-1', 'Biology')]));
    rerender(
      <SchoolClassesTable
        school={school}
        filters={filters}
        classById={new Map()}
        tableProps={{ targetClassId: null } as SchoolClassesTableRowProps}
        onClearSearch={vi.fn()}
        onClearFilters={vi.fn()}
      />
    );
    expect(screen.queryByText('Loading classes…')).not.toBeInTheDocument();
  });

  it('renders every loaded page without client pagination and with the shared header hidden', () => {
    mockUseClasses.mockReturnValue({
      ...classesResult([]),
      currentData: {
        pages: [
          { data: [summary('c-1', 'Biology')], meta: {} },
          { data: [summary('c-2', 'Chemistry')], meta: {} },
        ],
        pageParams: [1, 2],
      },
    });
    renderTable();

    expect(screen.getByText('Biology')).toBeInTheDocument();
    expect(screen.getByText('Chemistry')).toBeInTheDocument();
    expect(mockClassTable).toHaveBeenLastCalledWith(
      expect.objectContaining({ hideHeader: true, paginated: false })
    );
  });

  it('fills rows from the API and students from the full class list', () => {
    mockUseClasses.mockReturnValue(classesResult([summary('c-1', 'Biology')]));
    const students = [
      { student_id: 'S-1', student_name: 'Ana', email: null, score: null },
    ];
    renderTable({
      classById: new Map([
        ['c-1', { id: 'c-1', class_name: 'Old name', students }],
      ]),
    });

    const row = mockClassTable.mock.lastCall?.[0].data[0];
    expect(row).toMatchObject({
      id: 'c-1',
      class_name: 'Biology',
      school_id: 'sch-1',
      studentsCount: 4,
      reportsCount: 2,
      students,
    });
  });

  it('loads the next page when the end of the table scrolls into view', () => {
    const fetchNextPage = vi.fn();
    mockUseClasses.mockReturnValue(
      classesResult([summary('c-1', 'Biology')], {
        hasNextPage: true,
        fetchNextPage,
      })
    );
    renderTable();

    act(() => observerCallback?.([{ isIntersecting: true }]));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('keeps loading pages until a deep-linked class in this school is loaded', () => {
    const fetchNextPage = vi.fn();
    mockUseClasses.mockReturnValue(
      classesResult([summary('c-1', 'Biology')], {
        hasNextPage: true,
        fetchNextPage,
      })
    );
    renderTable({
      classById: new Map([
        ['c-9', { id: 'c-9', class_name: 'Target', school_id: 'sch-1' }],
      ]),
      tableProps: { targetClassId: 'c-9' } as SchoolClassesTableRowProps,
    });

    expect(fetchNextPage).toHaveBeenCalled();
  });

  describe('empty results', () => {
    const unfiltered: ClassListFilters = {
      ...filters,
      statuses: [],
      search: '',
    };

    it('shows an empty state for a school with no classes', () => {
      mockUseClasses.mockReturnValue(classesResult([]));
      renderTable({ filters: unfiltered });

      expect(
        screen.getByText('No classes in this school yet.')
      ).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(mockClassTable).not.toHaveBeenCalled();
    });

    it('shows a no-result state that clears the filters when they match no class here', () => {
      const onClearFilters = vi.fn();
      mockUseClasses.mockReturnValue(classesResult([]));
      renderTable({
        filters: { ...unfiltered, statuses: ['DRAFT'] },
        onClearFilters,
      });

      expect(
        screen.getByText('No classes match your search or filters.')
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
      expect(onClearFilters).toHaveBeenCalledTimes(1);
    });

    it('shows the unavailable message with a retry when the first page fails', () => {
      const refetch = vi.fn();
      mockUseClasses.mockReturnValue(
        classesResult([], { currentData: undefined, isError: true, refetch })
      );
      renderTable();

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to fetch classes'
      );
      expect(mockClassTable).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('keeps the empty state while a refresh of the empty list runs', () => {
      mockUseClasses.mockReturnValue(classesResult([], { isFetching: true }));
      renderTable({ filters: unfiltered });

      expect(
        screen.getByText('No classes in this school yet.')
      ).toBeInTheDocument();
      expect(mockClassTable).not.toHaveBeenCalled();
    });

    it('shows the unavailable message with a retry when a refresh of the empty list fails', () => {
      const refetch = vi.fn();
      // A refetch (e.g. after a tag invalidation) failed; the cached result is empty.
      mockUseClasses.mockReturnValue(
        classesResult([], { isError: true, refetch })
      );
      renderTable({ filters: unfiltered });

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to fetch classes'
      );
      expect(mockClassTable).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(refetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('end of the list', () => {
    it("shows the end of the list once every page of the school's classes has loaded", () => {
      mockUseClasses.mockReturnValue(
        classesResult([summary('c-1', 'Biology')])
      );
      renderTable();
      expect(
        screen.getByText('All classes in this school are shown.')
      ).toBeInTheDocument();
    });

    it('does not show it while more classes can load', () => {
      mockUseClasses.mockReturnValue(
        classesResult([summary('c-1', 'Biology')], { hasNextPage: true })
      );
      renderTable();
      expect(
        screen.queryByText('All classes in this school are shown.')
      ).not.toBeInTheDocument();
    });

    it('shows a retry, and stops auto-loading, when a later page fails', () => {
      const fetchNextPage = vi.fn();
      mockUseClasses.mockReturnValue(
        classesResult([summary('c-1', 'Biology')], {
          hasNextPage: true,
          isError: true,
          direction: 'forward',
          fetchNextPage,
        })
      );
      renderTable();

      expect(screen.getByText('Biology')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(
        "Couldn't load more."
      );
      act(() => observerCallback?.([{ isIntersecting: true }]));
      expect(fetchNextPage).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(fetchNextPage).toHaveBeenCalledTimes(1);
    });

    it('retries a failed refresh of the loaded classes with a refetch', () => {
      const fetchNextPage = vi.fn();
      const refetch = vi.fn();
      // A refetch (e.g. after a tag invalidation) failed; the cached rows stay.
      mockUseClasses.mockReturnValue(
        classesResult([summary('c-1', 'Biology')], {
          isError: true,
          fetchNextPage,
          refetch,
        })
      );
      renderTable();

      expect(screen.getByText('Biology')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to fetch classes'
      );
      expect(
        screen.queryByText('All classes in this school are shown.')
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(refetch).toHaveBeenCalledTimes(1);
      expect(fetchNextPage).not.toHaveBeenCalled();
    });
  });

  describe('the unassigned group (classes without a school)', () => {
    const unassigned = {
      schoolId: null,
      schoolName: 'Unassigned',
      classCount: 1,
    };

    it('requests its classes with the BE unassigned sentinel', () => {
      mockUseClasses.mockReturnValue(classesResult([]));
      renderTable({ school: unassigned });
      expect(mockUseClasses).toHaveBeenCalledWith(
        expect.objectContaining({ schoolIds: ['unassigned'] })
      );
    });

    it('keeps loading pages until a deep-linked class without a school is loaded', () => {
      const fetchNextPage = vi.fn();
      mockUseClasses.mockReturnValue(
        classesResult([summary('c-1', 'Biology')], {
          hasNextPage: true,
          fetchNextPage,
        })
      );
      renderTable({
        school: unassigned,
        classById: new Map([['c-9', { id: 'c-9', class_name: 'Target' }]]),
        tableProps: { targetClassId: 'c-9' } as SchoolClassesTableRowProps,
      });

      expect(fetchNextPage).toHaveBeenCalled();
    });

    it('does not chase a deep-linked class that belongs to a real school', () => {
      const fetchNextPage = vi.fn();
      mockUseClasses.mockReturnValue(
        classesResult([summary('c-1', 'Biology')], {
          hasNextPage: true,
          fetchNextPage,
        })
      );
      renderTable({
        school: unassigned,
        classById: new Map([
          ['c-9', { id: 'c-9', class_name: 'Target', school_id: 'sch-1' }],
        ]),
        tableProps: { targetClassId: 'c-9' } as SchoolClassesTableRowProps,
      });

      expect(fetchNextPage).not.toHaveBeenCalled();
    });
  });
});
