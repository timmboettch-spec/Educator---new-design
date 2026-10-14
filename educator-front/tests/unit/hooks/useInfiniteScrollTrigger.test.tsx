import { useRef } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInfiniteScrollTrigger } from '../../../src/hooks/useInfiniteScrollTrigger';

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

let observerCallback: ObserverCallback | null = null;
let observerInit: { root?: Element | null; rootMargin?: string } | undefined;
const observe = vi.fn();
const disconnect = vi.fn();

beforeEach(() => {
  observerCallback = null;
  observe.mockClear();
  disconnect.mockClear();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(
        callback: ObserverCallback,
        init?: { root?: Element | null; rootMargin?: string }
      ) {
        observerCallback = callback;
        observerInit = init;
      }
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Sentinel({
  onLoadMore,
  enabled,
}: {
  onLoadMore: () => void;
  enabled: boolean;
}) {
  const ref = useInfiniteScrollTrigger({ onLoadMore, enabled });
  return <div ref={ref} data-testid="sentinel" />;
}

describe('useInfiniteScrollTrigger', () => {
  it('calls onLoadMore when the sentinel scrolls into view', () => {
    const onLoadMore = vi.fn();
    render(<Sentinel onLoadMore={onLoadMore} enabled />);
    expect(observe).toHaveBeenCalledTimes(1);

    act(() => observerCallback?.([{ isIntersecting: true }]));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('ignores entries that are not intersecting', () => {
    const onLoadMore = vi.fn();
    render(<Sentinel onLoadMore={onLoadMore} enabled />);
    act(() => observerCallback?.([{ isIntersecting: false }]));
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('does not observe while disabled, and disconnects when disabled later', () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <Sentinel onLoadMore={onLoadMore} enabled={false} />
    );
    expect(observe).not.toHaveBeenCalled();

    rerender(<Sentinel onLoadMore={onLoadMore} enabled />);
    expect(observe).toHaveBeenCalledTimes(1);

    rerender(<Sentinel onLoadMore={onLoadMore} enabled={false} />);
    expect(disconnect).toHaveBeenCalled();
  });

  it('observes inside a scroll container when rootRef is given', () => {
    function ListSentinel() {
      const listRef = useRef<HTMLDivElement>(null);
      const ref = useInfiniteScrollTrigger({
        onLoadMore: vi.fn(),
        enabled: true,
        rootRef: listRef,
        rootMargin: '40px',
      });
      return (
        <div ref={listRef} data-testid="list">
          <div ref={ref} />
        </div>
      );
    }
    const { getByTestId } = render(<ListSentinel />);
    expect(observerInit?.root).toBe(getByTestId('list'));
    expect(observerInit?.rootMargin).toBe('40px');
  });
});
