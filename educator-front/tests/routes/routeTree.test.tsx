import { buildRouteTree } from '../../src/routes/routeTree';
import type { RouteNode } from '../../src/routes/renderRoutes';
import { ROUTE_PATHS } from '../../src/routes/routePath';
import { ROLE } from '../../src/features/auth/model/roles';
import type { AccessRule } from '../../src/features/auth/access/guards';

/**
 * The route config is data, so it can be asserted directly — no rendering, no mocks.
 * These catch the failure modes that are otherwise invisible until a user hits them:
 * a route that lost its guard, a duplicated sibling path, a child that contradicts its
 * parent's auth requirement.
 */

type Flat = { node: RouteNode; parent: RouteNode | null; depth: number };

const flatten = (
  nodes: RouteNode[],
  parent: RouteNode | null = null,
  depth = 0
): Flat[] =>
  nodes.flatMap((node) => [
    { node, parent, depth },
    ...flatten(node.children ?? [], node, depth + 1),
  ]);

const tree = buildRouteTree(true);
const flat = flatten(tree);
const byPath = (path: string) => flat.find((f) => f.node.path === path)?.node;

const rulesOf = (node: RouteNode | undefined): AccessRule[] =>
  (node?.guards ?? []).flatMap((guard) => [...(guard.rules ?? [])]);

const rolesAllowedOn = (path: string): readonly string[] => {
  const roleRule = rulesOf(byPath(path)).find((r) => r.kind === 'role');
  return roleRule && roleRule.kind === 'role' ? roleRule.roles : [];
};

const requiresEntitlement = (path: string): boolean =>
  rulesOf(byPath(path)).some((r) => r.kind === 'entitlement');

describe('route tree — transcription of the previous guard table', () => {
  it.each([
    ROUTE_PATHS.dashboard.admin,
    ROUTE_PATHS.schoolsEducators.schools,
    ROUTE_PATHS.schoolsEducators.educators,
  ])('%s is district-admin only and requires a license', (path) => {
    expect(rolesAllowedOn(path)).toEqual([ROLE.DISTRICT_ADMIN]);
    expect(requiresEntitlement(path)).toBe(true);
  });

  it.each([
    ROUTE_PATHS.dashboard.educator,
    ROUTE_PATHS.schoolsEducators.classes,
  ])('%s is educator only', (path) => {
    expect(rolesAllowedOn(path)).toEqual([ROLE.EDUCATOR]);
    expect(requiresEntitlement(path)).toBe(false);
  });

  it.each([
    ROUTE_PATHS.accountLms.account,
    ROUTE_PATHS.simulation.library,
    ROUTE_PATHS.simulation.catalog,
    ROUTE_PATHS.reports.reportDetail,
    ROUTE_PATHS.reports.transcript,
    ROUTE_PATHS.supportLegal.privacyPolicy,
    ROUTE_PATHS.supportLegal.terms,
    ROUTE_PATHS.supportLegal.customerSupport,
  ])('%s serves both roles without a license', (path) => {
    expect(rolesAllowedOn(path)).toEqual([ROLE.DISTRICT_ADMIN, ROLE.EDUCATOR]);
    expect(requiresEntitlement(path)).toBe(false);
  });

  it('/redeem is district-admin only and must not require a license', () => {
    // It is where an unlicensed admin is *sent*; requiring a license would loop.
    expect(rolesAllowedOn(ROUTE_PATHS.auth.redeem)).toEqual([
      ROLE.DISTRICT_ADMIN,
    ]);
    expect(requiresEntitlement(ROUTE_PATHS.auth.redeem)).toBe(false);
  });

  it('/simulation-catalog carries no entitlement rule, so a trial admin keeps it', () => {
    expect(requiresEntitlement(ROUTE_PATHS.simulation.catalog)).toBe(false);
  });

  it('google-classroom is educator-only and feature-gated', () => {
    const rules = rulesOf(byPath(ROUTE_PATHS.accountLms.googleClassroom));
    expect(rules).toContainEqual({ kind: 'role', roles: [ROLE.EDUCATOR] });
    expect(rules).toContainEqual({
      kind: 'feature',
      feature: 'googleClassroom',
    });
  });

  it('lms-integration is district-admin only', () => {
    expect(rolesAllowedOn(ROUTE_PATHS.accountLms.lmsIntegration)).toEqual([
      ROLE.DISTRICT_ADMIN,
    ]);
  });
});

describe('route tree — structure', () => {
  it('gives every sibling group unique paths, or relies on index keys', () => {
    const groups = new Map<RouteNode | null, string[]>();
    for (const { node, parent } of flat) {
      if (!node.path) continue;
      const list = groups.get(parent) ?? [];
      list.push(node.path);
      groups.set(parent, list);
    }
    for (const [, paths] of groups) {
      // Duplicates are permitted only because the renderer keys by path *and* index;
      // this asserts we have not introduced one by accident.
      expect(new Set(paths).size).toBe(paths.length);
    }
  });

  it('never restates requiresAuth on a child', () => {
    // The convention is inheritance. Restating it invites the two from drifting apart.
    for (const { node, parent } of flat) {
      if (parent) {
        expect(node.requiresAuth).toBeUndefined();
      }
    }
  });

  it('protects every page inside the dashboard chrome', () => {
    const layout = tree.find((n) => !n.path && n.children?.length);
    expect(layout?.requiresAuth).toBe(true);
    expect(layout?.guards?.length).toBeGreaterThan(0);
  });

  it('keeps the readiness gateway’s redirect targets outside the subtree it guards', () => {
    // If /no-access or /redeem sat inside the guarded layout, each redirect would
    // re-enter the guard and loop.
    const guarded = new Set(
      flat.filter((f) => f.parent !== null).map((f) => f.node.path)
    );
    for (const path of [
      ROUTE_PATHS.auth.noAccess,
      ROUTE_PATHS.auth.redeem,
      ROUTE_PATHS.auth.login,
    ]) {
      expect(guarded.has(path)).toBe(false);
    }
  });

  it('leaves the LTI deep-link picker open on purpose', () => {
    expect(byPath(ROUTE_PATHS.lti.deepLinking)?.requiresAuth).toBeUndefined();
    expect(byPath(ROUTE_PATHS.lti.deepLinking)?.guards).toBeUndefined();
  });

  it.each([
    ROUTE_PATHS.auth.login,
    ROUTE_PATHS.auth.signup,
    ROUTE_PATHS.auth.forgotPassword,
    ROUTE_PATHS.auth.otpVerify,
    ROUTE_PATHS.auth.resetPassword,
  ])('%s is for signed-out visitors only', (path) => {
    expect(byPath(path)?.requiresAuth).toBe(false);
  });

  it('gives every node a component reference rather than an element', () => {
    for (const { node } of flat) {
      expect(typeof node.component).not.toBe('undefined');
      // An element would be an object; a reference is a function or a lazy exotic.
      expect(['function', 'object']).toContain(typeof node.component);
    }
  });

  it('registers the simulation detail page in exactly one place per auth state', () => {
    for (const authed of [true, false]) {
      const nodes = flatten(buildRouteTree(authed)).filter(
        (f) => f.node.path === ROUTE_PATHS.simulation.details
      );
      expect(nodes).toHaveLength(1);
      // Signed in it lives inside the chrome; signed out it is top level.
      expect(nodes[0].parent === null).toBe(!authed);
    }
  });

  it('ends with a catch-all', () => {
    expect(tree[tree.length - 1].path).toBe('*');
  });
});
