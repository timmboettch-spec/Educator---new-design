import { getSmokeAgent } from './smoke-client';
import { smokeState } from './smoke-state';
import { ENDPOINTS } from '../common/constants/endpoints';
import { del } from '../common/utils/api.helper';

/**
 * smoke-cleanup.ts
 * Deletes entities created during the smoke suite in reverse-dependency order:
 *   student → class → educator → school
 *
 * Call `runSmokeCleanup()` in a global afterAll or in a dedicated cleanup spec.
 */
export async function runSmokeCleanup(): Promise<void> {
  const agent = getSmokeAgent();
  const token = smokeState.accessToken;

  if (!token) {
    console.warn('[SmokeCleanup] No token available — skipping cleanup.');
    return;
  }

  // Delete student
  if (smokeState.studentId) {
    try {
      await del(agent, ENDPOINTS.STUDENTS.BY_ID(smokeState.studentId), token);
      console.log(`[SmokeCleanup] Deleted student ${smokeState.studentId}`);
    } catch {
      console.warn(`[SmokeCleanup] Failed to delete student ${smokeState.studentId}`);
    }
  }

  // Delete class
  if (smokeState.classId) {
    try {
      await del(agent, ENDPOINTS.CLASSES.BY_ID(smokeState.classId), token);
      console.log(`[SmokeCleanup] Deleted class ${smokeState.classId}`);
    } catch {
      console.warn(`[SmokeCleanup] Failed to delete class ${smokeState.classId}`);
    }
  }

  // Delete educator
  if (smokeState.educatorId) {
    try {
      await del(agent, ENDPOINTS.EDUCATORS.BY_ID(smokeState.educatorId), token);
      console.log(`[SmokeCleanup] Deleted educator ${smokeState.educatorId}`);
    } catch {
      console.warn(`[SmokeCleanup] Failed to delete educator ${smokeState.educatorId}`);
    }
  }

  // Delete school
  if (smokeState.schoolId) {
    try {
      await del(agent, ENDPOINTS.SCHOOLS.BY_ID(smokeState.schoolId), token);
      console.log(`[SmokeCleanup] Deleted school ${smokeState.schoolId}`);
    } catch {
      console.warn(`[SmokeCleanup] Failed to delete school ${smokeState.schoolId}`);
    }
  }

  console.log('[SmokeCleanup] Cleanup complete.');
}
