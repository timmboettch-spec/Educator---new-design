export enum UserTokenPurpose {
    FORGOT_PASSWORD = 'forgot_password',
    EDUCATOR_INVITE = 'educator_invite',
}


export enum RoleSlug {
    EDUCATOR = 'educator',
    DISTRICT_ADMIN = 'district_admin',
    SCENARIO_ADMIN = 'scenario_admin',
    STUDENT = 'student',
}

/**
 * The `type` claim on a multi-role (v2) JWT — the role a token grants access as. Each
 * `RoleSlug` maps to exactly one member here via `mapRoleSlugToUserTokenType`
 * (`src/common/utils/user-token-type.util.ts`); `ADMIN` is district admin only, and
 * `SCENARIO_ADMIN` is its own distinct token type.
 */
export enum UserTokenType {
    /** District admin. Named `admin` for backward compatibility with existing tokens. */
    ADMIN = 'admin',
    EDUCATOR = 'educator',
    STUDENT = 'student',
    SCENARIO_ADMIN = 'scenario_admin'
}

/**
 * Whether the token issued alongside a login-shaped response (`signup`/`login`/`selectRole`)
 * grants full resource access, or is a `purpose: 'login'` token that first requires
 * `POST /auth/select-role`. Sits as a sibling of `user` on `LoginResDto`, not nested inside it.
 */
export enum LoginAccessStatus {
    ACCESS_GRANTED = 'access_granted',
    REQUIRED_ROLE_SELECTION = 'required_role_selection',
}
