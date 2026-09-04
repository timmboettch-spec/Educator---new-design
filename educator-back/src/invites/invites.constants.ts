export const InvitesConstants = {
  INVITE_EXPIRY_MINUTES: 60,

  ROUTES: {
    BASE: 'invites',
    CREATE: 'create',
    VERIFY: 'verify',
    GET_DETAILS: ':id',
  },
  SWAGGER: {
    TAG: 'Invites',
    SUMMARY_CREATE: 'Create an educator invite',
    SUMMARY_VERIFY: 'Verify an invite ID',
  },
  // IGNORE ---
  MESSAGES: {
    CREATOR_NOT_FOUND: 'Creator not found',
    USER_EXISTS: 'User with this email already exists',
    INVITE_EXISTS: 'A pending invitation for this email already exists',
    INVITE_SENT: 'Invite sent successfully',
    INVALID_OR_EXPIRED: 'Invalid or expired invite',
    VALID_INVITE: 'Invite is valid',
    INVITE_ALREADY_USED: 'Invite has already been used',
    INVITE_EXPIRED: 'Invite has expired',
    SCHOOL_NOT_FOUND: 'School not found',
    ROLE_NOT_FOUND: 'Role not found',
    EMAIL_MISMATCH: 'Email does not match the invitation',
    EMAIL_SUBJECT: 'Educator App Invitation',
    INSUFFICIENT_SEATS: (available: number, requested: number): string =>
      `Insufficient AI seats available. Total available: ${available}, requested: ${requested}`,
    TEMPLATE_NAME: './invite',
  },
  VALIDATION: {
    EMAIL_EXAMPLE: 'educator@school.com',
    SCHOOL_ID_EXAMPLE: 'school-uuid',
    CLASS_ID_EXAMPLE: 'class-uuid',
    INVITE_ID_EXAMPLE: 'invite-uuid',
    CREATOR_ID_EXAMPLE: 'creator-uuid',
  },

  ROLES: {
    EDUCATOR: 'Educator',
    DISTRICT_ADMIN: 'District Admin',
  },

  LOG: {
    EMAIL_SEND_FAILED: 'Failed to send invite email:',
  },

  EMAIL_DEFAULTS: {
    FULL_NAME: 'there',
    CREATOR_NAME: 'Your Administrator',
    SCHOOL_NAME: 'your school',
  },
};
