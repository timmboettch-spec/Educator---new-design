/**
 * The role catalogue — the single place a role string is written.
 *
 * Slugs mirror the backend `role.slug` column exactly (see `role.seeder.ts` in
 * `Educator-App-Backend`), so drift between what the frontend checks and what the
 * backend stores is structurally impossible.
 *
 * `ROLE_LABEL` is typed `Record<RoleSlug, string>`, so adding a slug here fails to
 * compile until it is also labelled — and, by extension, until its routes are declared.
 */

export const ROLE = {
  DISTRICT_ADMIN: 'district_admin',
  EDUCATOR: 'educator',
} as const;

export type RoleSlug = (typeof ROLE)[keyof typeof ROLE];

/** Display labels. For humans only — never compared against. */
export const ROLE_LABEL: Record<RoleSlug, string> = {
  district_admin: 'District Admin',
  educator: 'Educator',
};

/**
 * Roles the backend stores but this portal does not serve. Listed so that a reader
 * knows they were considered and rejected, not overlooked; `coerceRole` resolves them
 * to `null` so the app can say "this account cannot access the Educator portal"
 * instead of rendering an empty shell.
 */
export const FOREIGN_ROLE_SLUGS = [
  'student',
  'scenario_admin',
  'scenario_designer',
] as const;

const ROLE_SLUGS: readonly string[] = Object.values(ROLE);

export const isRoleSlug = (value: unknown): value is RoleSlug =>
  typeof value === 'string' && ROLE_SLUGS.includes(value);

/**
 * Every spelling of a role that reaches the frontend, mapped to its canonical slug.
 *
 * `admin` is not a typo: the backend's JWT `type` claim carries `'admin'` for a
 * district admin, for backwards compatibility with pre-v2 tokens, while the same role
 * appears as `district_admin` in `userRoles[].slug`. Both must resolve identically.
 */
const ROLE_ALIASES: Readonly<Record<string, RoleSlug>> = {
  admin: ROLE.DISTRICT_ADMIN,
  district_admin: ROLE.DISTRICT_ADMIN,
  educator: ROLE.EDUCATOR,
};

/**
 * Note there are no entries here for the display names `'District Admin'` and
 * `'Educator'`, which is what `normalizeAuthUser` writes into `user.role` and what
 * every pre-migration cookie and LTI exchange payload carries. They resolve because
 * `canonicalise` lowercases and turns the space into an underscore *before* this table
 * is consulted, mapping them onto the two slug keys above. That is load-bearing rather
 * than incidental, so `roles.test.ts` pins every observed spelling.
 */

/** Keys a role may hide behind when it arrives as an object rather than a string. */
const ROLE_OBJECT_KEYS = ['slug', 'role_name', 'name'] as const;

/** `'District Admin'`, `'district-admin'` and `'DISTRICT_ADMIN'` all canonicalise alike. */
const canonicalise = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Resolves any role representation in the codebase to a canonical slug, or `null`.
 *
 * Accepts a plain string in any of its five observed spellings, or an object carrying
 * the role under `slug`, `role_name` or `name`. Returns `null` — never a guess — for a
 * foreign role, an unrecognised string, or a missing value, so callers fail closed.
 *
 * Deliberately single-valued: a multi-role `userRoles[]` array is *not* handled here,
 * because picking one of several roles is a session decision (`accessStatus`), not a
 * parsing one. `normalizeUser` owns that.
 */
export const coerceRole = (value: unknown, depth = 0): RoleSlug | null => {
  if (typeof value === 'string') {
    return ROLE_ALIASES[canonicalise(value)] ?? null;
  }

  // Guard against a self-referencing object; two levels is more than any real payload.
  if (!isRecord(value) || depth >= 2) {
    return null;
  }

  for (const key of ROLE_OBJECT_KEYS) {
    if (key in value) {
      const resolved = coerceRole(value[key], depth + 1);
      if (resolved) {
        return resolved;
      }
    }
  }

  return null;
};
