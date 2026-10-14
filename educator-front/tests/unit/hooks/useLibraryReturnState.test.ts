import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  saveLibraryReturnState,
  useLibraryReturnState,
  type LibraryReturnState,
} from '../../../src/hooks/useLibraryReturnState';

const STATE: LibraryReturnState = {
  search: 'burn',
  selectedIds: ['a', 'b'],
  scrollTop: 320,
  focusId: 'b',
};

describe('useLibraryReturnState', () => {
  beforeEach(() => sessionStorage.clear());

  it('returns the saved state when restoring, then clears it', () => {
    saveLibraryReturnState(STATE);
    const { result } = renderHook(() => useLibraryReturnState(true));

    expect(result.current).toEqual(STATE);
    expect(sessionStorage.getItem('simulationLibrary:return')).toBeNull();
  });

  it('keeps the value it read for the lifetime of the page', () => {
    saveLibraryReturnState(STATE);
    const { result, rerender } = renderHook(() => useLibraryReturnState(true));
    rerender();

    expect(result.current).toEqual(STATE);
  });

  it('ignores and clears saved state when not returning from details', () => {
    saveLibraryReturnState(STATE);
    const { result } = renderHook(() => useLibraryReturnState(false));

    expect(result.current).toBeNull();
    expect(sessionStorage.getItem('simulationLibrary:return')).toBeNull();
  });

  it('ignores malformed saved state', () => {
    sessionStorage.setItem('simulationLibrary:return', '{"search":1}');
    const { result } = renderHook(() => useLibraryReturnState(true));

    expect(result.current).toBeNull();
  });
});
