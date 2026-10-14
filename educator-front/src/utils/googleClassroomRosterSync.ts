import type { AppDispatch } from '../store';
import {
  isGoogleClassroomEnabledForStoredUser,
  resolveEducatorGcSchoolOptions,
} from './googleClassroomAccess';
import { getParsedUser } from './storage';
import {
  fetchGoogleClassroomConnection,
  fetchGoogleClassroomCourses,
  syncGoogleClassroomRoster,
  type GoogleClassroomCourse,
  type GoogleConnectionStatus,
} from '../redux/lms/GoogleClassroomRedux';

const MAX_CONCURRENT_SYNC = 3;

let inFlightGoogleResync: Promise<number> | null = null;

/** @internal Resets module state between unit tests. */
export function resetGoogleClassroomRosterSyncStateForTests(): void {
  inFlightGoogleResync = null;
}

function resolveGcEnabledSchoolIds(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }
  const user = getParsedUser();
  if (!user) {
    return [];
  }
  return resolveEducatorGcSchoolOptions(user, null).map((school) => school.id);
}

function isGoogleClassroomEnabledForUser(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  return isGoogleClassroomEnabledForStoredUser(getParsedUser());
}

async function syncLinkedMappingsForSchool(
  dispatch: AppDispatch,
  schoolId: string
): Promise<number> {
  let connection: GoogleConnectionStatus;
  try {
    connection = await dispatch(
      fetchGoogleClassroomConnection({ schoolId })
    ).unwrap();
  } catch {
    return 0;
  }

  if (!connection.connected || connection.status !== 'active') {
    return 0;
  }

  let courses: GoogleClassroomCourse[];
  try {
    courses = await dispatch(
      fetchGoogleClassroomCourses({ schoolId })
    ).unwrap();
  } catch {
    return 0;
  }

  const mappingIds = courses
    .filter((course) => course.linked && Boolean(course.mappingId?.trim()))
    .map((course) => String(course.mappingId).trim());

  if (mappingIds.length === 0) {
    return 0;
  }

  let synced = 0;
  for (let i = 0; i < mappingIds.length; i += MAX_CONCURRENT_SYNC) {
    const batch = mappingIds.slice(i, i + MAX_CONCURRENT_SYNC);
    const results = await Promise.allSettled(
      batch.map((mappingId) =>
        dispatch(syncGoogleClassroomRoster({ schoolId, mappingId })).unwrap()
      )
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        synced += 1;
        continue;
      }
      // Log so silent background sync failures are visible in console.
      const reason =
        typeof result.reason === 'string'
          ? result.reason
          : result.reason instanceof Error
            ? result.reason.message
            : String(result.reason ?? 'unknown sync failure');
      // eslint-disable-next-line no-console -- intentional diagnostics for background roster sync
      console.warn(
        `[GoogleClassroomRosterSync] roster sync failed school=${schoolId}: ${reason}`
      );
    }
  }
  return synced;
}

/**
 * Silently re-syncs Google Classroom rosters for all linked course mappings
 * across the educator's schools. Safe on dashboard/classes refresh.
 * Manual Sync Roster on /google-classroom is unchanged and may still toast.
 */
export function resyncGoogleClassroomRostersIfConfigured(
  dispatch: AppDispatch
): Promise<number> {
  if (!isGoogleClassroomEnabledForUser()) {
    return Promise.resolve(0);
  }

  const schoolIds = resolveGcEnabledSchoolIds();
  if (schoolIds.length === 0) {
    return Promise.resolve(0);
  }

  if (inFlightGoogleResync) {
    return inFlightGoogleResync;
  }

  const resyncPromise = (async (): Promise<number> => {
    let total = 0;
    for (const schoolId of schoolIds) {
      total += await syncLinkedMappingsForSchool(dispatch, schoolId);
    }
    return total;
  })().catch(() => 0);

  inFlightGoogleResync = resyncPromise.finally(() => {
    inFlightGoogleResync = null;
  });

  return inFlightGoogleResync;
}
