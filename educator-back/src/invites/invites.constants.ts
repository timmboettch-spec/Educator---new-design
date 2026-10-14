export const InvitesConstants = {
  INVITE_EXPIRY_MINUTES: 60,

  ROUTES: {
    BASE: 'invites',
    CREATE: 'create',
    VERIFY_TOKEN: 'verify-token',
    ACCEPT_INVITE: 'accept-invite',
  },
  SWAGGER: {
    TAG: 'Invites',
    SUMMARY_CREATE: 'Create an educator invite',
    SUMMARY_VERIFY_TOKEN: 'Verify an invite token is active and not expired',
  },
  // IGNORE ---
  MESSAGES: {
    CREATOR_NOT_FOUND: 'Creator not found',
    USER_EXISTS: 'User with this email already exists',
    INVITE_EXISTS: 'A pending invitation for this email already exists',
    USER_ALREADY_INVITED: 'This user is already invited',
    EDUCATOR_ALREADY_REGISTERED: 'This educator is already registered',
    INVITE_SENT: 'Invite sent successfully',
    EDUCATOR_ACTIVATED: 'Educator activated successfully',
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


  LOG: {
    EMAIL_SEND_FAILED: 'Failed to send invite email:',
    SEATS_RESTORED_AFTER_CREATE_FAILURE: 'Restored admin seats after invite create failure',
    SEATS_RESTORE_FAILED: 'Failed to restore admin seats after invite create failure',
  },

  EMAIL_DEFAULTS: {
    FULL_NAME: 'there',
    CREATOR_NAME: 'Your Administrator',
    SCHOOL_NAME: 'your school',
  },
};
