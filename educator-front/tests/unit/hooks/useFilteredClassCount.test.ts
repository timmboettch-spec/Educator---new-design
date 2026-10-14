import { renderHook } from '@testing-library/react';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../src/i18n';

const { mockUseGetClassesQuery, mockToastError } = vi.hoisted(() => ({
  mockUseGetClassesQuery: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('../../../src/redux/api/classes/classesApi', () => ({
  useGetClassesQuery: mockUseGetClassesQuery,
}));
vi.mock('../../../src/components/common/Toast', () => ({
  toast: { error: mockToastError },
}));

import { useFilteredClassCount } from '../../../src/hooks/useFilteredClassCount';
import {
  buildFilteredClassCountArg,
  type ClassListFilters,
} from '../../../src/redux/api/classes/classesService';
import { ClassAttentionMeasure } from '../../../src/redux/api/classes/classes.types';

const filters: ClassListFilters = {
  schoolIds: ['s-1'],
  classIds: [],
  statuses: [],
  search: 'bio',
  measure: ClassAttentionMeasure.NO_STUDENTS,
};

describe('useFilteredClassCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseGetClassesQuery.mockReturnValue({
      currentData: undefined,
      isError: false,
    });
  });

  it('requests the one-row count for the active filters', () => {
    mockUseGetClassesQuery.mockReturnValue({
      currentData: { data: [], meta: { total: 7 } },
      isError: false,
    });
    const { result } = renderHook(() => useFilteredClassCount(filters, true));

    expect(mockUseGetClassesQuery).toHaveBeenCalledWith(
      buildFilteredClassCountArg(filters)
    );
    expect(result.current).toBe(7);
  });

  it.each([
    ['disabled', filters, false],
    ['no measure is active', { ...filters, measure: undefined }, true],
  ])('skips the request when %s', (_case, activeFilters, enabled) => {
    const { result } = renderHook(() =>
      useFilteredClassCount(activeFilters, enabled)
    );
    expect(mockUseGetClassesQuery).toHaveBeenCalledWith(skipToken);
    expect(result.current).toBeUndefined();
  });

  it('is undefined while the count loads', () => {
    const { result } = renderHook(() => useFilteredClassCount(filters, true));
    expect(result.current).toBeUndefined();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('shows a friendly toast when the count request fails', () => {
    mockUseGetClassesQuery.mockReturnValue({
      currentData: undefined,
      isError: true,
    });
    const { result } = renderHook(() => useFilteredClassCount(filters, true));

    expect(result.current).toBeUndefined();
    expect(mockToastError).toHaveBeenCalledWith(
      "We couldn't load those classes. Please try again."
    );
  });
});
