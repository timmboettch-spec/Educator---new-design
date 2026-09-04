import { Injectable } from '@nestjs/common';
import {
  LmsAdapter,
  MoodleCoursesResponse,
  MoodleStudentsResponse,
  LmsRosterResponse,
} from '../interfaces/lms.interfaces';

@Injectable()
export class LMSAdapter implements LmsAdapter {
  constructor() {}

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
    return (
      role.includes('student') ||
      role.includes('learner') ||
      role.includes('participant')
    );
  }

  async getEnrolledStudents(moodleUrl: string, wsToken: string, courseId: number): Promise<MoodleStudentsResponse> {
    if (!moodleUrl || !wsToken) {
      throw new Error('moodleUrl and wsToken are required');
    }
    const base = moodleUrl.trim().replace(/\/$/, '');
    const url = `${base}/webservice/rest/server.php?wstoken=${wsToken}&wsfunction=core_enrol_get_enrolled_users&courseid=${courseId}&moodlewsrestformat=json`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Moodle API error (${response.status})`);
    }

    const data = (await response.json()) as unknown;
    if (!Array.isArray(data)) {
      const err = data as Record<string, unknown>;
      const msg = typeof err['message'] === 'string' ? err['message'] : 'unknown';
      throw new Error(`Moodle error: ${msg}`);
    }

    const allUsers = data as Array<Record<string, unknown>>;
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

    const courseInfo = await this.getCourseInfo(base, wsToken, courseId);

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

  private async getCourseInfo(base: string, wsToken: string, courseId: number): Promise<string> {
    try {
      const url = `${base}/webservice/rest/server.php?wstoken=${wsToken}&wsfunction=core_course_get_courses&options[ids][0]=${courseId}&moodlewsrestformat=json`;
      const response = await fetch(url);
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
    const response = await fetch(url);
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

  async fetchRoster(nrpsUrl: string, accessToken: string): Promise<LmsRosterResponse> {
    const response = await fetch(nrpsUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.ims.lti-nrps.v2.membershipcontainer+json',
      },
    });

    const body = await response.text();

    if (!response.ok) {
      throw new Error(`NRPS failed: ${response.status} ${body}`);
    }

    const raw = JSON.parse(body) as Record<string, unknown>;

    const rawContext = (raw['context'] ?? {}) as Record<string, unknown>;
    const context = {
      id: typeof rawContext['id'] === 'string' ? rawContext['id'] : typeof rawContext['id'] === 'number' ? String(rawContext['id']) : null,
      label: typeof rawContext['label'] === 'string' ? rawContext['label'] : null,
      title: typeof rawContext['title'] === 'string' ? rawContext['title'] : null,
    };

    const rawMembers = Array.isArray(raw['members']) ? (raw['members'] as Array<Record<string, unknown>>) : [];
    const members = rawMembers.map((m) => ({
      userId: typeof m['user_id'] === 'string' ? m['user_id'] : typeof m['user_id'] === 'number' ? String(m['user_id']) : '',
      name: typeof m['name'] === 'string' ? m['name'] : null,
      email: typeof m['email'] === 'string' ? m['email'] : null,
      roles: Array.isArray(m['roles']) ? (m['roles'] as string[]) : [],
    }));

    return { context, members };
  }

  async getUserEmailByMoodleId(
    moodleBaseUrl: string,
    wsToken: string,
    moodleUserId: string,
  ): Promise<{ email: string | null; error: string | null }> {
    if (!moodleBaseUrl || !wsToken || !moodleUserId) {
      return { email: null, error: 'missing_params' };
    }
    const base = moodleBaseUrl.trim().replace(/\/$/, '');
    const result1 = await this.callUserByField(base, wsToken, moodleUserId);
    if (result1.email) return result1;
    const result2 = await this.callGetUsers(base, wsToken, moodleUserId);
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
      const response = await fetch(url);
      const raw = await response.text();
      const data = JSON.parse(raw) as unknown;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const err = data as Record<string, unknown>;
        if (err['exception'] || err['errorcode']) {
          const msg = typeof err['message'] === 'string' ? err['message'] : typeof err['errorcode'] === 'string' ? err['errorcode'] : 'unknown';
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
      const response = await fetch(url);
      const raw = await response.text();
      const data = JSON.parse(raw) as unknown;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const obj = data as Record<string, unknown>;
        if (obj['exception'] || obj['errorcode']) {
          const msg = typeof obj['message'] === 'string' ? obj['message'] : typeof obj['errorcode'] === 'string' ? obj['errorcode'] : 'unknown';
          return { email: null, error: `ws_get_users: ${msg}` };
        }
        const users = obj['users'];
        if (Array.isArray(users) && users.length > 0) {
          const user = (users as Array<Record<string, unknown>>)[0];
          const email = user['email'];
          return {
            email: typeof email === 'string' && email.includes('@') ? email.toLowerCase().trim() : null,
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
}
