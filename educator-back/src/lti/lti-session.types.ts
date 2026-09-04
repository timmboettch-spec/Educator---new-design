export type LtiSessionAudience = 'educator' | 'student';

/** LTI launch metadata stored with the one-time code for audit and validation. */
export interface LtiLaunchContext {
  issuer: string;
  lmsUserId: string;
  lmsCourseId: string | null;
  clientId: string | null;
}

interface LtiSessionBase {
  audience: LtiSessionAudience;
  userId: string | null;
  schoolId: string | null;
  ltiContext: LtiLaunchContext;
  createdAt: number;
  expiresAt: number;
}

export interface EducatorLtiSessionPayload extends LtiSessionBase {
  audience: 'educator';
  accessToken: string;
  csrfToken: string;
  user: Record<string, unknown>;
  nrpsUrl: string;
  lmsCourseId: string | null;
  lmsCourseName: string;
  provisioningStatus: string;
  courseSource: string;
  lmsAccessToken?: string; // OAuth access token for NRPS/AGS API calls
}

export interface StudentLtiSessionPayload extends LtiSessionBase {
  audience: 'student';
  studentCode: string;
  classId: string | null;
  className: string | null;
  accessToken: string | null;
  studentData: Record<string, unknown>;
}

export type LtiSessionPayload = EducatorLtiSessionPayload | StudentLtiSessionPayload;

export type CreateEducatorLtiSessionInput = Omit<
  EducatorLtiSessionPayload,
  'createdAt' | 'expiresAt'
>;
export type CreateStudentLtiSessionInput = Omit<
  StudentLtiSessionPayload,
  'createdAt' | 'expiresAt'
>;
export type CreateLtiSessionInput = CreateEducatorLtiSessionInput | CreateStudentLtiSessionInput;
