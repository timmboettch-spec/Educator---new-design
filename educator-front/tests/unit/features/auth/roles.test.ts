import {
  coerceRole,
  FOREIGN_ROLE_SLUGS,
  isRoleSlug,
  ROLE,
  ROLE_LABEL,
  type RoleSlug,
} from '../../../../src/features/auth/model/roles';

describe('the role catalogue', () => {
  it('exposes only the two roles this portal serves', () => {
    expect(Object.values(ROLE)).toEqual(['district_admin', 'educator']);
  });

  it('labels every slug, so a new role cannot ship unlabelled', () => {
    for (const slug of Object.values(ROLE)) {
      expect(ROLE_LABEL[slug]).toBeTruthy();
    }
    expect(Object.keys(ROLE_LABEL)).toHaveLength(Object.values(ROLE).length);
  });

  it('does not treat a label as a slug', () => {
    // Guards the rule that ROLE_LABEL is for humans and never compared against.
    expect(isRoleSlug('District Admin')).toBe(false);
    expect(isRoleSlug(ROLE.DISTRICT_ADMIN)).toBe(true);
  });

  it('keeps foreign roles out of the catalogue', () => {
    for (const slug of FOREIGN_ROLE_SLUGS) {
      expect(isRoleSlug(slug)).toBe(false);
    }
  });
});

describe('isRoleSlug', () => {
  it.each([
    ['district_admin', true],
    ['educator', true],
    ['admin', false],
    ['Educator', false],
    ['', false],
  ] as const)('%s -> %s', (value, expected) => {
    expect(isRoleSlug(value)).toBe(expected);
  });

  it.each([null, undefined, 0, {}, []])('rejects %s', (value) => {
    expect(isRoleSlug(value)).toBe(false);
  });
});

describe('coerceRole', () => {
  // Every spelling below was found in the codebase; the comment names where.
  it.each([
    ['educator', ROLE.EDUCATOR, 'AppRouter, RouteGuards, Sidebar'],
    ['Educator', ROLE.EDUCATOR, 'class/index.tsx:376, GetUserRedux.ts:39'],
    ['district_admin', ROLE.DISTRICT_ADMIN, 'backend role.slug'],
    ['District Admin', ROLE.DISTRICT_ADMIN, 'account/index.tsx:711'],
    ['district admin', ROLE.DISTRICT_ADMIN, 'lms-integration'],
    ['admin', ROLE.DISTRICT_ADMIN, 'the JWT `type` claim'],
    ['Admin', ROLE.DISTRICT_ADMIN, 'rubrics-section.tsx:935'],
  ] as const)('resolves %j to %s (seen in %s)', (input, expected, _seenIn) => {
    expect(coerceRole(input)).toBe(expected);
  });

  it.each([
    ['  EDUCATOR  ', ROLE.EDUCATOR],
    ['district-admin', ROLE.DISTRICT_ADMIN],
    ['DISTRICT_ADMIN', ROLE.DISTRICT_ADMIN],
    ['District  Admin', ROLE.DISTRICT_ADMIN],
  ] as const)(
    'normalises case, padding and separators in %j',
    (input, expected) => {
      expect(coerceRole(input)).toBe(expected);
    }
  );

  it.each([
    [{ role_name: 'Educator' }, ROLE.EDUCATOR],
    [{ slug: 'district_admin' }, ROLE.DISTRICT_ADMIN],
    [{ name: 'District Admin' }, ROLE.DISTRICT_ADMIN],
    [{ slug: 'educator', role_name: 'ignored' }, ROLE.EDUCATOR],
  ])('unwraps the object form %j', (input, expected) => {
    expect(coerceRole(input)).toBe(expected);
  });

  it('returns null for a role this portal does not serve', () => {
    for (const slug of FOREIGN_ROLE_SLUGS) {
      expect(coerceRole(slug)).toBeNull();
    }
    expect(coerceRole('Scenario Admin')).toBeNull();
    expect(coerceRole({ slug: 'student' })).toBeNull();
  });

  it.each([null, undefined, '', '   ', 'nonsense', 0, 1, [], {}, true])(
    'returns null rather than guessing for %j',
    (input) => {
      expect(coerceRole(input)).toBeNull();
    }
  );

  it('survives a self-referencing object instead of recursing forever', () => {
    const looped: Record<string, unknown> = {};
    looped.slug = looped;
    expect(coerceRole(looped)).toBeNull();
  });

  it('stops unwrapping after two levels', () => {
    expect(coerceRole({ role_name: { slug: 'educator' } })).toBe(ROLE.EDUCATOR);
    expect(coerceRole({ slug: { slug: { slug: 'educator' } } })).toBeNull();
  });
});

/**
 * Every spelling of a role that actually reaches the frontend today, pinned.
 *
 * These are not hypothetical variants: the display-name forms are what
 * `normalizeAuthUser` writes into `user.role`, and the `{ role_name }` object is
 * what the LTI exchange payload carries — that user object is stored without ever
 * being normalised, so `coerceRole` is the only thing standing between a Canvas
 * launch and the no-access screen.
 */
describe('coerceRole — the spellings that exist in the wild', () => {
  const cases: ReadonlyArray<[string, unknown, RoleSlug]> = [
    ['userRoles[].slug', 'district_admin', ROLE.DISTRICT_ADMIN],
    ['JWT type claim', 'admin', ROLE.DISTRICT_ADMIN],
    ['normalizeAuthUser display name', 'District Admin', ROLE.DISTRICT_ADMIN],
    ['lowercased display name', 'district admin', ROLE.DISTRICT_ADMIN],
    ['hyphenated', 'District-Admin', ROLE.DISTRICT_ADMIN],
    ['padded and shouted', '  DISTRICT_ADMIN  ', ROLE.DISTRICT_ADMIN],
    ['educator slug', 'educator', ROLE.EDUCATOR],
    ['educator display name', 'Educator', ROLE.EDUCATOR],
    ['legacy nested object', { role_name: 'Educator' }, ROLE.EDUCATOR],
    ['login payload object', { slug: 'district_admin' }, ROLE.DISTRICT_ADMIN],
    ['name-keyed object', { name: 'Educator' }, ROLE.EDUCATOR],
  ];

  it.each(cases)('resolves %s', (_label, input, expected) => {
    expect(coerceRole(input)).toBe(expected);
  });

  it.each([
    ['an unserved role', 'student'],
    ['a scenario admin', 'scenario_admin'],
    ['a scenario designer', 'scenario_designer'],
    ['an unknown string', 'wizard'],
    ['an empty string', ''],
    ['undefined', undefined],
    ['null', null],
    ['a number', 7],
    ['an object with no role key', { id: 'abc' }],
  ])('fails closed on %s', (_label, input) => {
    expect(coerceRole(input)).toBeNull();
  });
});
