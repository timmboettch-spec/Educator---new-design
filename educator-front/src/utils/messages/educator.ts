export const EDUCATOR_VALIDATION = {
  NAME_REQUIRED: 'Educator Name is required',
  NAME_MAX_LENGTH: 'Educator name must be at most 50 characters',
  EMAIL_REQUIRED: 'Educator email is required',
  EMAIL_INVALID: 'Please enter a valid email address',
  SCHOOL_REQUIRED: 'School is required',
  PHONE_REQUIRED: 'Phone number is required',
  EDUCATOR_STATUS: 'Status must be Active or Inactive',
  TOKENS_REQUIRED: 'Seats are required for an educator to add students',
  TOKENS_MAX_EXCEEDED: 'Only 500 seats can be allocated',
  TOKENS_LIMIT_EXCEEDED: (limit: number) => `Seats cannot exceed available limit (${limit})`,

};

export const EDUCATOR_FIELDS = {
  EDUCATOR_NAME: 'Educator Name',
  EDUCATOR_EMAIL: 'Educator Email',
  EDUCATOR_PHONE: 'Educator Phone',
  EDUCATOR_STATUS: 'Status',
  SCHOOL: 'School',
  CLASS: 'Class',
};

export const EDUCATOR_TABLE_HEADERS = {
  EDUCATOR_NAME: 'Educator Name',
  SCHOOL_NAME: 'School Name',
  CLASS_NAME: 'Class Name',
  EMAIL: 'Email',
  PHONE_NUMBER: 'Phone Number',
  STATUS: 'Status',
  ACTIONS: 'Actions',
};

export const EDUCATOR_MODALS = {
  ADD: 'Create Educator',
  EDIT: 'Edit Educator',
  VIEW: 'View Educator',
  DELETE: 'Delete Educator',
};

export const EDUCATOR_PLACEHOLDERS = {
  SEARCH: 'Search...',
  ENTER_NAME: 'Enter educator name',
  ENTER_EMAIL: 'Enter the Email ID  ',
  ENTER_PHONE: '123-234-0000',
  SELECT_SCHOOL: 'Select school',
  SELECT_CLASS: 'Select class',
};

export const EDUCATOR_BUTTONS = {
  ADD_EDUCATOR: 'Add Educator',
  INVITE: 'Create Educator',
  INVITING: 'Inviting...',
  UPDATE: 'Update Educator',
  UPDATING: 'Updating...',
  CANCEL: 'Cancel',
  CLOSE: 'Close',
};

export const EDUCATOR_EMPTY_STATES = {
  NO_EDUCATORS_FOUND: 'No educators found matching your criteria',
  // LOADING: 'Loading educator data...',
};

export const EDUCATOR_CONFIRMATIONS = {
  DELETE: 'Are you sure you want to delete this educator? This action cannot be undone.',
};

export const EDUCATOR_PAGE = {
  TITLE: 'Educators',
  LIST_TITLE: 'All Educator List',
};

export const EDUCATOR_TOAST = {
  CREATED: 'Educator invited successfully',
  UPDATED: 'Educator updated successfully',
  DELETED: 'Educator deleted successfully',
  FETCH_ERROR: 'Failed to fetch educators',
};
