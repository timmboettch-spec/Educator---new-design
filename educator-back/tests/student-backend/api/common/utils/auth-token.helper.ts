/**
 * Returns a deterministic bearer token string for API test Authorization headers.
 *
 * Controllers that call extractUserId() strip "Bearer " then "token-" to get the userId,
 * e.g.  `auth.replace('Bearer ', '').replace('token-', '')` → userId.
 *
 * Controller-only test modules don't register the global AuthGuard, so routes are reachable
 * without a token unless the test adds `{ provide: APP_GUARD, useClass: AuthGuard }`.
 */

export const TEST_STUDENT_ID = 'test-student-001';
export const TEST_ADMIN_ID = 'test-admin-001';

export function studentToken(userId: string = TEST_STUDENT_ID): string {
  return `token-${userId}`;
}

export function adminToken(adminId: string = TEST_ADMIN_ID): string {
  return `token-${adminId}`;
}
