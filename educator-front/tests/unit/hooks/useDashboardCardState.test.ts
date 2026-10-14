import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboardCardState } from '@/hooks/useDashboardCardState';

let mockUser: Record<string, unknown> | null = { id: 'educator-1' };

vi.mock('@/utils/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/storage')>()),
  getParsedUser: () => mockUser,
}));

describe('useDashboardCardState', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUser = { id: 'educator-1' };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts from the default', () => {
    const { result } = renderHook(() => useDashboardCardState('alerts', true));
    expect(result.current[0]).toBe(true);
  });

  it('remembers the state for the same person after a remount', () => {
    const first = renderHook(() => useDashboardCardState('alerts', true));
    act(() => first.result.current[1]((open) => !open));
    expect(first.result.current[0]).toBe(false);
    first.unmount();

    const second = renderHook(() => useDashboardCardState('alerts', true));
    expect(second.result.current[0]).toBe(false);
    // Other cards are unaffected.
    const chart = renderHook(() => useDashboardCardState('chart', true));
    expect(chart.result.current[0]).toBe(true);
  });

  it('keeps each person separate', () => {
    const mine = renderHook(() => useDashboardCardState('products', false));
    act(() => mine.result.current[1](true));
    mine.unmount();

    mockUser = { id: 'educator-2' };
    const theirs = renderHook(() => useDashboardCardState('products', false));
    expect(theirs.result.current[0]).toBe(false);
  });

  it('falls back to the default when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const { result } = renderHook(() =>
      useDashboardCardState('notifications', false)
    );
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
  });

  it('does not persist without a signed-in user', () => {
    mockUser = null;
    const first = renderHook(() => useDashboardCardState('schools', true));
    act(() => first.result.current[1](false));
    first.unmount();

    const second = renderHook(() => useDashboardCardState('schools', true));
    expect(second.result.current[0]).toBe(true);
    expect(localStorage.length).toBe(0);
  });
});
