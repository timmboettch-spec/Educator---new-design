export type RoleSlug =
  | 'educator'
  | 'district_admin'
  | 'scenario_admin'
  | 'scenario_designer'
  | 'student';

export type AccessStatus = 'access_granted' | 'required_role_selection';

export interface DistrictAdminProfile {
  districtAdminId?: string;
  userRoleId?: string;
  fullName?: string | null;
  profilePicture?: string | null;
  phoneNumber?: string | null;
  isLicenseActive?: boolean;
  subscriptions?: unknown[];
}

export interface EducatorSchool {
  id: string;
  schoolName?: string;
  lmsEnabled?: boolean;
  googleClassroomEnabled?: boolean;
}

export interface EducatorProfile {
  id?: string;
  email?: string | null;
  fullName?: string | null;
  profilePicture?: string | null;
  status?: string;
  phoneNumber?: string | null;
  lmsEnabled?: boolean;
  schools?: EducatorSchool[];
}

export interface StudentProfile {
  id?: string;
  studentCode?: string;
  status?: string;
  classId?: string;
}

/**
 * Seat usage for the active role, computed by the backend (`calculateAiSeats`).
 * Present only for `educator` and `district_admin`, and never while a role is
 * still to be picked.
 */
export interface AiSeats {
  total: number;
  consumed: number;
  available: number;
  /** Educators only; always null for a district admin. */
  invalidatedAt: string | null;
}

export interface AuthUserRole {
  id: string;
  name: string;
  slug: RoleSlug;
  districtAdmin?: DistrictAdminProfile | null;
  educator?: EducatorProfile | null;
  student?: StudentProfile | null;
  /** Only on `data.activeRole`, not on `userRoles[]` entries. */
  aiSeats?: AiSeats | null;
}

const EMPTY_AI_SEATS: AiSeats = {
  total: 0,
  consumed: 0,
  available: 0,
  invalidatedAt: null,
};

const asAiSeats = (value: unknown): AiSeats | null => {
  const raw = value && typeof value === 'object' ? (value as AiSeats) : null;
  if (!raw) return null;
  return {
    total: Number(raw.total) || 0,
    consumed: Number(raw.consumed) || 0,
    available: Number(raw.available) || 0,
    invalidatedAt: raw.invalidatedAt ?? null,
  };
};

/**
 * Educator record id of the stored user, for educator-scoped endpoints. Falls
 * back to `id` for pre-migration sessions, where the two were the same value.
 */
export const getEducatorId = (
  storedUser: Record<string, unknown> | null | undefined
): string | null => {
  const educatorId = storedUser?.['educator_id'] ?? storedUser?.['id'];
  return typeof educatorId === 'string' && educatorId ? educatorId : null;
};

/** Seat usage of the signed-in role, as stored by `normalizeAuthUser`. */
export const getAiSeats = (
  storedUser: Record<string, unknown> | null | undefined
): AiSeats => asAiSeats(storedUser?.['ai_seats']) ?? EMPTY_AI_SEATS;

/** Roles the Educator app can actually route into a dashboard. */
export const SUPPORTED_ROLE_SLUGS: readonly RoleSlug[] = [
  'educator',
  'district_admin',
];

export const isSupportedRoleSlug = (slug: string | undefined): boolean =>
  !!slug && SUPPORTED_ROLE_SLUGS.includes(slug as RoleSlug);

/**
 * Minimal role entry persisted on the stored user, so an authenticated
 * multi-role session can offer a role switch without the full `userRoles[]`.
 */
export type StoredRole = Pick<AuthUserRole, 'id' | 'name' | 'slug'>;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;

export const getUserRoles = (raw: unknown): AuthUserRole[] => {
  const user = asRecord(raw);
  const roles = user?.['userRoles'];
  return Array.isArray(roles) ? (roles as AuthUserRole[]) : [];
};

export const findRoleById = (
  raw: unknown,
  roleId: string
): AuthUserRole | null =>
  getUserRoles(raw).find((role) => role?.id === roleId) ?? null;

/**
 * The role the session is acting as. Prefers the response's own `activeRole`,
 * which is the only reliable source after `select-role` — that response still
 * lists every role in `userRoles[]`, so the first entry is not necessarily the
 * one that was chosen.
 */
export const getActiveRole = (
  raw: unknown,
  activeRole?: unknown
): AuthUserRole | null => {
  const explicit = asRecord(activeRole);
  if (explicit) {
    // Login sends `activeRole` as just `{ id, name, slug }`; the profile
    // (`districtAdmin` / `educator`) lives on the matching `userRoles[]` entry.
    // Merge so whichever of the two carries the profile supplies it.
    const id = explicit['id'];
    const slug = explicit['slug'];
    const fullRole =
      (typeof id === 'string' ? findRoleById(raw, id) : null) ??
      (typeof slug === 'string'
        ? (getUserRoles(raw).find((role) => role?.slug === slug) ?? null)
        : null);
    // Per field, so an explicit `districtAdmin: null` / `educator: null` on
    // `activeRole` can't erase the profile found on the `userRoles[]` entry.
    return {
      ...fullRole,
      ...explicit,
      districtAdmin: explicit['districtAdmin'] ?? fullRole?.districtAdmin,
      educator: explicit['educator'] ?? fullRole?.educator,
      student: explicit['student'] ?? fullRole?.student,
    } as unknown as AuthUserRole;
  }
  return getUserRoles(raw)[0] ?? null;
};

/**
 * Maps an auth `data.user` onto the flat user shape the rest of the app reads
 * (`role`, `full_name`, `is_license_active`, ...), so the `userRoles[]` reshape
 * stays contained to the auth layer. Falls back to the pre-migration snake_case
 * fields, since the backend still serves the old shape too.
 */
export const normalizeAuthUser = (
  raw: unknown,
  activeRoleOverride?: unknown
): Record<string, unknown> | null => {
  const user = asRecord(raw);
  if (!user) return null;

  const activeRole = getActiveRole(user, activeRoleOverride);
  const districtAdmin = asRecord(activeRole?.districtAdmin);
  const educator = asRecord(activeRole?.educator);

  const normalized: Record<string, unknown> = { ...user };

  const id = user['userId'] ?? user['id'];
  if (id !== undefined) {
    normalized['id'] = id;
  }

  const fullName =
    educator?.['fullName'] ?? districtAdmin?.['fullName'] ?? user['full_name'];
  if (fullName !== undefined) {
    normalized['full_name'] = fullName;
  }

  // Role display name, not slug: existing consumers compare against 'Educator'
  // and 'District Admin' exactly (e.g. src/utils/applyUserData.ts).
  if (activeRole?.name) {
    normalized['role'] = activeRole.name;
  }

  // Each role carries its own picture; `profilePictureUrl` is the name used by
  // the update endpoint's payload. A null from the profile is kept, so
  // removing a photo clears the stored one.
  const pictureKeys = ['profilePicture', 'profilePictureUrl'] as const;
  const pictureProfile = [educator, districtAdmin].find(
    (profile) => profile && pictureKeys.some((key) => key in profile)
  );
  const profilePicture = pictureProfile
    ? (pictureProfile['profilePicture'] ??
      pictureProfile['profilePictureUrl'] ??
      null)
    : user['profile_picture'];
  if (profilePicture !== undefined) {
    normalized['profile_picture'] = profilePicture;
  }

  const isLicenseActive =
    districtAdmin?.['isLicenseActive'] ??
    user['is_license_active'] ??
    user['isLicenseActive'];
  if (isLicenseActive !== undefined) {
    normalized['is_license_active'] = isLicenseActive;
  }

  const subscriptions =
    districtAdmin?.['subscriptions'] ?? user['subscriptions'];
  if (subscriptions !== undefined) {
    normalized['subscriptions'] = subscriptions;
  }

  const phoneNumber =
    educator?.['phoneNumber'] ??
    districtAdmin?.['phoneNumber'] ??
    user['phone_number'];
  if (phoneNumber !== undefined) {
    normalized['phone_number'] = phoneNumber;
  }

  const lmsEnabled = educator?.['lmsEnabled'] ?? user['lms_enabled'];
  if (lmsEnabled !== undefined) {
    normalized['lms_enabled'] = lmsEnabled;
  }

  // The educator record id differs from the account `id` (`userId`), and is
  // what educator-scoped endpoints such as simulation-reports expect.
  const educatorId = educator?.['id'];
  if (typeof educatorId === 'string' && educatorId) {
    normalized['educator_id'] = educatorId;
  }

  // The educator's schools now live on the role profile in camelCase; the app
  // (e.g. GoogleClassroomPanel, class page) reads top-level snake_case
  // `schools` / `school`, and can't resolve a school id without them.
  const rawSchools = educator?.['schools'];
  if (Array.isArray(rawSchools)) {
    const schools = rawSchools
      .map(asRecord)
      .filter((school): school is Record<string, unknown> => !!school?.['id'])
      .map((school) =>
        Object.fromEntries(
          Object.entries({
            id: school['id'],
            school_name: school['schoolName'] ?? school['school_name'],
            lms_enabled: school['lmsEnabled'] ?? school['lms_enabled'],
            google_classroom_enabled:
              school['googleClassroomEnabled'] ??
              school['google_classroom_enabled'],
          }).filter(([, value]) => value !== undefined)
        )
      );
    normalized['schools'] = schools;
    normalized['google_classroom_enabled'] = schools.some(
      (school) => school['google_classroom_enabled'] === true
    );
    // Primary school is listed first; always sync `school` from that list.
    normalized['school'] = schools[0] ?? null;
  }

  // Seat usage arrives pre-computed on activeRole; the raw `subscriptions` /
  // `tokens` fields are no longer added up on the client.
  const aiSeats = asAiSeats(activeRole?.aiSeats);
  if (aiSeats) {
    normalized['ai_seats'] = aiSeats;
  }

  // The canonical machine-readable role. `role` above stays the *display* name
  // because existing screens compare against 'Educator' / 'District Admin'
  // literally; access control reads this instead. Written unconditionally —
  // unlike `available_roles` below it does not depend on `userRoles[]` being
  // present, which is what makes it the reliable first link of the lookup.
  if (activeRole?.slug) {
    normalized['active_role_slug'] = activeRole.slug;
  }

  const availableRoles: StoredRole[] = getUserRoles(user)
    .filter((role) => isSupportedRoleSlug(role?.slug))
    .map(({ id, name, slug }) => ({ id, name, slug }));
  if (availableRoles.length > 0) {
    normalized['available_roles'] = availableRoles;
    normalized['active_role_id'] = activeRole?.id;
  }

  return normalized;
};

/**
 * The role a signed-in user can switch to via `select-role`, read from the
 * stored user written by `normalizeAuthUser`. Null for single-role accounts.
 */
export const getSwitchTargetRole = (
  storedUser: Record<string, unknown> | null
): StoredRole | null => {
  const roles = storedUser?.['available_roles'];
  if (!Array.isArray(roles)) return null;
  const activeRoleId = storedUser?.['active_role_id'];
  return (
    (roles as StoredRole[]).find(
      (role) => role?.id && role.id !== activeRoleId
    ) ?? null
  );
};
