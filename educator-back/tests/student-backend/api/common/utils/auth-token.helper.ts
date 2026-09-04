/**
 * Returns a deterministic bearer token string for API test Authorization headers.
 *
 * Controllers that call extractUserId() strip "Bearer " then "token-" to get the userId,
 * e.g.  `auth.replace('Bearer ', '').replace('token-', '')` → userId.
 *
 * For routes protected by JwtAuthGuard, override the guard in the test module:
 *   .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
 */

export const TEST_STUDENT_ID = 'test-student-001';
export const TEST_ADMIN_ID = 'test-admin-001';

export function studentToken(userId: string = TEST_STUDENT_ID): string {
  return `token-${userId}`;
}

export function adminToken(adminId: string = TEST_ADMIN_ID): string {
  return `token-${adminId}`;
}
