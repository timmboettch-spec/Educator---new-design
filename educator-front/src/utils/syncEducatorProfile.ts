import api from '../redux/api';
import config from '../redux/config';
import { updateStoredUser } from './storage';

type ProfileRecord = Record<string, unknown>;

function resolveGoogleClassroomEnabledFromProfile(
  profile: ProfileRecord
): boolean | undefined {
  if (typeof profile['google_classroom_enabled'] === 'boolean') {
    return profile['google_classroom_enabled'];
  }
  const schools = profile['schools'];
  if (!Array.isArray(schools)) {
    return undefined;
  }
  return schools.some(
    (school) =>
      typeof school === 'object' &&
      school !== null &&
      (school as ProfileRecord)['google_classroom_enabled'] === true
  );
}

/** Profile fields that can change without re-issuing a JWT. */
export function buildEducatorProfileCookieUpdates(
  profile: ProfileRecord
): ProfileRecord {
  const updates: ProfileRecord = {};
  if (Array.isArray(profile['schools'])) {
    const schools = profile['schools'] as ProfileRecord[];
    updates['schools'] = schools;
    updates['school'] = schools[0] ?? null;
  }
  const googleClassroomEnabled =
    resolveGoogleClassroomEnabledFromProfile(profile);
  if (googleClassroomEnabled !== undefined) {
    updates['google_classroom_enabled'] = googleClassroomEnabled;
  }
  if (typeof profile['status'] === 'string') {
    updates['status'] = profile['status'];
  }
  if (typeof profile['tokens'] === 'number') {
    updates['tokens'] = profile['tokens'];
  }
  if (typeof profile['full_name'] === 'string') {
    updates['full_name'] = profile['full_name'];
  }
  return updates;
}

export async function syncEducatorProfile(
  user: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const rawRole = user['role'];
  const roleName = (
    typeof rawRole === 'string'
      ? rawRole
      : ((rawRole as { role_name?: string } | null)?.role_name ?? '')
  ).toLowerCase();
  if (roleName !== 'educator') return user;

  try {
    const res = await api.get(`${config.GetEducatorAPI}/profile`, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });

    const profile = (res.data?.data ?? res.data) as
      Record<string, unknown> | undefined;
    if (!profile) return user;

    const updates = buildEducatorProfileCookieUpdates(profile);

    if (Object.keys(updates).length === 0) return user;

    updateStoredUser(updates);

    return { ...user, ...updates };
  } catch {
    return user;
  }
}
