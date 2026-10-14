import { Injectable } from '@nestjs/common';
import { LmsSchoolConfig } from 'src/database/entities';
import { ConfigService } from '@nestjs/config';
import { OutboundIntegration } from '../../common/constants';
import { LoggerService, OutboundHttpClient } from '../../common/services';
import {
  LmsAdapter,
  LmsCoursesResponse,
  LmsEnrolledStudentsResponse,
  LmsMemberProfile,
  LmsRosterResponse,
  MoodleCoursesResponse,
  MoodleStudentsResponse,
} from '../interfaces/lms.interfaces';

import {
  MoodleWsCredentials,
  normalizeMoodleUserId,
  resolveMoodleWsCredentials,
} from '../utils/moodle-ws.util';
import { extractCourseIdFromNrpsUrl, fetchNrpsMembershipPages } from '../utils/nrps.util';
import { LtiAgsAdapter } from './lti-ags.adapter';

/**
 * Moodle-specific implementation of the LMS Adapter interface.
 * Handles Moodle Web Services API and LTI 1.3 NRPS.
 */
@Injectable()
export class MoodleAdapter implements LmsAdapter {
  constructor(
    private readonly configService: ConfigService,
    private readonly ltiAgsAdapter: LtiAgsAdapter,
    private readonly logger: LoggerService,
    private readonly outboundHttp: OutboundHttpClient,
  ) {}

  private resolveCredentials(config: LmsSchoolConfig): MoodleWsCredentials | null {
    return resolveMoodleWsCredentials(
      config,
      this.configService.get<string>('lms.moodleUrl', ''),
      this.configService.get<string>('lms.moodleWsToken', ''),
    );
  }

  async listCourses(config: LmsSchoolConfig): Promise<LmsCoursesResponse> {
    const credentials = this.resolveCredentials(config);
    if (!credentials) {
      throw new Error('lmsBaseUrl and lmsApiToken are required');
    }
    return this.getMoodleCourses(credentials.moodleUrl, credentials.wsToken);
  }

  async getEnrolledStudentsForCourse(
    config: LmsSchoolConfig,
    courseId: number,
  ): Promise<LmsEnrolledStudentsResponse> {
    const credentials = this.resolveCredentials(config);
    if (!credentials) {
      throw new Error('lmsBaseUrl and lmsApiToken are required');
    }
    return this.getEnrolledStudents(credentials.moodleUrl, credentials.wsToken, courseId);
  }

  async enrichRosterRoles(
    config: LmsSchoolConfig,
    nrpsUrl: string,
    roster: LmsRosterResponse,
  ): Promise<LmsRosterResponse> {
    const courseId = extractCourseIdFromNrpsUrl(nrpsUrl);
    const credentials = this.resolveCredentials(config);
    if (!courseId || !credentials) {
      return roster;
    }
    return this.enrichRosterRolesFromWs(credentials, courseId, roster);
  }

  async fetchRosterFromPlatformWs(
    config: LmsSchoolConfig,
    courseId: number,
  ): Promise<LmsRosterResponse> {
    const credentials = this.resolveCredentials(config);
    if (!credentials) {
      throw new Error('lmsBaseUrl and lmsApiToken are required');
    }
    return this.fetchRosterFromWs(credentials, courseId);
  }

  async fetchMemberProfilesForCourse(
    config: LmsSchoolConfig,
    courseId: string,
  ): Promise<Map<string, LmsMemberProfile>> {
    const credentials = this.resolveCredentials(config);
    if (!credentials) {
      return new Map();
    }
    return this.fetchMemberProfilesFromWs(credentials, courseId);
  }

  private isWsTeacherOrAdminRole(shortname: string): boolean {
    const role = String(shortname || '').toLowerCase();
    return (
      role.includes('teacher') ||
      role.includes('instructor') ||
      role.includes('manager') ||
      role.includes('admin') ||
      role.includes('coursecreator') ||
      role.includes('editingteacher')
    );
  }

  private isWsStudentRole(shortname: string): boolean {
    const role = String(shortname || '').toLowerCase();
    return role.includes('student') || role.includes('learner') || role.includes('participant');
  }

  async getEnrolledStudents(
    moodleUrl: string,
    wsToken: string,
    courseId: number,
  ): Promise<MoodleStudentsResponse> {
    const credentials = resolveMoodleWsCredentials({ lmsBaseUrl: moodleUrl, lmsApiToken: wsToken });
    if (!credentials) {
      throw new Error('moodleUrl and wsToken are required');
    }

    const allUsers = await this.fetchEnrolledUsersRaw(credentials, courseId);
    let students = allUsers.filter((u) => {
      const roles = u['roles'] as Array<{ shortname: string }> | undefined;
      const normalizedRoles = Array.isArray(roles)
        ? roles.map((r) => String(r.shortname || '').toLowerCase())
        : [];

      const hasStudentRole = normalizedRoles.some((role) => this.isWsStudentRole(role));
      const hasEducatorRole = normalizedRoles.some((role) => this.isWsTeacherOrAdminRole(role));
      return hasStudentRole && !hasEducatorRole;
    });

    if (!students.length) {
      students = allUsers.filter((u) => {
        const roles = u['roles'] as Array<{ shortname: string }> | undefined;
        const normalizedRoles = Array.isArray(roles)
          ? roles.map((r) => String(r.shortname || '').toLowerCase())
          : [];

        if (!normalizedRoles.length) {
          return true;
        }

        return !normalizedRoles.some((role) => this.isWsTeacherOrAdminRole(role));
      });
    }

    const courseInfo = await this.getCourseInfo(
      credentials.moodleUrl,
      credentials.wsToken,
      courseId,
    );

    return {
      courseId,
      courseName: courseInfo,
      students: students.map((u) => ({
        id: Number(u['id']),
        username: typeof u['username'] === 'string' ? u['username'] : '',
        fullname: typeof u['fullname'] === 'string' ? u['fullname'] : '',
        firstname: typeof u['firstname'] === 'string' ? u['firstname'] : '',
        lastname: typeof u['lastname'] === 'string' ? u['lastname'] : '',
        email: typeof u['email'] === 'string' ? u['email'] : '',
        profileimageurl: typeof u['profileimageurl'] === 'string' ? u['profileimageurl'] : '',
        roles: (u['roles'] as Array<{ roleid: number; shortname: string }>) ?? [],
        lastaccess: Number(u['lastaccess'] ?? 0),
      })),
      total: students.length,
    };
  }

  /** NRPS roles can be stale; prefer Moodle WS enrollment roles when available. */
  async enrichRosterRolesFromWs(
    credentials: MoodleWsCredentials,
    courseId: number,
    roster: LmsRosterResponse,
  ): Promise<LmsRosterResponse> {
    try {
      const allUsers = await this.fetchEnrolledUsersRaw(credentials, courseId);
      const wsRolesByUserId = new Map<string, string[]>();

      for (const user of allUsers) {
        const rawId =
          typeof user['id'] === 'number' || typeof user['id'] === 'string'
            ? String(user['id'])
            : '';
        const userId = normalizeMoodleUserId(rawId);
        if (!userId) {
          continue;
        }

        const rolesRaw = user['roles'];
        const roles = Array.isArray(rolesRaw)
          ? rolesRaw
              .map((roleEntry) => {
                if (typeof roleEntry !== 'object' || roleEntry === null) {
                  return '';
                }
                const shortname = (roleEntry as Record<string, unknown>)['shortname'];
                return typeof shortname === 'string' ? `moodle:${shortname}` : '';
              })
              .filter(Boolean)
          : [];

        if (roles.length) {
          wsRolesByUserId.set(userId, roles);
        }
      }

      if (!wsRolesByUserId.size) {
        return roster;
      }

      let enrichedCount = 0;
      const enrichedMembers = roster.members.map((member) => {
        const key = normalizeMoodleUserId(member.userId);
        const wsRoles = wsRolesByUserId.get(key);
        if (wsRoles?.length) {
          enrichedCount += 1;
          return { ...member, roles: wsRoles };
        }
        return member;
      });

      if (enrichedCount > 0) {
        this.logger.log(
          `[MoodleAdapter] Enriched ${enrichedCount} member role(s) from WS for course ${courseId}`,
        );
      }

      return { ...roster, members: enrichedMembers };
    } catch (err) {
      this.logger.warn(
        `[MoodleAdapter] WS role enrichment skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
      return roster;
    }
  }

  async fetchRosterFromWs(
    credentials: MoodleWsCredentials,
    courseId: number,
  ): Promise<LmsRosterResponse> {
    const wsRoster = await this.getEnrolledStudents(
      credentials.moodleUrl,
      credentials.wsToken,
      courseId,
    );

    return {
      context: {
        id: String(wsRoster.courseId),
        label: null,
        title: wsRoster.courseName || null,
      },
      members: wsRoster.students.map((student) => ({
        userId: String(student.id),
        name: student.fullname || null,
        email: student.email || null,
        roles: Array.isArray(student.roles)
          ? student.roles.map((r) => `moodle:${r.shortname}`)
          : [],
      })),
    };
  }

  async fetchMemberProfilesFromWs(
    credentials: MoodleWsCredentials,
    courseId: string,
  ): Promise<Map<string, { name: string | null; email: string | null }>> {
    const profiles = new Map<string, { name: string | null; email: string | null }>();
    const courseIdNum = Number(courseId);
    if (!Number.isFinite(courseIdNum)) {
      return profiles;
    }

    const allUsers = await this.fetchEnrolledUsersRaw(credentials, courseIdNum);
    for (const user of allUsers) {
      const userId =
        typeof user['id'] === 'string' || typeof user['id'] === 'number' ? String(user['id']) : '';
      const normalizedUserId = normalizeMoodleUserId(userId);
      const profile = {
        name: typeof user['fullname'] === 'string' ? user['fullname'] : null,
        email: typeof user['email'] === 'string' ? user['email'] : null,
      };
      if (userId) {
        profiles.set(userId, profile);
      }
      if (normalizedUserId) {
        profiles.set(normalizedUserId, profile);
      }
    }

    return profiles;
  }

  private async fetchEnrolledUsersRaw(
    credentials: MoodleWsCredentials,
    courseId: number,
  ): Promise<Array<Record<string, unknown>>> {
    const url =
      `${credentials.moodleUrl}/webservice/rest/server.php` +
      `?wstoken=${encodeURIComponent(credentials.wsToken)}` +
      `&wsfunction=core_enrol_get_enrolled_users` +
      `&courseid=${encodeURIComponent(String(courseId))}&moodlewsrestformat=json`;
    const response = await this.outboundHttp.fetch(OutboundIntegration.Moodle, url);
    if (!response.ok) {
      throw new Error(`Moodle API error (${response.status})`);
    }

    const data = (await response.json()) as unknown;
    if (!Array.isArray(data)) {
      const err = data as Record<string, unknown>;
      const msg = typeof err['message'] === 'string' ? err['message'] : 'unknown';
      throw new Error(`Moodle error: ${msg}`);
    }

    return data as Array<Record<string, unknown>>;
  }

  private async getCourseInfo(base: string, wsToken: string, courseId: number): Promise<string> {
    try {
      const url = `${base}/webservice/rest/server.php?wstoken=${wsToken}&wsfunction=core_course_get_courses&options[ids][0]=${courseId}&moodlewsrestformat=json`;
      const response = await this.outboundHttp.fetch(OutboundIntegration.Moodle, url);
      if (!response.ok) return `Course ${courseId}`;
      const data = (await response.json()) as Array<{ fullname?: string }>;
      return data?.[0]?.fullname ?? `Course ${courseId}`;
    } catch {
      return `Course ${courseId}`;
    }
  }

  async getMoodleCourses(moodleUrl: string, wsToken: string): Promise<MoodleCoursesResponse> {
    if (!moodleUrl || !wsToken) {
      throw new Error('moodleUrl and wsToken are required');
    }
    const base = moodleUrl.trim().replace(/\/$/, '');
    const url = `${base}/webservice/rest/server.php?wstoken=${wsToken}&wsfunction=core_course_get_courses&moodlewsrestformat=json`;
    const response = await this.outboundHttp.fetch(OutboundIntegration.Moodle, url);
    if (!response.ok) {
      throw new Error(`Moodle API error (${response.status})`);
    }

    const data = (await response.json()) as unknown;
    if (!Array.isArray(data)) {
      const err = data as Record<string, unknown>;
      const msg = typeof err['message'] === 'string' ? err['message'] : 'unknown';
      throw new Error(`Moodle error: ${msg}`);
    }
    const allCourses = (data as Array<Record<string, unknown>>).filter(
      (c) => Number(c['id']) !== 1,
    );

    const courses = allCourses.map((c) => ({
      id: Number(c['id']),
      fullname: typeof c['fullname'] === 'string' ? c['fullname'] : '',
      shortname: typeof c['shortname'] === 'string' ? c['shortname'] : '',
      summary: typeof c['summary'] === 'string' ? c['summary'] : '',
      visible: Number(c['visible'] ?? 1),
      format: typeof c['format'] === 'string' ? c['format'] : 'topics',
    }));

    return { courses, total: courses.length };
  }

  /**
   * Fetch NRPS roster (LTI 1.3 standard)
   */
  async fetchRoster(nrpsUrl: string, accessToken: string): Promise<LmsRosterResponse> {
    return fetchNrpsMembershipPages({
      nrpsUrl,
      accessToken,
      failedMessagePrefix: 'NRPS failed',
      invalidJsonMessage: 'NRPS returned invalid JSON',
      fetchFn: (url, init) => this.outboundHttp.fetch(OutboundIntegration.Lms, url, init),
    });
  }

  /**
   * Get user email by Moodle user ID (fallback for PII)
   */
  async getUserEmail(
    config: LmsSchoolConfig,
    lmsUserId: string,
  ): Promise<{ email: string | null; error: string | null }> {
    const lmsBaseUrl = config.lmsBaseUrl;
    const apiToken = config.lmsApiToken;

    if (!lmsBaseUrl || !apiToken || !lmsUserId) {
      return { email: null, error: 'missing_lms_config_or_user_id' };
    }

    const base = lmsBaseUrl.trim().replace(/\/$/, '');
    const result1 = await this.callUserByField(base, apiToken, lmsUserId);
    if (result1.email) return result1;
    const result2 = await this.callGetUsers(base, apiToken, lmsUserId);
    return result2;
  }

  private async callUserByField(
    base: string,
    wsToken: string,
    moodleUserId: string,
  ): Promise<{ email: string | null; error: string | null }> {
    const url =
      `${base}/webservice/rest/server.php` +
      `?wstoken=${encodeURIComponent(wsToken)}` +
      `&wsfunction=core_user_get_users_by_field` +
      `&field=id` +
      `&values[0]=${encodeURIComponent(moodleUserId)}` +
      `&moodlewsrestformat=json`;
    try {
      const response = await this.outboundHttp.fetch(OutboundIntegration.Moodle, url);
      const raw = await response.text();
      const data = JSON.parse(raw) as unknown;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const err = data as Record<string, unknown>;
        if (err['exception'] || err['errorcode']) {
          const msg =
            typeof err['message'] === 'string'
              ? err['message']
              : typeof err['errorcode'] === 'string'
                ? err['errorcode']
                : 'unknown';
          return { email: null, error: `ws_by_field: ${msg}` };
        }
      }
      if (!Array.isArray(data) || data.length === 0) {
        return { email: null, error: 'ws_by_field: empty_result' };
      }
      const user = (data as Array<Record<string, unknown>>)[0];
      const email = user['email'];
      return {
        email: typeof email === 'string' && email.includes('@') ? email.toLowerCase().trim() : null,
        error: null,
      };
    } catch (err) {
      return { email: null, error: `ws_by_field: ${(err as Error).message}` };
    }
  }

  private async callGetUsers(
    base: string,
    wsToken: string,
    moodleUserId: string,
  ): Promise<{ email: string | null; error: string | null }> {
    const url =
      `${base}/webservice/rest/server.php` +
      `?wstoken=${encodeURIComponent(wsToken)}` +
      `&wsfunction=core_user_get_users` +
      `&criteria[0][key]=id` +
      `&criteria[0][value]=${encodeURIComponent(moodleUserId)}` +
      `&moodlewsrestformat=json`;
    try {
      const response = await this.outboundHttp.fetch(OutboundIntegration.Moodle, url);
      const raw = await response.text();
      const data = JSON.parse(raw) as unknown;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const obj = data as Record<string, unknown>;
        if (obj['exception'] || obj['errorcode']) {
          const msg =
            typeof obj['message'] === 'string'
              ? obj['message']
              : typeof obj['errorcode'] === 'string'
                ? obj['errorcode']
                : 'unknown';
          return { email: null, error: `ws_get_users: ${msg}` };
        }
        const users = obj['users'];
        if (Array.isArray(users) && users.length > 0) {
          const user = (users as Array<Record<string, unknown>>)[0];
          const email = user['email'];
          return {
            email:
              typeof email === 'string' && email.includes('@') ? email.toLowerCase().trim() : null,
            error: null,
          };
        }
        return { email: null, error: 'ws_get_users: empty_result' };
      }
      return { email: null, error: 'ws_get_users: unexpected_response' };
    } catch (err) {
      return { email: null, error: `ws_get_users: ${(err as Error).message}` };
    }
  }

  async sendGrade(
    config: LmsSchoolConfig,
    lineItemUrl: string,
    userId: string,
    score: number,
    accessToken: string,
  ): Promise<void> {
    return this.ltiAgsAdapter.sendGrade(config, lineItemUrl, userId, score, accessToken);
  }
}
