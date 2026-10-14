/**
 * The `purpose` claim signed into every JWT this app issues (root-app only — student-backend
 * has its own, separate token flow). One shared enum so every strategy/service that signs or
 * verifies a `purpose` claim compares against the same values, instead of each repeating its
 * own string literal.
 */
export enum TokenPurposeType {
  /** Full-access token — grants normal resource access for the account's selected role. */
  ACCESS = 'access',
  /**
   * Short-lived, role-selection-only token issued by `AuthService.login()` when the account has
   * more than one active role — bridges the gap until `POST /auth/select-role` exchanges it for
   * an `ACCESS` token.
   */
  LOGIN = 'login',
}
