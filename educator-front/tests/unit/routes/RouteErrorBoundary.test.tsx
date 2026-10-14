import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Outlet,
  RouterProvider,
  createMemoryRouter,
  createRoutesFromElements,
} from 'react-router-dom';
import '../../../src/i18n';
import { RouteErrorBoundary } from '../../../src/routes/RouteErrorBoundary';
import { renderRoutes } from '../../../src/routes/renderRoutes';

let shouldThrow = true;

const Boom = () => {
  if (shouldThrow) {
    throw new Error('page exploded');
  }
  return <p>recovered</p>;
};

describe('RouteErrorBoundary', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    shouldThrow = true;
    // React logs the caught error itself; silencing keeps the suite output readable.
    consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('renders its children when nothing goes wrong', () => {
    shouldThrow = false;
    render(
      <RouteErrorBoundary>
        <p>the page</p>
      </RouteErrorBoundary>
    );
    expect(screen.getByText('the page')).toBeInTheDocument();
  });

  it('shows a scoped error instead of blanking the shell', () => {
    render(
      <RouteErrorBoundary>
        <Boom />
      </RouteErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText(/something went wrong on this page/i)
    ).toBeInTheDocument();
  });

  it('tells the user the rest of the app still works', () => {
    render(
      <RouteErrorBoundary>
        <Boom />
      </RouteErrorBoundary>
    );
    expect(
      screen.getByText(/rest of the app is still working/i)
    ).toBeInTheDocument();
  });

  it('recovers when the user retries', async () => {
    const user = userEvent.setup();
    render(
      <RouteErrorBoundary>
        <Boom />
      </RouteErrorBoundary>
    );

    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText('recovered')).toBeInTheDocument();
  });

  it('resets when the route changes, so one crash does not poison the next page', () => {
    const { rerender } = render(
      <RouteErrorBoundary resetKey="/schools">
        <Boom />
      </RouteErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    shouldThrow = false;
    rerender(
      <RouteErrorBoundary resetKey="/educators">
        <Boom />
      </RouteErrorBoundary>
    );

    expect(screen.getByText('recovered')).toBeInTheDocument();
  });

  it('keeps showing the error while the route is unchanged', () => {
    const { rerender } = render(
      <RouteErrorBoundary resetKey="/schools">
        <Boom />
      </RouteErrorBoundary>
    );

    shouldThrow = false;
    rerender(
      <RouteErrorBoundary resetKey="/schools">
        <Boom />
      </RouteErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders a caller-supplied fallback instead of the default', () => {
    render(
      <RouteErrorBoundary fallback={<p>custom fallback</p>}>
        <Boom />
      </RouteErrorBoundary>
    );
    expect(screen.getByText('custom fallback')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not throw while handling an error when reportError is unavailable', () => {
    const original = globalThis.reportError;
    // @ts-expect-error — deliberately removing a browser global for this case
    delete globalThis.reportError;

    expect(() =>
      render(
        <RouteErrorBoundary>
          <Boom />
        </RouteErrorBoundary>
      )
    ).not.toThrow();

    globalThis.reportError = original;
  });

  describe('as wired by renderRoutes', () => {
    const renderAt = (
      tree: Parameters<typeof renderRoutes>[0],
      initialPath: string
    ) => {
      const router = createMemoryRouter(
        createRoutesFromElements(renderRoutes(tree)),
        { initialEntries: [initialPath] }
      );
      render(<RouterProvider router={router} />);
      return router;
    };

    it('resets a pathless layout boundary on navigation', async () => {
      const Shell = () => {
        if (shouldThrow) throw new Error('chrome exploded');
        return <Outlet />;
      };
      const router = renderAt(
        [
          {
            component: Shell,
            children: [
              { path: '/a', component: () => <p>page a</p> },
              { path: '/b', component: () => <p>page b</p> },
            ],
          },
        ],
        '/a'
      );
      expect(screen.getByRole('alert')).toBeInTheDocument();

      shouldThrow = false;
      await act(() => router.navigate('/b'));

      expect(screen.getByText('page b')).toBeInTheDocument();
    });

    it('resets between two ids of the same parameterised route', async () => {
      const router = renderAt(
        [{ path: '/report/:id', component: Boom }],
        '/report/1'
      );
      expect(screen.getByRole('alert')).toBeInTheDocument();

      shouldThrow = false;
      await act(() => router.navigate('/report/2'));

      expect(screen.getByText('recovered')).toBeInTheDocument();
    });
  });
});
