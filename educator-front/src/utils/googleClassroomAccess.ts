import { getParsedUser, updateStoredUser } from './storage';

type StoredUser = Record<string, unknown>;

export type GoogleClassroomLocalDisableUpdates = {
  google_classroom_enabled?: boolean;
  schools?: StoredUser[];
  school?: StoredUser | null;
};

/** True unless an explicit `false` is present (missing flag = allow for older sessions). */
export function isGoogleClassroomEnabledFlag(value: unknown): boolean {
  return value !== false;
}

/** True only when the school record explicitly has GC enabled. */
export function isSchoolGoogleClassroomEnabled(school: unknown): boolean {
  return readSchoolGoogleFlag(school) === true;
}

function readSchoolGoogleFlag(school: unknown): boolean | undefined {
  if (!school || typeof school !== 'object') {
    return undefined;
  }
  const record = school as StoredUser;
  if (
    record.google_classroom_enabled === true ||
    record.googleClassroomEnabled === true
  ) {
    return true;
  }
  if (
    record.google_classroom_enabled === false ||
    record.googleClassroomEnabled === false
  ) {
    return false;
  }
  return undefined;
}

type GcSchoolOption = { id: string; school_name: string };

function toGcSchoolOption(school: StoredUser): GcSchoolOption | null {
  const id = String(school.id ?? '').trim();
  if (!id) {
    return null;
  }
  const schoolName =
    typeof school.school_name === 'string'
      ? school.school_name.trim()
      : typeof school.schoolName === 'string'
        ? school.schoolName.trim()
        : '';
  return { id, school_name: schoolName || id };
}

function mergeStoredSchools(...sources: unknown[]): StoredUser[] {
  const byId = new Map<string, StoredUser>();
  for (const source of sources) {
    if (!Array.isArray(source)) {
      continue;
    }
    for (const entry of source) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const school = entry as StoredUser;
      const id = String(school.id ?? '').trim();
      if (!id) {
        continue;
      }
      const previous = byId.get(id);
      byId.set(id, previous ? { ...previous, ...school } : school);
    }
  }
  return [...byId.values()];
}

/** GC-enabled schools for the educator school picker (Redux + cookie merged). */
export function resolveEducatorGcSchoolOptions(
  reduxUser: StoredUser | null | undefined,
  cookieUser: StoredUser | null | undefined
): GcSchoolOption[] {
  const schools = mergeStoredSchools(reduxUser?.schools, cookieUser?.schools);
  const fromList = schools
    .filter((school) => isSchoolGoogleClassroomEnabled(school))
    .map((school) => toGcSchoolOption(school))
    .filter((school): school is GcSchoolOption => school !== null);
  if (fromList.length > 0) {
    return fromList;
  }

  const primaryCandidates = [reduxUser?.school, cookieUser?.school];
  for (const primary of primaryCandidates) {
    if (
      primary &&
      typeof primary === 'object' &&
      isSchoolGoogleClassroomEnabled(primary)
    ) {
      const option = toGcSchoolOption(primary as StoredUser);
      if (option) {
        return [option];
      }
    }
  }

  return [];
}

function hasGoogleClassroomEnabledSchool(user: StoredUser): boolean {
  const schools = user.schools;
  if (!Array.isArray(schools)) {
    return false;
  }
  return schools.some((school) => readSchoolGoogleFlag(school) === true);
}

/**
 * Educator GC tab visibility: enabled when any assigned school has GC on,
 * not only the primary school.
 */
export function isGoogleClassroomEnabledForStoredUser(
  user: StoredUser | null | undefined
): boolean {
  if (!user) {
    return true;
  }

  if (hasGoogleClassroomEnabledSchool(user)) {
    return true;
  }

  if (user.google_classroom_enabled === true) {
    return true;
  }

  if (readSchoolGoogleFlag(user.school) === true) {
    return true;
  }

  if (user.google_classroom_enabled === false) {
    return false;
  }

  if (readSchoolGoogleFlag(user.school) === false) {
    return false;
  }

  return true;
}

export function isGoogleClassroomFeatureDisabledMessage(
  message: string | null | undefined
): boolean {
  if (!message) return false;
  return message.toLowerCase().includes('not enabled for this school');
}

function disableSchoolGoogleClassroom(school: StoredUser): StoredUser {
  return {
    ...school,
    google_classroom_enabled: false,
    googleClassroomEnabled: false,
  };
}

function hasAnyGoogleClassroomEnabledSchool(schools: unknown[]): boolean {
  return schools.some((school) => readSchoolGoogleFlag(school) === true);
}

/**
 * Builds cookie/Redux patches when the BE rejects GC for a school.
 * Disables only the target school when possible so multi-school educators
 * keep GC visible for other assigned schools.
 */
export function buildGoogleClassroomDisabledLocallyUpdates(
  user: StoredUser | null | undefined,
  schoolId?: string
): GoogleClassroomLocalDisableUpdates {
  const trimmedSchoolId = schoolId?.trim();
  if (!trimmedSchoolId) {
    return {};
  }

  if (user && Array.isArray(user.schools)) {
    let matched = false;
    const schools = user.schools.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return entry as StoredUser;
      }
      const school = entry as StoredUser;
      if (String(school.id) !== trimmedSchoolId) {
        return school;
      }
      matched = true;
      return disableSchoolGoogleClassroom(school);
    }) as StoredUser[];

    if (matched) {
      const updates: GoogleClassroomLocalDisableUpdates = {
        schools,
        google_classroom_enabled: hasAnyGoogleClassroomEnabledSchool(schools),
      };
      const primarySchool = user.school;
      if (
        primarySchool &&
        typeof primarySchool === 'object' &&
        String((primarySchool as StoredUser).id) === trimmedSchoolId
      ) {
        updates.school = disableSchoolGoogleClassroom(
          primarySchool as StoredUser
        );
      }
      return updates;
    }
  }

  if (trimmedSchoolId && user?.school && typeof user.school === 'object') {
    const school = user.school as StoredUser;
    if (String(school.id) === trimmedSchoolId) {
      return {
        school: disableSchoolGoogleClassroom(school),
        google_classroom_enabled: false,
      };
    }
  }

  return { google_classroom_enabled: false };
}

/** Persist GC disable into cookie user; returns the same patch for Redux. */
export function markGoogleClassroomDisabledLocally(
  schoolId?: string
): GoogleClassroomLocalDisableUpdates {
  const updates = buildGoogleClassroomDisabledLocallyUpdates(
    getParsedUser(),
    schoolId
  );
  updateStoredUser(updates);
  return updates;
}
