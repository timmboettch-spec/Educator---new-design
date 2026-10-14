import { navItemsFor, type NavContext } from '../../src/routes/navFromRoutes';
import { buildRouteTree } from '../../src/routes/routeTree';
import type { RouteNode } from '../../src/routes/renderRoutes';
import { ROLE } from '../../src/features/auth/model/roles';
import { ROUTE_PATHS } from '../../src/routes/routePath';

const tree = buildRouteTree(true);

const ctx = (o: Partial<NavContext> = {}): NavContext => ({
  role: ROLE.DISTRICT_ADMIN,
  isLicenseActive: true,
  skippedRedeem: false,
  isAuthenticated: true,
  isResolved: true,
  googleClassroomEnabled: true,
  ...o,
});

const pathsFor = (c: NavContext) => navItemsFor(tree, c).map((i) => i.path);

const LICENSED_ADMIN = ctx();
const TRIAL_ADMIN = ctx({ isLicenseActive: false, skippedRedeem: true });
const EDUCATOR = ctx({ role: ROLE.EDUCATOR, isLicenseActive: false });

describe('navigation derived from the route tree', () => {
  it('reproduces the licensed District Admin menu, in order', () => {
    expect(pathsFor(LICENSED_ADMIN)).toEqual([
      ROUTE_PATHS.dashboard.admin,
      ROUTE_PATHS.schoolsEducators.schools,
      ROUTE_PATHS.schoolsEducators.educators,
      ROUTE_PATHS.accountLms.lmsIntegration,
      ROUTE_PATHS.accountLms.account,
    ]);
  });

  it('reproduces the Educator menu, in order', () => {
    expect(pathsFor(EDUCATOR)).toEqual([
      ROUTE_PATHS.dashboard.educator,
      ROUTE_PATHS.schoolsEducators.classes,
      ROUTE_PATHS.simulation.library,
      ROUTE_PATHS.simulation.catalog,
      ROUTE_PATHS.accountLms.googleClassroom,
      ROUTE_PATHS.accountLms.account,
    ]);
  });

  it('gives a licensed educator the same menu, catalogue included', () => {
    // Licensing narrows admin menus only; a stray `is_license_active: true` on an
    // educator session used to drop the Simulation Catalog link.
    expect(pathsFor({ ...EDUCATOR, isLicenseActive: true })).toEqual(
      pathsFor(EDUCATOR)
    );
  });

  it('reproduces the trial menu, which is not a role but an account state', () => {
    // An unlicensed admin who chose "start trial". Previously a third hardcoded array.
    expect(pathsFor(TRIAL_ADMIN)).toEqual([
      ROUTE_PATHS.simulation.catalog,
      ROUTE_PATHS.accountLms.account,
    ]);
  });

  it('drops Google Classroom when the feature is off for that account', () => {
    const withoutGc = pathsFor(
      ctx({
        role: ROLE.EDUCATOR,
        isLicenseActive: false,
        googleClassroomEnabled: false,
      })
    );
    expect(withoutGc).not.toContain(ROUTE_PATHS.accountLms.googleClassroom);
    // and nothing else changes
    expect(withoutGc).toContain(ROUTE_PATHS.dashboard.educator);
    expect(withoutGc).toContain(ROUTE_PATHS.accountLms.account);
  });

  it('shows nothing until the session has resolved', () => {
    // Otherwise the sidebar flashes one role's menu before settling on another's.
    expect(pathsFor(ctx({ isResolved: false }))).toEqual([]);
  });

  it('shows nothing to a signed-out visitor', () => {
    expect(pathsFor(ctx({ isAuthenticated: false, role: null }))).toEqual([]);
  });

  it('shows nothing to an account holding no serveable role', () => {
    expect(pathsFor(ctx({ role: null }))).toEqual([]);
  });

  it('carries a label key and an icon for every entry', () => {
    for (const item of navItemsFor(tree, EDUCATOR)) {
      expect(item.labelKey).toBeTruthy();
      expect(item.icon).toBeTruthy();
    }
  });
});

describe('navigation cannot drift from access', () => {
  const personas = [
    ['licensed admin', LICENSED_ADMIN],
    ['trial admin', TRIAL_ADMIN],
    ['educator', EDUCATOR],
  ] as const;

  const collect = (nodes: RouteNode[]): RouteNode[] =>
    nodes.flatMap((n) => [n, ...collect(n.children ?? [])]);

  const navigable = collect(tree).filter((n) => n.nav && n.path);

  it('offers every navigable route to at least one persona', () => {
    // Catches an entry whose narrowing contradicts its route guards and can therefore
    // never appear for anyone.
    for (const node of navigable) {
      const seenBy = personas.filter(([, c]) =>
        pathsFor(c).includes(node.path as string)
      );
      expect(
        seenBy.length,
        `${node.path} is navigable but shown to nobody`
      ).toBeGreaterThan(0);
    }
  });

  it.each(personas)(
    'never shows %s a link to a route it would be bounced from',
    (_name, c) => {
      // The derivation applies the route's own guard rules, so a visible link is by
      // construction reachable. This asserts the narrowing never *widens* access.
      for (const path of pathsFor(c)) {
        const node = navigable.find((n) => n.path === path);
        const rules = (node?.guards ?? []).flatMap((g) => [...(g.rules ?? [])]);
        for (const rule of rules) {
          if (rule.kind === 'role') {
            expect(c.role).not.toBeNull();
            expect(rule.roles).toContain(c.role);
          }
          if (rule.kind === 'entitlement') {
            expect(c.isLicenseActive).toBe(true);
          }
          if (rule.kind === 'feature') {
            expect(c.googleClassroomEnabled).toBe(true);
          }
        }
      }
    }
  );

  it('keeps every menu free of duplicates', () => {
    for (const [, c] of personas) {
      const paths = pathsFor(c);
      expect(new Set(paths).size).toBe(paths.length);
    }
  });
});
