export const CLASS_VALIDATION = {
  NAME_REQUIRED: 'Class name is required',
  TERM: 'Term is required',
  YEAR: 'Year is required',
  STATUS: 'Status is required',
  STARTDATE: 'Start date is required',
  ENDDATE: 'End date is required',
  STARTDATE_BEFORE_ENDDATE: 'Start date must be before end date',
  YEAR_INVALID: 'Year must be a valid number',
  FILE_INVALID: 'Invalid file type. Only CSV and Excel files are accepted.',
  SCHOOL_REQUIRED: 'School is required',
};

export const CLASS_FIELDS = {
  CLASS_NAME: 'Class Name',
  SCHOOL_NAME: 'School Name',
  STATUS: 'Status',
};

export const CLASS_TABLE_HEADERS = {
  CLASS_NAME: 'Class Name',
  SCHOOL_NAME: 'School Name',
  STATUS: 'Status',
  ACTIONS: 'Actions',
};

export const CLASS_MODALS = {
  ADD: 'Create Class',
  EDIT: 'Edit Class',
  VIEW: 'View Class',
  DELETE: 'Delete Class',
};

export const CLASS_PLACEHOLDERS = {
  SEARCH: 'Search classes...',
  ENTER_NAME: 'Enter class name',
};

export const CLASS_BUTTONS = {
  ADD_SCHOOL: 'Add Class',
  ADD_CLASS: 'Add Class',
  CONTINUE: 'Continue',
  BACK: 'Back',
  SUBMIT: 'Submit',
};

export const CLASS_EMPTY_STATES = {
  NO_SCHOOLS_FOUND: 'No classes found matching your criteria',
  LOADING: 'Loading class data...',
};

export const CLASS_CONFIRMATIONS = {
  DELETE: 'Are you sure to delete this class? This action cannot be undone.',
};

export const CLASS_PAGE = {
  TITLE: 'Classes',
  LIST_TITLE: 'All Class List',
};

export const CLASS_TOAST = {
  CREATED: 'Class created successfully',
  UPDATED: 'Class updated successfully',
  DELETED: 'Class deleted successfully',
  FETCH_ERROR: 'Failed to fetch classes',
  DELETE_ERROR: 'Failed to delete class',
  CREATE_ERROR: 'Failed to create class',
  UPDATE_ERROR: 'Failed to update class',
  FILE_PARSE_ERROR: 'Failed to parse file. Check the format.',
  FILE_EMPTY: 'File is empty or has no valid data rows.',
  FILE_REQUIRED: 'Please choose a CSV or Excel file before creating the class.',
};
export const STUDENT = {
  NAME_REQUIRED: 'Student name is required',
  ID_REQUIRED: 'Student ID is required',
  EMAIL: 'Student email is required',
};
