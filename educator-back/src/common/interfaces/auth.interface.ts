import type { Request } from "express";
import { RoleSlug, TokenPurposeType, UserTokenType } from "../constants";

export interface TokenPayload {
  sub?: string;
  email?: string;
  role?: string;
  [key: string]: unknown;
}

export interface AuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // in seconds
  refresh_expires_in?: number; // in seconds
}


export interface LtiLaunchContext {
  simulationId?: string;
  resourceLinkId?: string;
  classId?: string;
}

export interface ICurrentUser {
  userId: string;
  email?: string;
  /**
   * The verified `purpose` claim of the token backing this request. `LOGIN` means the caller is a
   * multi-role account that has authenticated but not yet chosen a role — the global `AuthGuard` only lets
   * such a token reach routes marked `@AllowRoleSelectionToken()`.
   */
  purpose?: TokenPurposeType;
  roles?: RoleSlug[];
  adminId?: string;
  /** The linked Educator profile's own id. Present only on EDUCATOR-type v2 tokens. */
  educatorId?: string;
  type?: UserTokenType;
  /** Login code for students (e.g. "REP-PH9N"). Present only on student tokens. */
  student_id?: string | null;
  /**
   * The student's own `students.id`. Present only on student tokens, sourced from the `user_id`
   * claim. A student token's `sub` carries the login code rather than a `users.id` — students
   * have no `users` row — so this is the only place the row's UUID is exposed.
   */
  studentId?: string | null;
  /** Display name for students. Present only on student tokens. */
  student_name?: string | null;
  ltiLaunch?: LtiLaunchContext;
}



export interface JwtPayload {
  sub: string;
  type?: UserTokenType;
  purpose: TokenPurposeType;
  email: string;
  roles?: RoleSlug[];
  /** The student's `students.id`. Present only on student tokens. */
  studentId?: string | null;
  /**
   * The student's `students.id`. Student tokens carry the login code in `sub`, so this is the
   * only place the row's UUID travels. Role-specific ids for every other token type are NOT
   * claims — `JwtStrategy.validate()` derives `educatorId`/`adminId` from the account's current
   * `user_roles` row on each request, so they can't go stale agit  pull ofter a role change.
   */
  user_id?: string | null;
  student_id?: string | null;
  student_name?: string | null;
  ltiLaunch?: LtiLaunchContext;
  /** Random per-token id — the key `TokenService` blacklists on. */
  jti?: string;
  iat?: number;
  exp?: number;
}

/**
 * An Express request carrying the caller `AuthGuard` authenticated. Declared here rather than
 * relying on Passport's global `Express.Request.user` augmentation, which only exists when a
 * file in the compilation happens to import `passport`.
 */
export interface AuthenticatedRequest extends Request {
  user?: ICurrentUser;
}
