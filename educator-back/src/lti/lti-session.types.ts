import { DeepLinkingSettings } from './interfaces/deep-linking.interface';

export type LtiSessionAudience = 'educator' | 'student' | 'deep_linking';

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
}

/** RW portal tokens only — LMS NRPS/AGS OAuth is never written into the Redis session. */
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
  /** Optional deep link after educator LTI/GC session exchange (e.g. /simulationdetails/:id). */
  redirectPath?: string | null;
}

export interface StudentLtiSessionPayload extends LtiSessionBase {
  audience: 'student';
  studentCode: string;
  classId: string | null;
  className: string | null;
  accessToken: string | null;
  studentData: Record<string, unknown>;
  ltiLaunchContext?: {
    resourceLinkId?: string;
    simulationId?: string;
  };
}

/** Deep Linking session payload for content selection flow */
export interface DeepLinkingSessionPayload {
  audience: 'deep_linking';
  issuer: string;
  schoolId: string;
  classId: string | null;
  courseTitle: string | null;
  deepLinkingSettings: DeepLinkingSettings;
  deploymentId: string;
  clientId: string;
  payload: Record<string, unknown>; // Full launch payload for debugging
}

export type LtiSessionPayload = EducatorLtiSessionPayload | StudentLtiSessionPayload | DeepLinkingSessionPayload;
