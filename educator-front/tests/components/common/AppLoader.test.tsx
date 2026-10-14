import { act, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AppLoader from '../../../src/components/common/AppLoader';

vi.mock('/assets/RealityworksAI_logo.svg', () => ({ default: 'logo.svg' }));

describe('AppLoader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows an accessible loading status while loading', () => {
    render(<AppLoader loading />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('hides after MIN_DURATION once loading becomes false and calls onHidden', () => {
    const onHidden = vi.fn();
    const { rerender } = render(<AppLoader loading onHidden={onHidden} />);

    act(() => {
      rerender(<AppLoader loading={false} onHidden={onHidden} />);
    });

    expect(onHidden).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onHidden).toHaveBeenCalledTimes(1);
  });
});
