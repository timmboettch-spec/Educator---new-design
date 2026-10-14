import { Injectable, Logger } from '@nestjs/common';
import { LmsSchoolConfig } from 'src/database/entities';
import { OutboundIntegration } from '../../common/constants';
import { OutboundHttpClient } from '../../common/services';
import {
  LmsAdapter,
  LmsCoursesResponse,
  LmsEnrolledStudentsResponse,
  LmsMemberProfile,
  LmsRosterMember,
  LmsRosterResponse,
} from '../interfaces/lms.interfaces';
import { extractCourseIdFromNrpsUrl, fetchNrpsMembershipPages } from '../utils/nrps.util';

type CanvasEnrollment = {
  type?: string;
  role?: string;
  enrollment_state?: string;
};

type CanvasUser = {
  id?: number | string;
  name?: string;
  email?: string;
  login_id?: string;
  enrollments?: CanvasEnrollment[];
};

type CanvasCourse = {
  id?: number | string;
  name?: string;
  course_code?: string;
  public_description?: string;
  workflow_state?: string;
  total_students?: number;
};

@Injectable()
export class CanvasAdapter implements LmsAdapter {
  private readonly logger = new Logger(CanvasAdapter.name);

  constructor(private readonly outboundHttp: OutboundHttpClient) {}

  /**
   * Fetch course roster from Canvas NRPS.
   * @param nrpsUrl - `context_memberships_url` from the LTI NRPS claim
   * @param accessToken - OAuth2 bearer token from Canvas client_credentials grant
   */
  async fetchRoster(nrpsUrl: string, accessToken: string): Promise<LmsRosterResponse> {
    const url = String(nrpsUrl || '').trim();
    const token = String(accessToken || '').trim();

    if (!url) {
      throw new Error('Canvas NRPS URL is required');
    }
    if (!token) {
      throw new Error('Canvas NRPS access token is required');
    }

    this.logger.log(`[CanvasAdapter] Fetching NRPS roster from ${url}`);

    const roster = await fetchNrpsMembershipPages({
      nrpsUrl: url,
      accessToken: token,
      failedMessagePrefix: 'Canvas NRPS failed',
      invalidJsonMessage: 'Canvas NRPS returned invalid JSON',
      fetchFn: (url, init) => this.outboundHttp.fetch(OutboundIntegration.Lms, url, init),
    });
    this.logger.log(
      `[CanvasAdapter] Parsed NRPS roster: ${roster.members.length} member(s), context=${roster.context.id ?? 'n/a'}`,
    );
    return roster;
  }

  /**
   * List courses visible to the Canvas API token user.
   * Tries user courses first, then account `self` courses (admin tokens).
   */
  async listCourses(config: LmsSchoolConfig): Promise<LmsCoursesResponse> {
    const { baseUrl, apiToken } = this.requireApiCredentials(config);

    const candidates = [
      `${baseUrl}/api/v1/courses?per_page=100`,
      `${baseUrl}/api/v1/accounts/self/courses?per_page=100`,
    ];

    let lastError: Error | null = null;
    for (const startUrl of candidates) {
      try {
        const rawCourses = await this.fetchAllJsonPages<CanvasCourse>(baseUrl, apiToken, startUrl);
        const courses = rawCourses
          .map((course) => {
            const id = Number(course.id);
            if (!Number.isFinite(id) || id <= 0) {
              return null;
            }
            const workflow = String(course.workflow_state || 'available').toLowerCase();
            return {
              id,
              fullname: typeof course.name === 'string' ? course.name : `Course ${id}`,
              shortname: typeof course.course_code === 'string' ? course.course_code : String(id),
              summary:
                typeof course.public_description === 'string' ? course.public_description : '',
              enrolledcount:
                typeof course.total_students === 'number' ? course.total_students : undefined,
              visible: workflow === 'unpublished' || workflow === 'deleted' ? 0 : 1,
              format: 'topics',
            };
          })
          .filter((course): course is NonNullable<typeof course> => course !== null);

        this.logger.log(
          `[CanvasAdapter] Listed ${courses.length} course(s) via ${startUrl.replace(baseUrl, '')}`,
        );
        return { courses, total: courses.length };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(
          `[CanvasAdapter] listCourses via ${startUrl} failed: ${lastError.message}`,
        );
      }
    }

    throw lastError ?? new Error('Canvas listCourses failed');
  }

  /**
   * Prefer Canvas REST enrollment roles over NRPS roles when API token is configured.
   */
  async enrichRosterRoles(
    config: LmsSchoolConfig,
    nrpsUrl: string,
    roster: LmsRosterResponse,
  ): Promise<LmsRosterResponse> {
    const courseId = extractCourseIdFromNrpsUrl(nrpsUrl);
    if (!courseId || !config.lmsBaseUrl?.trim() || !config.lmsApiToken?.trim()) {
      return roster;
    }

    try {
      const restRoster = await this.fetchRosterFromPlatformWs(config, courseId);
      const rolesByUserId = new Map<string, string[]>();
      for (const member of restRoster.members) {
        if (member.userId && member.roles.length) {
          rolesByUserId.set(member.userId, member.roles);
        }
      }
      if (!rolesByUserId.size) {
        return roster;
      }

      let enrichedCount = 0;
      const members = roster.members.map((member) => {
        const restRoles = rolesByUserId.get(member.userId);
        if (!restRoles?.length) {
          return member;
        }
        enrichedCount += 1;
        return { ...member, roles: restRoles };
      });

      if (enrichedCount > 0) {
        this.logger.log(
          `[CanvasAdapter] Enriched ${enrichedCount} member role(s) from REST for course ${courseId}`,
        );
      }
      return { ...roster, members };
    } catch (err) {
      this.logger.warn(
        `[CanvasAdapter] REST role enrichment skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
      return roster;
    }
  }

  /**
   * Canvas REST fallback when NRPS is unavailable.
   * Uses school `lmsBaseUrl` + `lmsApiToken` (Canvas access token).
   */
  async fetchRosterFromPlatformWs(
    config: LmsSchoolConfig,
    courseId: number,
  ): Promise<LmsRosterResponse> {
    const { baseUrl, apiToken } = this.requireApiCredentials(config);
    if (!Number.isFinite(courseId) || courseId <= 0) {
      throw new Error('Canvas course id is required for REST roster fallback');
    }

    this.logger.log(`[CanvasAdapter] Fetching REST roster for course ${courseId} from ${baseUrl}`);

    const users = await this.fetchAllCourseUsers(baseUrl, apiToken, courseId);
    const members = users
      .map((user) => this.mapCanvasUserToMember(user))
      .filter((member): member is LmsRosterMember => member !== null);

    this.logger.log(
      `[CanvasAdapter] Parsed REST roster: ${members.length} member(s) for course ${courseId}`,
    );

    return {
      context: {
        id: String(courseId),
        label: null,
        title: null,
      },
      members,
    };
  }

  /**
   * Learner-only list for live/provision endpoints that expect Moodle-shaped students.
   */
  async getEnrolledStudentsForCourse(
    config: LmsSchoolConfig,
    courseId: number,
  ): Promise<LmsEnrolledStudentsResponse> {
    const roster = await this.fetchRosterFromPlatformWs(config, courseId);
    const students = roster.members
      .filter((member) => this.isCanvasLearner(member.roles))
      .map((member) => {
        const numericId = Number(member.userId);
        return {
          id: Number.isFinite(numericId) ? numericId : 0,
          username: member.email ?? member.userId,
          fullname: member.name ?? '',
          firstname: '',
          lastname: '',
          email: member.email ?? '',
          profileimageurl: '',
          roles: member.roles.map((role, index) => ({
            roleid: index + 1,
            shortname: role,
          })),
          lastaccess: 0,
        };
      })
      .filter((student) => student.id > 0);

    return {
      courseId,
      courseName: `Course ${courseId}`,
      students,
      total: students.length,
    };
  }

  async getUserEmail(
    config: LmsSchoolConfig,
    lmsUserId: string,
  ): Promise<{ email: string | null; error: string | null }> {
    const baseUrl = config.lmsBaseUrl?.trim().replace(/\/$/, '');
    const apiToken = config.lmsApiToken?.trim();
    const userId = String(lmsUserId || '').trim();

    if (!baseUrl || !apiToken || !userId) {
      return { email: null, error: 'missing_lms_config_or_user_id' };
    }

    try {
      const response = await this.outboundHttp.fetch(
        OutboundIntegration.Lms,
        `${baseUrl}/api/v1/users/${encodeURIComponent(userId)}/profile`,
        {
          headers: { Authorization: `Bearer ${apiToken}` },
        },
      );
      const body = await response.text();
      if (!response.ok) {
        return { email: null, error: `canvas_user_lookup_failed_${response.status}` };
      }

      const raw = JSON.parse(body) as Record<string, unknown>;
      const email =
        (typeof raw['primary_email'] === 'string' && raw['primary_email'].trim()) ||
        (typeof raw['email'] === 'string' && raw['email'].trim()) ||
        (typeof raw['login_id'] === 'string' && raw['login_id'].includes('@')
          ? raw['login_id'].trim()
          : null);

      return { email: email || null, error: email ? null : 'email_not_in_canvas_profile' };
    } catch (err) {
      return {
        email: null,
        error: err instanceof Error ? err.message : 'canvas_user_lookup_exception',
      };
    }
  }

  async fetchMemberProfilesForCourse(
    config: LmsSchoolConfig,
    courseId: string,
  ): Promise<Map<string, LmsMemberProfile>> {
    const profiles = new Map<string, LmsMemberProfile>();
    const courseIdNum = Number(courseId);
    if (!Number.isFinite(courseIdNum) || courseIdNum <= 0) {
      return profiles;
    }

    try {
      const roster = await this.fetchRosterFromPlatformWs(config, courseIdNum);
      for (const member of roster.members) {
        if (!member.userId) continue;
        profiles.set(member.userId, {
          name: member.name,
          email: member.email,
        });
      }
    } catch (err) {
      this.logger.warn(
        `[CanvasAdapter] Member profile fetch skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return profiles;
  }

  private requireApiCredentials(config: LmsSchoolConfig): {
    baseUrl: string;
    apiToken: string;
  } {
    const baseUrl = config.lmsBaseUrl?.trim().replace(/\/$/, '') ?? '';
    const apiToken = config.lmsApiToken?.trim() ?? '';
    if (!baseUrl || !apiToken) {
      throw new Error('lmsBaseUrl and lmsApiToken are required for Canvas REST roster fallback');
    }
    return { baseUrl, apiToken };
  }

  private async fetchAllCourseUsers(
    baseUrl: string,
    apiToken: string,
    courseId: number,
  ): Promise<CanvasUser[]> {
    const startUrl = `${baseUrl}/api/v1/courses/${courseId}/users?include[]=enrollments&per_page=100`;
    return this.fetchAllJsonPages<CanvasUser>(baseUrl, apiToken, startUrl);
  }

  private async fetchAllJsonPages<T>(
    baseUrl: string,
    apiToken: string,
    startUrl: string,
  ): Promise<T[]> {
    const items: T[] = [];
    let nextUrl: string | null = startUrl;

    while (nextUrl) {
      const absoluteUrl = nextUrl.startsWith('http')
        ? nextUrl
        : `${baseUrl}${nextUrl.startsWith('/') ? '' : '/'}${nextUrl}`;
      const response = await this.outboundHttp.fetch(OutboundIntegration.Lms, absoluteUrl, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(`Canvas REST request failed: ${response.status} ${body}`);
      }

      let page: unknown;
      try {
        page = JSON.parse(body);
      } catch {
        throw new Error('Canvas REST returned invalid JSON');
      }

      if (!Array.isArray(page)) {
        throw new Error('Canvas REST returned unexpected payload');
      }

      items.push(...(page as T[]));
      nextUrl = this.parseNextLink(response.headers.get('link'));
    }

    return items;
  }

  /** Parse Canvas `Link` header for `rel="next"`. */
  private parseNextLink(linkHeader: string | null): string | null {
    if (!linkHeader) {
      return null;
    }
    for (const part of linkHeader.split(',')) {
      const match = part.match(/<([^>]+)>\s*;\s*rel="next"/i);
      if (match?.[1]) {
        return match[1];
      }
    }
    return null;
  }

  private mapCanvasUserToMember(user: CanvasUser): LmsRosterMember | null {
    const userId =
      typeof user.id === 'number' || typeof user.id === 'string' ? String(user.id).trim() : '';
    if (!userId) {
      return null;
    }

    const email =
      (typeof user.email === 'string' && user.email.trim()) ||
      (typeof user.login_id === 'string' && user.login_id.includes('@')
        ? user.login_id.trim()
        : null);

    const roles = Array.isArray(user.enrollments)
      ? user.enrollments
          .filter((enrollment) => {
            const state = String(enrollment.enrollment_state || 'active').toLowerCase();
            return state === 'active' || state === 'invited';
          })
          .map((enrollment) =>
            String(enrollment.type || enrollment.role || '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean)
      : [];

    return {
      userId,
      name: typeof user.name === 'string' ? user.name : null,
      email,
      roles,
    };
  }

  private isCanvasLearner(roles: string[]): boolean {
    const normalized = roles.map((role) => role.toLowerCase());
    const hasStudent = normalized.some(
      (role) => role.includes('student') || role.includes('learner'),
    );
    const hasTeacher = normalized.some(
      (role) =>
        role.includes('teacher') ||
        role.includes('taenrollment') ||
        role.includes('designer') ||
        role.includes('admin'),
    );
    return hasStudent && !hasTeacher;
  }
}
