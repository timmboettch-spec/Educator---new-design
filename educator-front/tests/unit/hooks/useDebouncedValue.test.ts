import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDebouncedValue } from '../../../src/hooks/useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value straight away', () => {
    const { result } = renderHook(() => useDebouncedValue('a'));
    expect(result.current).toBe('a');
  });

  it('cancels earlier timers on rapid changes and only publishes the last value', () => {
    const seen: string[] = [];
    const { result, rerender } = renderHook(
      ({ value }) => {
        const debounced = useDebouncedValue(value);
        seen.push(debounced);
        return debounced;
      },
      { initialProps: { value: 'a' } }
    );

    rerender({ value: 'b' });
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: 'c' });
    act(() => vi.advanceTimersByTime(200));
    // 400ms since 'b', but only 200ms since 'c': nothing published yet.
    expect(result.current).toBe('a');

    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe('c');
    expect(seen).not.toContain('b');
  });

  it('respects a custom delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 1000),
      { initialProps: { value: 'a' } }
    );

    rerender({ value: 'b' });
    act(() => vi.advanceTimersByTime(999));
    expect(result.current).toBe('a');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('b');
  });

  it('clears the pending timer on unmount', () => {
    const { rerender, unmount } = renderHook(
      ({ value }) => useDebouncedValue(value),
      { initialProps: { value: 'a' } }
    );

    rerender({ value: 'b' });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
