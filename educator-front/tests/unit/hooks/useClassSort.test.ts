import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useClassSort } from '../../../src/hooks/useClassSort';

describe('useClassSort', () => {
  it('starts unsorted, with no BE sort params', () => {
    const { result } = renderHook(() => useClassSort());
    expect(result.current).toMatchObject({
      sortField: null,
      sortDirection: null,
      sortBy: undefined,
      sortDir: undefined,
    });
  });

  it('sorts a new column ascending and exposes it as BE params', () => {
    const { result } = renderHook(() => useClassSort());
    act(() => result.current.handleSort('class_name'));
    expect(result.current).toMatchObject({
      sortField: 'class_name',
      sortDirection: 'asc',
      sortBy: 'class_name',
      sortDir: 'asc',
    });
  });

  it('cycles the same column ascending → descending → unsorted', () => {
    const { result } = renderHook(() => useClassSort());
    act(() => result.current.handleSort('class_name'));
    act(() => result.current.handleSort('class_name'));
    expect(result.current).toMatchObject({
      sortField: 'class_name',
      sortDirection: 'desc',
      sortDir: 'desc',
    });

    act(() => result.current.handleSort('class_name'));
    expect(result.current).toMatchObject({
      sortField: null,
      sortDirection: null,
      sortBy: undefined,
      sortDir: undefined,
    });

    act(() => result.current.handleSort('class_name'));
    expect(result.current.sortDirection).toBe('asc');
  });

  it('restarts ascending when switching to another column', () => {
    const { result } = renderHook(() => useClassSort());
    act(() => result.current.handleSort('class_name'));
    act(() => result.current.handleSort('class_name'));
    act(() => result.current.handleSort('start_date'));
    expect(result.current.sortField).toBe('start_date');
    expect(result.current.sortDirection).toBe('asc');
  });

  it('omits sortBy for a column the BE cannot sort by', () => {
    const { result } = renderHook(() => useClassSort());
    act(() => result.current.handleSort('lms_class_reference'));
    expect(result.current.sortField).toBe('lms_class_reference');
    expect(result.current.sortBy).toBeUndefined();
    expect(result.current.sortDir).toBe('asc');
  });
});
