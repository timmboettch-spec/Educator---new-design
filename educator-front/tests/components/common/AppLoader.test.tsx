import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

import { screen, render, act } from '@testing-library/react';

import AppLoader from '../../../src/components/common/AppLoader';

describe('AppLoader Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('renders loader when loading is true', () => {
    render(<AppLoader loading={true} />);

    const loader = screen.getByRole('main');

    expect(loader).toBeInTheDocument();
  });

  test('applies opacity-100 when loading is true', () => {
    render(<AppLoader loading={true} />);

    const container = document.querySelector('.fixed.inset-0.z-50');

    expect(container).toHaveClass('opacity-100');
  });

  test('applies opacity-0 when loading is false', () => {
    render(<AppLoader loading={false} />);

    const container = document.querySelector('.fixed.inset-0.z-50');

    expect(container).toHaveClass('opacity-0');
  });

  test('applies pointer-events-auto when loading is true', () => {
    render(<AppLoader loading={true} />);

    const container = document.querySelector('.fixed.inset-0.z-50');

    expect(container).toHaveClass('pointer-events-auto');
  });

  test('applies pointer-events-none when loading is false', () => {
    render(<AppLoader loading={false} />);

    const container = document.querySelector('.fixed.inset-0.z-50');

    expect(container).toHaveClass('pointer-events-none');
  });

  test('renders logo image', () => {
    render(<AppLoader loading={true} />);

    const logo = screen.getByAltText('Brand Logo');

    expect(logo).toBeInTheDocument();
  });

  test('renders three blinking dots', () => {
    render(<AppLoader loading={true} />);

    const dots = document.querySelectorAll('.dot');

    expect(dots.length).toBe(3);
  });

  test('renders fixed positioning overlay', () => {
    render(<AppLoader loading={true} />);

    const container = document.querySelector('.fixed.inset-0.z-50');

    expect(container).toHaveClass('fixed', 'inset-0', 'z-50');
  });

  test('centers content vertically and horizontally', () => {
    render(<AppLoader loading={true} />);

    const container = document.querySelector('.fixed.inset-0.z-50');

    expect(container).toHaveClass('flex', 'items-center', 'justify-center');
  });

  test('applies transition-opacity class', () => {
    render(<AppLoader loading={true} />);

    const container = document.querySelector('.fixed.inset-0.z-50');

    expect(container).toHaveClass('transition-opacity');
  });

  test('renders rotating ring SVG', () => {
    render(<AppLoader loading={true} />);

    const svgs = document.querySelectorAll('svg');

    expect(svgs.length).toBeGreaterThan(0);
  });

  test('renders gradient definition in SVG', () => {
    render(<AppLoader loading={true} />);

    const gradient = document.querySelector('#orange-gradient');

    expect(gradient).toBeInTheDocument();
  });

  test('defaults to loading true when prop not provided', () => {
    render(<AppLoader />);

    const container = document.querySelector('.fixed.inset-0.z-50');

    expect(container).toHaveClass('opacity-100');
  });

  test('toggles visibility on loading prop change', async () => {
    vi.useFakeTimers();

    const { rerender } = render(<AppLoader loading={true} />);

    let container = document.querySelector('.fixed.inset-0.z-50');

    expect(container).toHaveClass('opacity-100');

    rerender(<AppLoader loading={false} />);

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    container = document.querySelector('.fixed.inset-0.z-50');

    expect(container).toHaveClass('opacity-0');
  });
});
