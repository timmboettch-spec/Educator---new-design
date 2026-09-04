import type { LmsSchoolConfig } from '../entity/lms-school-config.entity';

export interface LmsRosterMember {
  userId: string;
  name: string | null;
  email: string | null;
  roles: string[];
}

export interface NrpsContext {
  id: string | null;
  label: string | null;
  title: string | null;
}

export interface LmsRosterResponse {
  members: LmsRosterMember[];
  context: NrpsContext;
}

export interface StudentProfileLookup {
  studentCode: string;
  name: string | null;
  email: string | null;
  piiAvailable: boolean;
  mode: 'full' | 'student_code_only';
}

/**
 * Adapter interface for LMS-specific implementations.
 * Each LMS platform (Moodle, Canvas, Blackboard) implements this interface.
 */
export interface LmsAdapter {
  /**
   * Fetch roster from LMS via NRPS (LTI 1.3) or platform API
   * @param nrpsUrl - NRPS endpoint URL
   * @param accessToken - OAuth2 access token
   * @returns List of members with roles
   */
  fetchRoster(nrpsUrl: string, accessToken: string): Promise<LmsRosterResponse>;

  /**
   * Exchange auth code for access token (for LTI Advantage or platform API)
   * Optional: implement if platform requires custom token exchange
   */
  exchangeToken?(config: LmsSchoolConfig, authCode: string): Promise<LmsTokenResponse>;

  /**
   * Get course details from LMS (for mapping verification)
   * Optional: implement for additional course metadata
   */
  getCourseDetails?(
    config: LmsSchoolConfig,
    courseId: string,
    accessToken?: string,
  ): Promise<LmsCourseDetails>;

  /**
   * Send grade to LMS gradebook (Assignment & Grade Services)
   * Optional: implement when grade passback is ready
   */
  sendGrade?(
    config: LmsSchoolConfig,
    lineItemUrl: string,
    userId: string,
    score: number,
    accessToken: string,
  ): Promise<void>;

  /**
   * Get user email by LMS user ID (fallback if not in id_token)
   * Optional: implement for platforms that support user lookup API
   */
  getUserEmail?(
    config: LmsSchoolConfig,
    lmsUserId: string,
  ): Promise<{ email: string | null; error: string | null }>;
}

/**
 * OAuth2 token response from LMS
 */
export interface LmsTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scope?: string;
}

/**
 * LMS course details
 */
export interface LmsCourseDetails {
  id: string;
  name: string;
  code?: string;
  description?: string;
}

export interface MoodleEnrolledUser {
  id: number;
  username: string;
  fullname: string;
  firstname: string;
  lastname: string;
  email: string;
  profileimageurl: string;
  roles: Array<{ roleid: number; shortname: string }>;
  lastaccess: number;
}

export interface MoodleStudentsResponse {
  courseId: number;
  courseName: string;
  students: MoodleEnrolledUser[];
  total: number;
}

export interface MoodleCourse {
  id: number;
  fullname: string;
  shortname: string;
  summary: string;
  enrolledcount?: number;
  visible: number;
  format: string;
}

export interface MoodleCoursesResponse {
  courses: MoodleCourse[];
  total: number;
}
