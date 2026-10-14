import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasResolutionDeadlinePassed,
  resetResolutionDeadline,
  restartResolutionDeadline,
  subscribeResolutionDeadline,
} from '../../../../src/features/auth/model/sessionResolution';

describe('sessionResolution', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetResolutionDeadline();
  });

  afterEach(() => {
    resetResolutionDeadline();
    vi.useRealTimers();
  });

  it('has not passed before anything subscribes', () => {
    expect(hasResolutionDeadlinePassed()).toBe(false);
  });

  it('passes 8s after the first subscribe, and notifies listeners', () => {
    const listener = vi.fn();
    subscribeResolutionDeadline(listener);

    vi.advanceTimersByTime(7999);
    expect(hasResolutionDeadlinePassed()).toBe(false);
    expect(listener).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(hasResolutionDeadlinePassed()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not start a second timer for a second subscriber', () => {
    subscribeResolutionDeadline(vi.fn());
    subscribeResolutionDeadline(vi.fn());
    // If a second timer had started, this would still be pending at 8s from the
    // second subscribe; both must have fired off the same original timer.
    vi.advanceTimersByTime(8000);
    expect(hasResolutionDeadlinePassed()).toBe(true);
  });

  // Regression: without a way to re-arm the clock, `elapsed` is a one-shot flag for
  // the tab's entire lifetime — see the comment on `restartResolutionDeadline` for
  // why that let a guard treat a session as resolved mid-handoff.
  describe('restartResolutionDeadline', () => {
    it('re-arms a fresh 8s window', () => {
      subscribeResolutionDeadline(vi.fn());
      vi.advanceTimersByTime(8000);
      expect(hasResolutionDeadlinePassed()).toBe(true);

      restartResolutionDeadline();
      expect(hasResolutionDeadlinePassed()).toBe(false);

      vi.advanceTimersByTime(7999);
      expect(hasResolutionDeadlinePassed()).toBe(false);
      vi.advanceTimersByTime(1);
      expect(hasResolutionDeadlinePassed()).toBe(true);
    });

    it('notifies listeners only when the flag actually flips back to false', () => {
      const listener = vi.fn();
      subscribeResolutionDeadline(listener);
      vi.advanceTimersByTime(8000);
      listener.mockClear();

      restartResolutionDeadline();
      expect(listener).toHaveBeenCalledTimes(1);

      // Restarting again before it re-elapses is a no-op for listeners — nothing
      // observable changed.
      restartResolutionDeadline();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('clears a still-pending timer rather than leaving two running', () => {
      subscribeResolutionDeadline(vi.fn());
      vi.advanceTimersByTime(3000);

      restartResolutionDeadline();
      // The original timer would have fired at 8000ms from the first subscribe
      // (5000ms from here) had it not been cleared; it must not still be able to.
      vi.advanceTimersByTime(5000);
      expect(hasResolutionDeadlinePassed()).toBe(false);

      vi.advanceTimersByTime(3000);
      expect(hasResolutionDeadlinePassed()).toBe(true);
    });
  });
});
