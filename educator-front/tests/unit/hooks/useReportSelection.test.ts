import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useReportSelection } from '../../../src/hooks/useReportSelection';

describe('useReportSelection', () => {
  it('starts empty, then toggles single rows with a partial state', () => {
    const { result } = renderHook(() => useReportSelection(['r1', 'r2', 'r3']));
    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.isPartial).toBe(false);

    act(() => result.current.toggle('r2'));
    expect(result.current.selectedIds).toEqual(['r2']);
    expect(result.current.isSelected('r2')).toBe(true);
    expect(result.current.isPartial).toBe(true);
    expect(result.current.isAllSelected).toBe(false);

    act(() => result.current.toggle('r2'));
    expect(result.current.selectedIds).toEqual([]);
  });

  it('select-all selects every row, then clears when all are selected', () => {
    const { result } = renderHook(() => useReportSelection(['r1', 'r2']));

    act(() => result.current.toggleAll());
    expect(result.current.isAllSelected).toBe(true);
    expect(result.current.isPartial).toBe(false);

    act(() => result.current.toggleAll());
    expect(result.current.selectedIds).toEqual([]);
  });

  it('select-all from a partial selection selects everything', () => {
    const { result } = renderHook(() => useReportSelection(['r1', 'r2']));
    act(() => result.current.toggle('r1'));
    act(() => result.current.toggleAll());
    expect(result.current.isAllSelected).toBe(true);
  });

  it('keeps the selection by id across a re-sort and drops ids that leave the table', () => {
    const { result, rerender } = renderHook(
      ({ ids }) => useReportSelection(ids),
      { initialProps: { ids: ['r1', 'r2', 'r3'] } }
    );
    act(() => result.current.toggle('r1'));
    act(() => result.current.toggle('r3'));

    rerender({ ids: ['r3', 'r2', 'r1'] });
    expect(result.current.selectedIds.sort()).toEqual(['r1', 'r3']);

    rerender({ ids: ['r2', 'r3'] });
    expect(result.current.selectedIds).toEqual(['r3']);
  });

  it('clear empties the selection', () => {
    const { result } = renderHook(() => useReportSelection(['r1']));
    act(() => result.current.toggleAll());
    act(() => result.current.clear());
    expect(result.current.selectedIds).toEqual([]);
  });

  it('an empty table is never "all selected"', () => {
    const { result } = renderHook(() => useReportSelection([]));
    expect(result.current.isAllSelected).toBe(false);
  });

  it('keepOffscreen keeps other pages selected; select-all covers the rows shown', () => {
    const { result, rerender } = renderHook(
      ({ ids }) => useReportSelection(ids, { keepOffscreen: true }),
      { initialProps: { ids: ['r1', 'r2'] } }
    );
    act(() => result.current.toggle('r1'));

    rerender({ ids: ['r3', 'r4'] });
    expect(result.current.selectedIds).toEqual(['r1']);
    expect(result.current.isPartial).toBe(false);
    expect(result.current.isSelected('r1')).toBe(true);

    act(() => result.current.toggleAll());
    expect(result.current.selectedIds.sort()).toEqual(['r1', 'r3', 'r4']);
    expect(result.current.isAllSelected).toBe(true);

    act(() => result.current.toggleAll());
    expect(result.current.selectedIds).toEqual(['r1']);
  });
});
