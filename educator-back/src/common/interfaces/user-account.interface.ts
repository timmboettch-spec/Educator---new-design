import { CommonStatus } from 'src/common/enums/status.enum';
import { User } from 'src/database/entities';

/** Params for UserRepository.createDistrictAdminAccount — the users + user_roles + district_admins write. */
export interface CreateDistrictAdminAccountData {
  email: string;
  password: string;
  roleId: string;
  fullName?: string;
}

/**
 * Params for UserRepository.createUserWithRole — the users + user_roles write for a plain
 * account creation (`UsersService.createUser`). Role membership lives only on `user_roles`;
 * the legacy `users.role_id` column is no longer mapped or written, so the ACTIVE `user_roles`
 * row this creates is what makes the account visible to every role-based check
 * (`login()`, `JwtStrategyV2`, `AuthGuard`).
 */
export interface CreateUserWithRoleData {
  email: string;
  password?: string;
  status?: CommonStatus;
  roleId: string;
  /**
   * The role's slug, so the write can also create the District Admin profile row when this
   * account is a district admin — `fullName` lives on `district_admins`, not on `users`.
   */
  roleSlug?: string;
  fullName?: string;
}

/** Params for UserRepository.createInvitedAccount — the users + user_roles write. */
export interface CreateInvitedAccountData {
  email: string;
  roleId: string;
  roleStatus: CommonStatus;
}

/**
 * Result of UserRepository.createInvitedAccount — includes the created user_roles row's id so
 * the caller can link a profile (Educator/Student/DistrictAdmin) to that specific role
 * assignment via its `userRoleId` column.
 */
export interface CreateInvitedAccountResult {
  user: User;
  userRoleId: string;
}

/** Params for UserRepository.resetPassword — the users password update + user_tokens delete. */
export interface ResetPasswordData {
  userId: string;
  hashedPassword: string;
  userTokenId: string;
}
