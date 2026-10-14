import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../src/i18n';
import { SchoolAccordionList } from '../../../src/components/class/SchoolAccordionList';
import type { SchoolClassesTableRowProps } from '../../../src/components/class/SchoolClassesTable';
import type { ClassListFilters } from '../../../src/redux/api/classes/classesService';
import { ClassAttentionMeasure } from '../../../src/redux/api/classes/classes.types';

const { mockUseSchoolGroups } = vi.hoisted(() => ({
  mockUseSchoolGroups: vi.fn(),
}));

vi.mock('../../../src/redux/api/classes/classesApi', () => ({
  useGetSchoolGroupsInfiniteQuery: (arg: unknown) => mockUseSchoolGroups(arg),
}));

// The per-school table is covered separately; here we only care that it
// mounts for open schools.
vi.mock('../../../src/components/class/SchoolClassesTable', () => ({
  SchoolClassesTable: ({ school }: { school: { schoolName: string } }) => (
    <div>classes of {school.schoolName}</div>
  ),
}));

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;
let observerCallback: ObserverCallback | null = null;

const filters: ClassListFilters = {
  schoolIds: [],
  classIds: [],
  statuses: [],
  search: '',
};

const schoolsResult = (
  schools: Array<{
    schoolId: string | null;
    schoolName: string;
    classCount: number;
  }>,
  overrides: Record<string, unknown> = {}
) => ({
  currentData: {
    pages: [
      {
        data: schools,
        meta: {
          total: schools.length,
          page: 1,
          pageSize: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      },
    ],
    pageParams: [1],
  },
  isFetching: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
  ...overrides,
});

const renderList = (
  props: Partial<Parameters<typeof SchoolAccordionList>[0]> = {}
) =>
  render(
    <SchoolAccordionList
      filters={filters}
      classById={new Map()}
      tableProps={{} as SchoolClassesTableRowProps}
      onClearSearch={vi.fn()}
      onClearFilters={vi.fn()}
      {...props}
    />
  );

beforeEach(() => {
  mockUseSchoolGroups.mockReset();
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

describe('SchoolAccordionList', () => {
  it('shows each school with its class count, with only the first one open', () => {
    mockUseSchoolGroups.mockReturnValue(
      schoolsResult([
        { schoolId: 'sch-1', schoolName: 'Hillcrest', classCount: 3 },
        { schoolId: 'sch-2', schoolName: 'Riverside', classCount: 1 },
      ])
    );
    renderList();

    expect(
      screen.getByRole('button', { name: 'School: Hillcrest (3)' })
    ).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('button', { name: 'School: Riverside (1)' })
    ).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('classes of Hillcrest')).toBeInTheDocument();
    expect(screen.queryByText('classes of Riverside')).not.toBeInTheDocument();
  });

  it('opens the school of a single-school educator by default', () => {
    mockUseSchoolGroups.mockReturnValue(
      schoolsResult([
        { schoolId: 'sch-1', schoolName: 'Hillcrest', classCount: 3 },
      ])
    );
    renderList();

    expect(
      screen.getByRole('button', { name: 'School: Hillcrest (3)' })
    ).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('classes of Hillcrest')).toBeInTheDocument();
  });

  it('keeps the first school collapsed after the user closes it, across refetches', () => {
    mockUseSchoolGroups.mockReturnValue(
      schoolsResult([
        { schoolId: 'sch-1', schoolName: 'Hillcrest', classCount: 3 },
      ])
    );
    const { rerender } = renderList();
    const hillcrest = screen.getByRole('button', {
      name: 'School: Hillcrest (3)',
    });

    fireEvent.click(hillcrest);
    // Same filters, fresh data (e.g. after a tag invalidation).
    mockUseSchoolGroups.mockReturnValue(
      schoolsResult([
        { schoolId: 'sch-1', schoolName: 'Hillcrest', classCount: 3 },
      ])
    );
    rerender(
      <SchoolAccordionList
        filters={filters}
        classById={new Map()}
        tableProps={{} as SchoolClassesTableRowProps}
        onClearSearch={vi.fn()}
        onClearFilters={vi.fn()}
      />
    );
    expect(hillcrest).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the first school of the new result when the filters change', () => {
    mockUseSchoolGroups.mockReturnValue(
      schoolsResult([
        { schoolId: 'sch-1', schoolName: 'Hillcrest', classCount: 3 },
        { schoolId: 'sch-2', schoolName: 'Riverside', classCount: 1 },
      ])
    );
    const { rerender } = renderList();

    mockUseSchoolGroups.mockReturnValue(
      schoolsResult([
        { schoolId: 'sch-2', schoolName: 'Riverside', classCount: 1 },
      ])
    );
    rerender(
      <SchoolAccordionList
        filters={{ ...filters, search: 'river' }}
        classById={new Map()}
        tableProps={{} as SchoolClassesTableRowProps}
        onClearSearch={vi.fn()}
        onClearFilters={vi.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: 'School: Riverside (1)' })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('reopens the first school when only a status or date filter changes', () => {
    mockUseSchoolGroups.mockReturnValue(
      schoolsResult([
        { schoolId: 'sch-1', schoolName: 'Hillcrest', classCount: 3 },
      ])
    );
    const { rerender } = renderList();
    const hillcrest = screen.getByRole('button', {
      name: 'School: Hillcrest (3)',
    });
    fireEvent.click(hillcrest);
    expect(hillcrest).toHaveAttribute('aria-expanded', 'false');

    // The school groups are requested with these filters (class-prefixed names).
    rerender(
      <SchoolAccordionList
        filters={{ ...filters, statuses: ['ACTIVE'], startDate: '2026-01-01' }}
        classById={new Map()}
        tableProps={{} as SchoolClassesTableRowProps}
        onClearSearch={vi.fn()}
        onClearFilters={vi.fn()}
      />
    );
    expect(mockUseSchoolGroups.mock.calls.at(-1)?.[0]).toMatchObject({
      classStatus: ['ACTIVE'],
      classStartDateFrom: '2026-01-01',
    });
    expect(hillcrest).toHaveAttribute('aria-expanded', 'true');
  });

  it('announces each school group as a heading, and the open one as a region', () => {
    mockUseSchoolGroups.mockReturnValue(
      schoolsResult([
        { schoolId: 'sch-1', schoolName: 'Hillcrest', classCount: 3 },
        { schoolId: 'sch-2', schoolName: 'Riverside', classCount: 1 },
      ])
    );
    renderList();

    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent)
    ).toEqual(['School: Hillcrest (3)', 'School: Riverside (1)']);

    expect(
      screen.getByRole('region', { name: 'School: Hillcrest (3)' })
    ).toHaveTextContent('classes of Hillcrest');
  });

  it('mounts the school’s class table only after it is expanded', () => {
    mockUseSchoolGroups.mockReturnValue(
      schoolsResult([
        { schoolId: 'sch-1', schoolName: 'Hillcrest', classCount: 3 },
        { schoolId: 'sch-2', schoolName: 'Riverside', classCount: 1 },
      ])
    );
    renderList();
    expect(screen.queryByText('classes of Riverside')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'School: Riverside (1)' })
    );
    expect(screen.getByText('classes of Riverside')).toBeInTheDocument();
  });

  it('keeps only one school open: opening another collapses the first', () => {
    mockUseSchoolGroups.mockReturnValue(
      schoolsResult([
        { schoolId: 'sch-1', schoolName: 'Hillcrest', classCount: 3 },
        { schoolId: 'sch-2', schoolName: 'Riverside', classCount: 1 },
      ])
    );
    renderList();
    const hillcrest = screen.getByRole('button', {
      name: 'School: Hillcrest (3)',
    });
    const riverside = screen.getByRole('button', {
      name: 'School: Riverside (1)',
    });

    fireEvent.click(hillcrest);
    fireEvent.click(riverside);
    expect(hillcrest).toHaveAttribute('aria-expanded', 'false');
    expect(riverside).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByText('classes of Hillcrest')).not.toBeInTheDocument();
    expect(screen.getByText('classes of Riverside')).toBeInTheDocument();

    fireEvent.click(riverside);
    expect(screen.queryByText(/classes of/)).not.toBeInTheDocument();
  });

  it('opens the school of a deep-linked class', () => {
    mockUseSchoolGroups.mockReturnValue(
      schoolsResult([
        { schoolId: 'sch-1', schoolName: 'Hillcrest', classCount: 3 },
        { schoolId: 'sch-2', schoolName: 'Riverside', classCount: 1 },
      ])
    );
    renderList({ autoOpenSchoolId: 'sch-2' });
    expect(screen.getByText('classes of Riverside')).toBeInTheDocument();
    expect(screen.queryByText('classes of Hillcrest')).not.toBeInTheDocument();
  });

  it('keeps loading school pages until a deep-linked school is in the list', () => {
    const fetchNextPage = vi.fn();
    mockUseSchoolGroups.mockReturnValue(
      schoolsResult(
        [{ schoolId: 'sch-1', schoolName: 'Hillcrest', classCount: 3 }],
        { hasNextPage: true, fetchNextPage }
      )
    );
    renderList({ autoOpenSchoolId: 'sch-42' });
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it('stops loading school pages once the deep-linked school is loaded', () => {
    const fetchNextPage = vi.fn();
    mockUseSchoolGroups.mockReturnValue(
      schoolsResult(
        [{ schoolId: 'sch-42', schoolName: 'Riverside', classCount: 1 }],
        { hasNextPage: true, fetchNextPage }
      )
    );
    renderList({ autoOpenSchoolId: 'sch-42' });
    expect(fetchNextPage).not.toHaveBeenCalled();
    expect(screen.getByText('classes of Riverside')).toBeInTheDocument();
  });

  it('names the no-school group with the backend school name', () => {
    mockUseSchoolGroups.mockReturnValue(
      schoolsResult([
        { schoolId: 'sch-1', schoolName: 'Hillcrest', classCount: 3 },
        {
          schoolId: null,
          schoolName: 'Classes without a school',
          classCount: 2,
        },
      ])
    );
    renderList();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'School: Classes without a school (2)',
      })
    );
    expect(
      screen.getByText('classes of Classes without a school')
    ).toBeInTheDocument();
  });

  it('opens the unassigned group for a deep-linked class without a school', () => {
    mockUseSchoolGroups.mockReturnValue(
      schoolsResult([
        { schoolId: 'sch-1', schoolName: 'Hillcrest', classCount: 3 },
        {
          schoolId: null,
          schoolName: 'Classes without a school',
          classCount: 2,
        },
      ])
    );
    renderList({ autoOpenSchoolId: 'unassigned' });
    expect(
      screen.getByRole('button', {
        name: 'School: Classes without a school (2)',
      })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('loads the next page of schools when the end of the list scrolls into view', () => {
    const fetchNextPage = vi.fn();
    mockUseSchoolGroups.mockReturnValue(
      schoolsResult(
        [{ schoolId: 'sch-1', schoolName: 'Hillcrest', classCount: 3 }],
        { hasNextPage: true, fetchNextPage }
      )
    );
    renderList();

    act(() => observerCallback?.([{ isIntersecting: true }]));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state, with no clear action, for a user with no schools', () => {
    mockUseSchoolGroups.mockReturnValue(schoolsResult([]));
    renderList();

    expect(
      screen.getByText("You don't have any schools yet.")
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a no-result state that clears the filters when the School filter matches nothing', () => {
    const onClearFilters = vi.fn();
    const onClearSearch = vi.fn();
    mockUseSchoolGroups.mockReturnValue(schoolsResult([]));
    renderList({
      filters: { ...filters, schoolIds: ['sch-1'] },
      onClearFilters,
      onClearSearch,
    });

    expect(mockUseSchoolGroups).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: ['sch-1'] })
    );
    expect(
      screen.getByText('No classes match your search or filters.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
    expect(onClearSearch).not.toHaveBeenCalled();
  });

  it('offers to clear the search when a search matches no class in any school', () => {
    const onClearSearch = vi.fn();
    mockUseSchoolGroups.mockReturnValue(schoolsResult([]));
    renderList({ filters: { ...filters, search: 'zzz' }, onClearSearch });

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onClearSearch).toHaveBeenCalledTimes(1);
  });

  it('clears both when a search and filters together match nothing', () => {
    const onClearSearch = vi.fn();
    const onClearFilters = vi.fn();
    mockUseSchoolGroups.mockReturnValue(schoolsResult([]));
    renderList({
      filters: {
        ...filters,
        search: 'zzz',
        measure: ClassAttentionMeasure.NO_STUDENTS,
      },
      onClearSearch,
      onClearFilters,
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear search and filters' })
    );
    expect(onClearSearch).toHaveBeenCalledTimes(1);
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('shows the unavailable message with a retry, not a no-result state, when the request fails', () => {
    const refetch = vi.fn();
    mockUseSchoolGroups.mockReturnValue(
      schoolsResult([], { currentData: undefined, isError: true, refetch })
    );
    renderList({ filters: { ...filters, search: 'zzz' } });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to fetch classes'
    );
    expect(
      screen.queryByRole('button', { name: 'Clear search' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the end of the list once every school page has loaded', () => {
    mockUseSchoolGroups.mockReturnValue(
      schoolsResult([
        { schoolId: 'sch-1', schoolName: 'Hillcrest', classCount: 3 },
      ])
    );
    renderList();
    expect(screen.getByText('All schools are shown.')).toBeInTheDocument();
  });

  it('shows a retry, and stops auto-loading, when a later school page fails', () => {
    const fetchNextPage = vi.fn();
    mockUseSchoolGroups.mockReturnValue(
      schoolsResult(
        [{ schoolId: 'sch-1', schoolName: 'Hillcrest', classCount: 3 }],
        {
          hasNextPage: true,
          isError: true,
          direction: 'forward',
          fetchNextPage,
        }
      )
    );
    renderList();

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load more.");
    expect(
      screen.queryByText('All schools are shown.')
    ).not.toBeInTheDocument();
    // No sentinel is observed, so a broken page isn't requested in a loop.
    act(() => observerCallback?.([{ isIntersecting: true }]));
    expect(fetchNextPage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('retries a failed refresh of the loaded schools with a refetch', () => {
    const fetchNextPage = vi.fn();
    const refetch = vi.fn();
    // A refetch (e.g. after a tag invalidation) failed; the cached pages stay.
    mockUseSchoolGroups.mockReturnValue(
      schoolsResult(
        [{ schoolId: 'sch-1', schoolName: 'Hillcrest', classCount: 3 }],
        { hasNextPage: true, isError: true, fetchNextPage, refetch }
      )
    );
    renderList();

    expect(screen.getByText('classes of Hillcrest')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to fetch classes'
    );
    act(() => observerCallback?.([{ isIntersecting: true }]));
    expect(fetchNextPage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('announces how many schools a new page added', () => {
    const page = (fetching: boolean, count: number) =>
      schoolsResult(
        Array.from({ length: count }, (_, i) => ({
          schoolId: `sch-${i}`,
          schoolName: `School ${i}`,
          classCount: 1,
        })),
        { hasNextPage: true, isFetchingNextPage: fetching }
      );
    mockUseSchoolGroups.mockReturnValue(page(true, 2));
    const { rerender } = renderList();

    mockUseSchoolGroups.mockReturnValue(page(false, 5));
    rerender(
      <SchoolAccordionList
        filters={filters}
        classById={new Map()}
        tableProps={{} as SchoolClassesTableRowProps}
        onClearSearch={vi.fn()}
        onClearFilters={vi.fn()}
      />
    );
    expect(screen.getByText('3 more schools loaded')).toBeInTheDocument();
  });

  describe('the "more loaded" announcement', () => {
    const schools = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        schoolId: `sch-${i}`,
        schoolName: `School ${i}`,
        classCount: 1,
      }));
    const rerenderList = (
      rerender: ReturnType<typeof renderList>['rerender'],
      listFilters = filters
    ) =>
      rerender(
        <SchoolAccordionList
          filters={listFilters}
          classById={new Map()}
          tableProps={{} as SchoolClassesTableRowProps}
          onClearSearch={vi.fn()}
          onClearFilters={vi.fn()}
        />
      );
    // Page 2 loads (2 → 5 schools), so "3 more schools loaded" is announced.
    const loadSecondPage = () => {
      mockUseSchoolGroups.mockReturnValue(
        schoolsResult(schools(2), {
          hasNextPage: true,
          isFetchingNextPage: true,
        })
      );
      const { rerender } = renderList();
      mockUseSchoolGroups.mockReturnValue(
        schoolsResult(schools(5), { hasNextPage: true })
      );
      rerenderList(rerender);
      expect(screen.getByText('3 more schools loaded')).toBeInTheDocument();
      return rerender;
    };

    it('is not repeated when a later page then fails', () => {
      const rerender = loadSecondPage();

      mockUseSchoolGroups.mockReturnValue(
        schoolsResult(schools(5), {
          hasNextPage: true,
          isFetchingNextPage: true,
        })
      );
      rerenderList(rerender);
      mockUseSchoolGroups.mockReturnValue(
        schoolsResult(schools(5), {
          hasNextPage: true,
          isError: true,
          direction: 'forward',
        })
      );
      rerenderList(rerender);

      expect(screen.getByRole('alert')).toHaveTextContent(
        "Couldn't load more."
      );
      expect(screen.queryByText(/more schools loaded/)).not.toBeInTheDocument();
    });

    it("drops the previous query's count when the filters change", () => {
      const rerender = loadSecondPage();

      // A cached, nonempty result for the new search keeps the footer shown.
      mockUseSchoolGroups.mockReturnValue(
        schoolsResult(schools(4), { hasNextPage: true })
      );
      rerenderList(rerender, { ...filters, search: 'school' });

      expect(screen.queryByText(/more schools loaded/)).not.toBeInTheDocument();
    });
  });

  it('observes the given scroll area and pins school bars below the header', () => {
    const root = document.createElement('div');
    const observerRoots: Array<Element | null | undefined> = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(_cb: unknown, options?: IntersectionObserverInit) {
          observerRoots.push(options?.root as Element | null | undefined);
        }
        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
      }
    );
    mockUseSchoolGroups.mockReturnValue(
      schoolsResult(
        [{ schoolId: 'sch-1', schoolName: 'Hillcrest', classCount: 3 }],
        { hasNextPage: true }
      )
    );
    renderList({ scrollRootRef: { current: root }, stickyBarTop: 72 });

    expect(observerRoots).toContain(root);
    expect(
      screen.getByRole('heading', { name: 'School: Hillcrest (3)' })
    ).toHaveStyle({ top: '72px' });
  });

  it('shows a loading message on first load', () => {
    mockUseSchoolGroups.mockReturnValue({
      ...schoolsResult([]),
      currentData: undefined,
      isFetching: true,
    });
    renderList();
    expect(screen.getByRole('status')).toHaveTextContent('Loading schools…');
  });

  it("shows the loader, not the previous filters' schools, while new filters load", () => {
    mockUseSchoolGroups.mockReturnValue({
      ...schoolsResult([]),
      // RTK Query keeps the last result in `data`; it isn't for these filters.
      data: schoolsResult([
        { schoolId: 'sch-9', schoolName: 'Old school', classCount: 1 },
      ]).currentData,
      currentData: undefined,
      isFetching: true,
    });
    renderList();
    expect(screen.getByRole('status')).toHaveTextContent('Loading schools…');
    expect(screen.queryByText(/Old school/)).not.toBeInTheDocument();
  });

  it('holds the request while paused (filters settling)', () => {
    mockUseSchoolGroups.mockReturnValue(schoolsResult([]));
    renderList({ paused: true });

    expect(typeof mockUseSchoolGroups.mock.lastCall?.[0]).toBe('symbol');
    expect(screen.getByRole('status')).toHaveTextContent('Loading schools…');
  });
});
