export const SchoolConstants = {
  ROUTES: {
    BASE: 'schools',
    ID: ':id',
    USER: 'user',
    ADMIN: 'admin/:adminId',
  },
  SWAGGER: {
    TAG: 'Schools',
  },
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  VALIDATION: {
    NAME_REQUIRED: 'School name is required',
    STATUS_ENUM: 'Status must be ACTIVE or INACTIVE',
  },
};
