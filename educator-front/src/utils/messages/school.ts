export const SCHOOL_VALIDATION = {
  NAME_REQUIRED: 'School name is required',
  NAME_MAX_LENGTH: 'School name must be at most 50 characters',
  NAME_INVALID_CHARACTERS:
    'School name can only contain letters, numbers, spaces, periods, and hyphens',
  NAME_NO_EMOJI: 'Emojis are not allowed in school name',
  NAME_NO_LEADING_SPACE: 'School name cannot start with a space',
  NAME_INJECTION: 'School name contains invalid content',
  NAME_CONSECUTIVE_SPECIALS:
    'School name cannot have more than 2 consecutive special characters',
  NAME_NO_CODE: 'School name cannot contain programming code or scripts',
  ADDRESS_REQUIRED: 'School address is required',
  ALREADY_EXISTS: 'School already exists',
};

export const SCHOOL_FIELDS = {
  SCHOOL_NAME: 'School Name',
  SCHOOL_PHONE: 'School Phone',
  SCHOOL_ADDRESS: 'School Address',
  SCHOOL_STATUS: 'School Status',
};

export const SCHOOL_TABLE_HEADERS = {
  SCHOOL_NAME: 'School Name',
  PHONE_NUMBER: 'Contact Number',
  LOCATION: 'Location',
  STATUS: 'Status',
  ACTIONS: 'Actions',
};

export const SCHOOL_MODALS = {
  ADD: 'Create School',
  EDIT: 'Edit School',
  VIEW: 'View School',
  DELETE: 'Delete School',
};

export const SCHOOL_PLACEHOLDERS = {
  SEARCH: 'Search...',
  ENTER_NAME: 'Enter your name',
  ENTER_PHONE: 'Enter school phone',
  ENTER_ADDRESS: 'Enter school address',
};

export const SCHOOL_BUTTONS = {
  ADD_SCHOOL: 'Add School',
  UPDATE_SCHOOL: 'Update School',
};

export const SCHOOL_EMPTY_STATES = {
  NO_SCHOOLS_FOUND: 'No schools found matching your criteria',
  LOADING: 'Loading school data...',
};

export const SCHOOL_CONFIRMATIONS = {
  DELETE:
    'Are you sure you want to delete this School? This action cannot be undone.',
};

export const SCHOOL_PAGE = {
  TITLE: 'Schools',
  LIST_TITLE: 'All School List',
};

export const SCHOOL_TOAST = {
  CREATED: 'School created successfully',
  UPDATED: 'School updated successfully',
  DELETED: 'School deleted successfully',
  FETCH_ERROR: 'Failed to fetch schools',
};
