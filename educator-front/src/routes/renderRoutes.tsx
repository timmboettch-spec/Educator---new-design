import type { ComponentType, ReactNode } from 'react';
import { Route, useLocation } from 'react-router-dom';
import {
  AuthOnly,
  GuestOnly,
  type GuardComponent,
} from '../features/auth/access/guards';
import type { NavMeta } from './navMeta';
import { RouteErrorBoundary } from './RouteErrorBoundary';

/**
 * One route node. Routes are declared as plain data and turned into `<Route>` elements
 * by the single renderer below, so the order in which access control, context and error
 * isolation wrap a page is defined in exactly one place and cannot drift per route.
 */
export type RouteNode = {
  /** Path segment, relative to the parent. Omit for a pathless layout node. */
  path?: string;

  /** React Router index-route flag. Mutually exclusive with `children`. */
  index?: boolean;

  /**
   * A component *reference*, never an element — the renderer decides when to
   * instantiate it. For a variant of a page, supply a thin wrapper component rather
   * than threading props through the config.
   */
  component: ComponentType;

  /**
   * Tri-state, deliberately:
   *   true      → signed-in visitors only
   *   false     → signed-out visitors only (login, signup, password reset)
   *   undefined → neither wrapper applied (the LTI deep-link picker, which is
   *               intentionally open, and routes that decide for themselves)
   *
   * A single `isPrivate` boolean cannot express the middle case, which is why this is
   * not one.
   *
   * Children **inherit** this from their parent and never restate it; a structural test
   * enforces that, so "is this route protected?" is answered by looking up the tree
   * rather than by trusting each node to be honest.
   */
  requiresAuth?: boolean;

  /**
   * Access-control wrappers, outermost first — the renderer folds them so that array
   * order is evaluation order. Coarsest first: role before entitlement.
   */
  guards?: GuardComponent[];

  /**
   * Non-access wrappers: context providers, data scopes. Kept apart from `guards` so
   * that "what can block this route?" is answered by reading one field.
   */
  provider?: ComponentType<{ children: ReactNode }>;

  /**
   * Presence makes this route navigable. The sidebar is derived from these rather than
   * kept as a second list, so a menu entry cannot outlive the route it points at.
   */
  nav?: NavMeta;

  /** Nested nodes, rendered into this node's `<Outlet />`. */
  children?: RouteNode[];
};

/**
 * Resets on every navigation, not on the node's path: a pathless layout node would
 * otherwise never reset, and a parameterised route would stay broken across ids.
 */
function PageErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <RouteErrorBoundary resetKey={pathname}>{children}</RouteErrorBoundary>
  );
}

/**
 * Walks the tree and composes each node from the inside out:
 *
 *   1. component            ← innermost
 *   2. error boundary       ← per-route crash isolation
 *   3. provider             ← context / data scope
 *   4. guards               ← access control
 *   5. auth wrapper         ← outermost, only when `requiresAuth` is defined
 *
 * Two consequences are worth stating, because both are easy to get wrong:
 *
 * **Guards fold with `reduceRight`,** so `guards: [A, B]` evaluates A then B. A plain
 * `reduce` would silently reverse that, which matters whenever guards have an ordering
 * dependency.
 *
 * **Authentication is outermost,** so a signed-out visitor is redirected before any
 * guard runs. Guards on a protected route may therefore assume a session and skip
 * defensive checks.
 *
 * The error boundary sits *inside* the guards on purpose: a guard's redirect still
 * works when the page beneath it has crashed, so a broken page the visitor was not
 * allowed to open sends them away rather than showing them an error.
 */
export function renderRoutes(nodes: RouteNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    const Component = node.component;

    let element: ReactNode = (
      <PageErrorBoundary>
        <Component />
      </PageErrorBoundary>
    );

    if (node.provider) {
      const Provider = node.provider;
      element = <Provider>{element}</Provider>;
    }

    if (node.guards?.length) {
      element = node.guards.reduceRight<ReactNode>(
        (inner, Guard) => <Guard>{inner}</Guard>,
        element
      );
    }

    if (node.requiresAuth === true) {
      element = <AuthOnly>{element}</AuthOnly>;
    } else if (node.requiresAuth === false) {
      element = <GuestOnly>{element}</GuestOnly>;
    }

    // Keyed by path *and* index: two siblings may legitimately share a path when they
    // carry different guards, and keying on path alone silently drops one of them.
    const key = `${node.path ?? '(layout)'}#${index}`;

    return node.children ? (
      <Route key={key} path={node.path} element={element}>
        {renderRoutes(node.children)}
      </Route>
    ) : (
      <Route key={key} path={node.path} index={node.index} element={element} />
    );
  });
}
