export const UserConstants = {
  ROUTES: {
    BASE: 'users',
    ID: ':id',
    PROFILE: 'profile',
    PROFILE_PICTURE: 'profile-picture',
  },
  SWAGGER: {
    TAG: 'Users',
    LIST: 'List all users (District Admins)',
    GET_ONE: 'Get a single user by ID',
    UPDATE_PROFILE: 'Update profile name and picture',
    PROFILE_PICTURE: 'Get profile picture',
    REMOVE_PROFILE_PICTURE: 'Remove profile picture',
  },
  MESSAGES: {
    FETCHED: 'Users fetched successfully',
    FETCHED_EDUCATORS: 'Educators fetched successfully',
    NOT_FOUND: 'User not found',
    ROLE_MISSING: 'Role not found. Please ensure seed data is loaded.',
    UPDATED: 'Profile updated successfully',
    DELETED: 'Profile deleted successfully',
    UNAUTHORIZED_EDIT: 'You are not authorized to edit this educator',
    UNAUTHORIZED_DELETE: 'You are not authorized to delete this educator',
    PASSWORD_CHANGED: 'Password changed successfully',
    PROFILE_PICTURE_FETCHED: 'Profile picture fetched successfully',
  },
  VALIDATION: {
    USER_ID_REQUIRED: 'User ID is required',
    OLD_PASSWORD_REQUIRED: 'Old password is required',
    NEW_PASSWORD_REQUIRED: 'New password is required',
  },
};
