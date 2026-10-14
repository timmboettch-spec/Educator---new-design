import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../src/i18n';

const { mockSchoolOptions, mockClassOptions } = vi.hoisted(() => ({
  mockSchoolOptions: vi.fn(),
  mockClassOptions: vi.fn(),
}));

vi.mock('../../../src/redux/api/classes/classesApi', () => ({
  useGetSchoolOptionsInfiniteQuery: (arg: unknown) => mockSchoolOptions(arg),
  useGetClassOptionsInfiniteQuery: (arg: unknown) => mockClassOptions(arg),
}));

import {
  useClassFilterOptions,
  type UseClassFilterOptionsParams,
} from '../../../src/hooks/useClassFilterOptions';

const isSkipped = (arg: unknown) => typeof arg === 'symbol';

const fetchNextPage = vi.fn();
const refetch = vi.fn();

// An infinite-query result; skipped queries (symbol arg) have no data.
const infiniteResult =
  <T>(rows: T[], overrides: Record<string, unknown> = {}) =>
  (arg: unknown) => {
    const pages = isSkipped(arg) ? undefined : { pages: [{ data: rows }] };
    return {
      data: pages,
      currentData: pages,
      isFetching: false,
      isFetchingNextPage: false,
      isError: false,
      isFetchNextPageError: false,
      hasNextPage: true,
      fetchNextPage,
      refetch,
      ...overrides,
    };
  };

beforeEach(() => {
  vi.useFakeTimers();
  mockSchoolOptions.mockReset();
  mockClassOptions.mockReset();
  fetchNextPage.mockReset();
  refetch.mockReset();
  mockSchoolOptions.mockImplementation(
    infiniteResult([
      { schoolId: 'sch-1', schoolName: 'Hillcrest', classCount: 2 },
      { schoolId: null, schoolName: 'No school', classCount: 1 },
    ])
  );
  mockClassOptions.mockImplementation(
    infiniteResult([{ classId: 'c-1', className: 'Biology' }])
  );
});

afterEach(() => {
  vi.useRealTimers();
});

const renderOptions = (
  initial: UseClassFilterOptionsParams = {
    selectedSchoolIds: [],
    panelOpen: true,
  }
) =>
  renderHook(
    (props: UseClassFilterOptionsParams) => useClassFilterOptions(props),
    { initialProps: initial }
  );

describe('useClassFilterOptions', () => {
  it('requests nothing until a dropdown is opened', () => {
    const { result } = renderOptions();
    expect(isSkipped(mockSchoolOptions.mock.lastCall?.[0])).toBe(true);
    expect(isSkipped(mockClassOptions.mock.lastCall?.[0])).toBe(true);
    expect(result.current.schoolField.options).toEqual([]);
  });

  it('loads the first page of schools when the School dropdown opens', () => {
    const { result } = renderOptions();
    act(() => result.current.schoolField.onOpen?.());

    expect(mockSchoolOptions).toHaveBeenLastCalledWith({ pageSize: 20 });
    expect(isSkipped(mockClassOptions.mock.lastCall?.[0])).toBe(true);
    expect(result.current.schoolField.options).toEqual([
      { value: 'sch-1', label: 'Hillcrest' },
    ]);
  });

  it('searches schools on the server after a 300ms pause', () => {
    const { result } = renderOptions();
    act(() => result.current.schoolField.onOpen?.());
    act(() => result.current.schoolField.server?.onSearchChange('hill'));

    expect(mockSchoolOptions).toHaveBeenLastCalledWith({ pageSize: 20 });
    act(() => vi.advanceTimersByTime(300));
    expect(mockSchoolOptions).toHaveBeenLastCalledWith({
      pageSize: 20,
      schoolName: 'hill',
    });
  });

  it('lists classes of the picked schools, and refetches for a new selection only on the next open', () => {
    const { result, rerender } = renderOptions({
      selectedSchoolIds: ['sch-2', 'sch-1'],
      panelOpen: true,
    });
    act(() => result.current.classNameField.onOpen?.());
    expect(mockClassOptions).toHaveBeenLastCalledWith({
      pageSize: 20,
      schoolIds: ['sch-1', 'sch-2'],
    });
    expect(result.current.classNameField.options).toEqual([
      { value: 'c-1', label: 'Biology' },
    ]);

    rerender({ selectedSchoolIds: ['sch-3'], panelOpen: true });
    expect(isSkipped(mockClassOptions.mock.lastCall?.[0])).toBe(true);
    expect(result.current.classNameField.options).toEqual([]);

    act(() => result.current.classNameField.onOpen?.());
    expect(mockClassOptions).toHaveBeenLastCalledWith({
      pageSize: 20,
      schoolIds: ['sch-3'],
    });
  });

  it('keeps labels of loaded options after they drop out of the list', () => {
    const { result, rerender } = renderOptions();
    act(() => result.current.classNameField.onOpen?.());
    rerender({ selectedSchoolIds: ['sch-3'], panelOpen: true });

    expect(result.current.classLabels).toEqual({ 'c-1': 'Biology' });
    expect(result.current.classNameField.selectedLabels).toEqual({
      'c-1': 'Biology',
    });
  });

  it('loads the next page, and retries the page that failed', () => {
    const { result, rerender } = renderOptions();
    const rerenderOpen = () =>
      rerender({ selectedSchoolIds: [], panelOpen: true });
    act(() => result.current.schoolField.onOpen?.());
    result.current.schoolField.server?.onLoadMore();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    mockSchoolOptions.mockImplementation(
      infiniteResult([], { isError: true, isFetchNextPageError: true })
    );
    rerenderOpen();
    result.current.schoolField.server?.onRetry();
    expect(fetchNextPage).toHaveBeenCalledTimes(2);

    mockSchoolOptions.mockImplementation(infiniteResult([], { isError: true }));
    rerenderOpen();
    result.current.schoolField.server?.onRetry();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the loader only while a list has nothing to show yet', () => {
    mockSchoolOptions.mockImplementation(() => ({
      ...infiniteResult([])(''),
      currentData: undefined,
      isFetching: true,
    }));
    const { result } = renderOptions();
    expect(result.current.schoolField.loading).toBe(true);
  });

  it('offers the fixed class statuses without a request, searched on the client', () => {
    const { result } = renderOptions();
    expect(result.current.statusField.options).toEqual([
      { value: 'ACTIVE', label: 'Active' },
      { value: 'INACTIVE', label: 'Inactive' },
      { value: 'ARCHIEVED', label: 'Archived' },
    ]);
    expect(result.current.statusField.loading).toBeUndefined();
    expect(result.current.statusField.server).toBeUndefined();
  });

  it('labels statuses without loading them', () => {
    const { result } = renderOptions();
    expect(result.current.getStatusLabel('ARCHIEVED')).toBe('Archived');
    expect(result.current.getStatusLabel('NEW_ONE')).toBe('New_one');
  });

  it('clears the search terms when the panel closes', () => {
    const { result, rerender } = renderOptions();
    act(() => result.current.schoolField.onOpen?.());
    act(() => result.current.schoolField.server?.onSearchChange('hill'));
    act(() => vi.advanceTimersByTime(300));

    rerender({ selectedSchoolIds: [], panelOpen: false });
    act(() => vi.advanceTimersByTime(300));
    expect(mockSchoolOptions).toHaveBeenLastCalledWith({ pageSize: 20 });
  });
});
