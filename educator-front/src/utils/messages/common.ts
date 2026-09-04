export const COMMON_MESSAGES = {
  NA: '-',
  LOADING: 'Loading...',
  NO_DATA: 'No data available',
  ERROR_OCCURRED: 'An error occurred',
  SUCCESS: 'Success',
  RETRY: 'Retry',
  CLOSE: 'Close',
  CANCEL: 'Cancel',
  SAVE: 'Save',
  CREATE: 'Create',
  UPDATE: 'Update',
  DELETE: 'Delete',
  EDIT: 'Edit',
  VIEW: 'View',
  SEARCH: 'Search',
  FILTER: 'Filter',
  EXPORT: 'Export',
  IMPORT: 'Import',
  BULK_IMPORT_CSV: 'Bulk Import CSV',
  YES: 'Yes',
  NO: 'No',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
};

export const COMMON_VALIDATION = {
  REQUIRED: 'This field is required',
  INVALID_EMAIL: 'Invalid email address',
  INVALID_PHONE: 'Invalid phone number',
  INVALID_FORMAT: 'Invalid format',
  FORGOT_EMAIL: 'Email is required, Please provide a valid email address',
  MIN_LENGTH: (min: number) => `Must be at least ${min} characters`,
  MAX_LENGTH: (max: number) => `Must be at most ${max} characters`,
  FULL_NAME_NO_LEADING_SPACE: 'Full name cannot start with a space',
  FULL_NAME_REQUIRED: 'Full name is required',
  EMAIL_AND_PASSWORD_REQUIRED:
    'Email is required, Please provide a valid email address, Password is required',
  EMAIL_REQUIRED: 'Email is required',
  PASSWORD_REQUIRED: 'Password is required',
  PASSWORD_LENGTH:
    'Password must be 8 to 20 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.',
  PASSWORD_COMPLEXITY:
    'Password must be 8 to 20 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.',
  CONFIRM_PASSWORD_REQUIRED: 'Confirm password is required',
  CONFIRM_PASSWORD_LENGTH:
    'Password must be 8 to 20 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.',
  PASSWORD_MISMATCH: 'Password and confirm password must be the same',
};

export const COMMON_FIELDS = {
  NAME: 'Name',
  EMAIL: 'Email',
  PHONE: 'Phone Number',
  PHONE_NUMBER: 'Phone Number',
  ADDRESS: 'Address',
  STATUS: 'Status',
  ACTIONS: 'Actions',
  CREATED_AT: 'Created At',
  UPDATED_AT: 'Updated At',
};

export const COMMON_BUTTONS = {
  CREATING: 'Creating...',
  UPDATING: 'Updating...',
  DELETING: 'Deleting...',
  LOADING: 'Loading...',
};

export const COMMON_TOAST = {
  CREATED_SUCCESS: (entity: string) => `${entity} created successfully`,
  UPDATED_SUCCESS: (entity: string) => `${entity} updated successfully`,
  DELETED_SUCCESS: (entity: string) => `${entity} deleted successfully`,
  SAVED_SUCCESS: 'Changes saved successfully',
  CREATED_ERROR: (entity: string) => `Failed to create ${entity}`,
  UPDATED_ERROR: (entity: string) => `Failed to update ${entity}`,
  DELETED_ERROR: (entity: string) => `Failed to delete ${entity}`,
  FETCH_ERROR: (entity: string) => `Failed to fetch ${entity}`,
  GENERIC_ERROR: 'Something went wrong. Please try again.',
};
