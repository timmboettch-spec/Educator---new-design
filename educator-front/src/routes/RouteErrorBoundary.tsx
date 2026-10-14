import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The default fallback, as its own function component. A class component's render
 * cannot call a hook directly, so `useTranslation()` lives here rather than inline
 * in `RouteErrorBoundary.render()`.
 */
function DefaultFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation('system');

  return (
    <div
      role="alert"
      className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <h2 className="text-lg font-semibold">{t('routeError.title')}</h2>
      <p className="max-w-md text-sm text-gray-600">{t('routeError.body')}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
      >
        {t('routeError.retry')}
      </button>
    </div>
  );
}

type Props = {
  children: ReactNode;
  /** Distinguishes one boundary's state from another's when the route changes. */
  resetKey?: string;
  fallback?: ReactNode;
};

type State = { error: Error | null };

/**
 * Per-route crash isolation.
 *
 * There is no error boundary anywhere else in this app, so until now a render error in
 * any page blanked the entire shell — sidebar, header and all — leaving no way out but
 * a manual reload.
 *
 * Placement matters as much as existence. This sits **inside** the guard stack, so a
 * guard's redirect still works when the page beneath it is broken: the user is moved
 * somewhere safe rather than being shown an error for a page they were not allowed to
 * open anyway. It also resets when the route changes, so navigating away from a broken
 * page is enough to recover — without it, one crash would poison every subsequent
 * route that reused the boundary.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // No logger is wired up in this app yet. Reported through the browser's own error
    // channel so the stack is not swallowed entirely; swap for the real reporter when
    // one exists.
    // `reportError` is a browser global and is absent in some test environments, so
    // it is checked rather than assumed — a boundary that throws while handling an
    // error is worse than no boundary at all.
    if (typeof reportError === 'function') {
      reportError(
        new Error(
          `Route render failed: ${error.message}\n${info.componentStack ?? ''}`,
          { cause: error }
        )
      );
    }
  }

  render(): ReactNode {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (!error) {
      return children;
    }

    if (fallback) {
      return fallback;
    }

    return <DefaultFallback onRetry={() => this.setState({ error: null })} />;
  }
}

export default RouteErrorBoundary;
