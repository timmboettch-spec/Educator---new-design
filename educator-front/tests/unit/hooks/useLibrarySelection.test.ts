import { act, renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useLibrarySelection } from '../../../src/hooks/useLibrarySelection';

const setup = (initial: string[]) =>
  renderHook(({ visible }) => useLibrarySelection(visible), {
    initialProps: { visible: initial },
  });

describe('useLibrarySelection', () => {
  it('starts empty', () => {
    const { result } = setup(['a', 'b']);
    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.allSelected).toBe(false);
    expect(result.current.someSelected).toBe(false);
  });

  it('toggles items on and off', () => {
    const { result } = setup(['a', 'b']);
    act(() => result.current.toggle('a'));
    expect(result.current.isSelected('a')).toBe(true);
    expect(result.current.someSelected).toBe(true);
    act(() => result.current.toggle('a'));
    expect(result.current.isSelected('a')).toBe(false);
  });

  it('selects all visible items and clears', () => {
    const { result } = setup(['a', 'b']);
    act(() => result.current.selectAll());
    expect(result.current.selectedIds).toEqual(['a', 'b']);
    expect(result.current.allSelected).toBe(true);
    expect(result.current.someSelected).toBe(false);
    act(() => result.current.clear());
    expect(result.current.selectedIds).toEqual([]);
  });

  it('drops selected items that are no longer visible', () => {
    const { result, rerender } = setup(['a', 'b', 'c']);
    act(() => {
      result.current.toggle('a');
      result.current.toggle('c');
    });
    rerender({ visible: ['b', 'c'] });
    expect(result.current.selectedIds).toEqual(['c']);
  });

  it('is never "all selected" when nothing is visible', () => {
    const { result } = setup([]);
    act(() => result.current.selectAll());
    expect(result.current.allSelected).toBe(false);
  });

  it('keeps an initial selection until the list is loaded, then prunes it', () => {
    const { result, rerender } = renderHook(
      ({ visible, isLoaded }) =>
        useLibrarySelection(visible, { initialSelected: ['a', 'z'], isLoaded }),
      { initialProps: { visible: [] as string[], isLoaded: false } }
    );
    expect(result.current.selectedIds).toEqual(['a', 'z']);

    rerender({ visible: ['a', 'b'], isLoaded: true });
    expect(result.current.selectedIds).toEqual(['a']);
  });
});
