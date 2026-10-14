import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import { useInfiniteScrollTrigger } from '../../hooks/useInfiniteScrollTrigger';
import { useLoadedMoreCount } from '../../hooks/useLoadedMoreCount';

const retryButtonClassName =
  'px-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1';

export interface LoadErrorMessageProps {
  message: string;
  onRetry: () => void;
}

/** A failed request's message with a Retry action. */
export function LoadErrorMessage({ message, onRetry }: LoadErrorMessageProps) {
  const { t } = useTranslation('classManagement');
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
      <p role="alert" className="text-sm text-gray-500">
        {message}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={retryButtonClassName}
        onClick={onRetry}
      >
        {t('table.retry')}
      </Button>
    </div>
  );
}

export interface InfiniteListFooterProps {
  /** Items loaded so far, to announce how many a new page added. */
  itemCount: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  /**
   * Any request for this list is in flight (e.g. a refresh). Loading more waits
   * for it: RTK Query skips a next page during a refresh, and re-arming once it
   * ends picks up a sentinel that is already in view.
   */
  isFetching?: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => void;
  /** A refresh of the loaded pages failed (e.g. after a tag invalidation). */
  isRefreshError: boolean;
  refetch: () => void;
  /** Shown once every page has loaded. */
  endMessage: string;
  /** Screen-reader message after a page loads, e.g. "3 more classes loaded". */
  loadedMoreMessage: (count: number) => string;
  /** The element the list scrolls in; the viewport by default. */
  scrollRootRef?: RefObject<Element | null>;
  /** False when the list shows its own next-page loader (e.g. a skeleton row). */
  shouldShowLoadingMessage?: boolean;
}

/**
 * The end of an infinitely scrolled list: loads the next page as it scrolls
 * into view, and shows loading, a retry when a page or a refresh fails, or
 * the end of the list. A failed request isn't retried automatically, so a
 * broken request doesn't loop. Remount it (`key`) when the list's query
 * changes, so counts from the previous query aren't announced.
 */
export function InfiniteListFooter({
  itemCount,
  hasNextPage,
  isFetchingNextPage,
  isFetching = false,
  isFetchNextPageError,
  fetchNextPage,
  isRefreshError,
  refetch,
  endMessage,
  loadedMoreMessage,
  scrollRootRef,
  shouldShowLoadingMessage = true,
}: InfiniteListFooterProps) {
  const { t } = useTranslation('classManagement');
  const loadedMore = useLoadedMoreCount(itemCount, isFetchingNextPage);
  const hasError = isFetchNextPageError || isRefreshError;
  const sentinelRef = useInfiniteScrollTrigger({
    onLoadMore: fetchNextPage,
    enabled: hasNextPage && !isFetching && !isFetchingNextPage && !hasError,
    rootRef: scrollRootRef,
  });

  return (
    <>
      {/* Silent while a failure shows, so it isn't announced as a success. */}
      <p role="status" className="sr-only">
        {!isFetchingNextPage && !hasError && loadedMore !== null
          ? loadedMoreMessage(loadedMore)
          : ''}
      </p>
      {isFetchingNextPage ? (
        shouldShowLoadingMessage && (
          <p
            role="status"
            className="px-4 py-3 text-center text-sm text-gray-500"
          >
            {t('table.loadingMore')}
          </p>
        )
      ) : isFetchNextPageError ? (
        <LoadErrorMessage
          message={t('table.loadMoreFailed')}
          onRetry={fetchNextPage}
        />
      ) : isRefreshError ? (
        <LoadErrorMessage message={t('toast.fetchError')} onRetry={refetch} />
      ) : (
        !hasNextPage && (
          <p className="px-4 py-3 text-center text-xs text-gray-500">
            {endMessage}
          </p>
        )
      )}
      {hasNextPage && !hasError && (
        <div ref={sentinelRef} aria-hidden="true" className="h-px" />
      )}
    </>
  );
}
