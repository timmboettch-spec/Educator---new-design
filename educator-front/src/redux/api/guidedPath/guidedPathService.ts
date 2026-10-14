import { ROLE, type RoleSlug } from '@/features/auth/model/roles';
import type { SetupStepKey } from './guidedPath.types';

/**
 * Roles that have a guided path. Mirrors the BE `@RequiredRoles` on
 * `/api/guided-path`; add a role here (and to the BE) to give it a guide.
 */
export const GUIDED_PATH_ROLES: readonly [RoleSlug, ...RoleSlug[]] = [
  ROLE.EDUCATOR,
  ROLE.DISTRICT_ADMIN,
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Defensively reads the visited steps out of the opaque BE state blob, keeping
 * only the role's own `keys`.
 */
export const readVisited = <K extends SetupStepKey>(
  state: Record<string, unknown> | undefined,
  keys: readonly K[]
): Partial<Record<K, boolean>> => {
  const visited = state?.visited;
  const result: Partial<Record<K, boolean>> = {};
  if (!isRecord(visited)) return result;
  keys.forEach((key) => {
    if (visited[key] === true) result[key] = true;
  });
  return result;
};

/**
 * Builds the full `state` to PUT after visiting `steps`. The BE replaces state
 * wholesale, so every other key of the current blob is carried over, and the
 * result is never empty (the BE rejects `{}`) as long as `steps` is not empty.
 */
export const buildVisitedState = <K extends SetupStepKey>(
  current: Record<string, unknown> | undefined,
  steps: readonly K[],
  keys: readonly K[]
): Record<string, unknown> => ({
  ...current,
  visited: {
    ...readVisited(current, keys),
    ...Object.fromEntries(steps.map((step) => [step, true])),
  },
});

/**
 * `completed: true` is effectively final, so it is remembered per browser to
 * skip the GET on later loads. Written only from confirmed server responses
 * (see `guidedPathApi`), never from an optimistic patch.
 */
export const completedCacheKey = (userId: string, role: RoleSlug): string =>
  `rw_edu_guide_completed_${userId}_${role}`;

export const readCompletedCache = (
  userId: string | null,
  role: RoleSlug | null
): boolean => {
  if (!userId || !role) return false;
  try {
    return window.localStorage.getItem(completedCacheKey(userId, role)) === '1';
  } catch {
    return false;
  }
};

export const writeCompletedCache = (userId: string, role: RoleSlug): void => {
  try {
    window.localStorage.setItem(completedCacheKey(userId, role), '1');
  } catch {
    /* storage unavailable — the next load simply calls the API again */
  }
};
