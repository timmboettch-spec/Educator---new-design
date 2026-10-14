import { renderHook } from '@testing-library/react';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseGetClassesQuery } = vi.hoisted(() => ({
  mockUseGetClassesQuery: vi.fn(),
}));

vi.mock('../../../src/redux/api/classes/classesApi', () => ({
  useGetClassesQuery: mockUseGetClassesQuery,
}));

import { useClassResultCount } from '../../../src/hooks/useClassResultCount';
import {
  buildFilteredClassCountArg,
  type ClassListFilters,
} from '../../../src/redux/api/classes/classesService';

const filters: ClassListFilters = {
  schoolIds: [],
  classIds: [],
  statuses: ['ACTIVE'],
  search: 'bio',
};

describe('useClassResultCount', () => {
  beforeEach(() => {
    mockUseGetClassesQuery.mockReset();
    mockUseGetClassesQuery.mockReturnValue({ currentData: undefined });
  });

  it('requests the one-row count for the list query, without needing a measure', () => {
    mockUseGetClassesQuery.mockReturnValue({
      currentData: { data: [], meta: { total: 12 } },
    });
    const { result } = renderHook(() => useClassResultCount(filters, true));

    expect(mockUseGetClassesQuery).toHaveBeenCalledWith(
      buildFilteredClassCountArg(filters)
    );
    expect(result.current).toBe(12);
  });

  it('skips the request while disabled', () => {
    const { result } = renderHook(() => useClassResultCount(filters, false));
    expect(mockUseGetClassesQuery).toHaveBeenCalledWith(skipToken);
    expect(result.current).toBeUndefined();
  });

  it('is undefined while the count loads or after it fails', () => {
    mockUseGetClassesQuery.mockReturnValue({
      currentData: undefined,
      isError: true,
    });
    const { result } = renderHook(() => useClassResultCount(filters, true));
    expect(result.current).toBeUndefined();
  });
});
