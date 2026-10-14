export enum LmsType {
  MOODLE = 'moodle',
  CANVAS = 'canvas',
  GOOGLE_CLASSROOM = 'google_classroom',
}

export enum LmsToolType {
  EDUCATOR = 'educator',
  STUDENT = 'student',
}

export enum LmsConfigStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  /** Saved but not yet verified — key is published in JWKS, never used for launches or lookups. */
  PENDING = 'pending',
}
