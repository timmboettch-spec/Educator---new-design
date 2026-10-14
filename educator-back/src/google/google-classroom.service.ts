import {
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboundIntegration } from 'src/common/constants';
import { LoggerService, OutboundHttpClient } from 'src/common/services';
import { GoogleConstants } from './google.constants';

export interface GoogleClassroomCourse {
  id: string;
  name: string;
  section: string | null;
  descriptionHeading: string | null;
  room: string | null;
  courseState: string | null;
  enrollmentState: string | null;
  alternateLink: string | null;
  /** Classroom course owner (teacher) Google user id — used to hide unlinked co-taught courses. */
  ownerId: string | null;
}

export interface CreateGoogleCourseWorkInput {
  title: string;
  description?: string;
  /** Role-aware launch URL (teachers → educator portal, students → HS Online). */
  launchLink: string;
  maxPoints?: number;
  dueDate?: Date | null;
}

export interface GoogleClassroomCourseWork {
  id: string;
  title: string;
  alternateLink: string | null;
  state: string | null;
  workType: string | null;
  maxPoints: number | null;
}

export interface GoogleClassroomRosterStudent {
  googleUserId: string;
  googleEmail: string | null;
  googleName: string | null;
}

export interface GoogleClassroomStudentSubmission {
  id: string;
  userId: string | null;
  state: string | null;
  assignedGrade: number | null;
  draftGrade: number | null;
}

@Injectable()
export class GoogleClassroomService {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly outboundHttp: OutboundHttpClient,
  ) {}

  /**
   * Lists courses where the connected Google account is a teacher.
   * Uses Classroom courses.list with teacherId=me (requires classroom.courses scope).
   */
  async listCourses(accessToken: string): Promise<GoogleClassroomCourse[]> {
    const coursesUrl =
      this.configService.get<string>('google.classroomCoursesUrl') ||
      'https://classroom.googleapis.com/v1/courses';

    const courses: GoogleClassroomCourse[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(coursesUrl);
      url.searchParams.set('teacherId', 'me');
      url.searchParams.set('pageSize', '100');
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }

      const response = await this.outboundHttp.fetch(OutboundIntegration.Google, url.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (response.status === 401 || response.status === 403) {
        this.logger.warn(
          `[Google Classroom] courses.list unauthorized (HTTP ${response.status})`,
        );
        throw new UnauthorizedException(GoogleConstants.MESSAGES.REAUTH_REQUIRED);
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        this.logger.warn(
          `[Google Classroom] courses.list failed HTTP ${response.status}: ${detail.slice(0, 200)}`,
        );
        throw new BadRequestException(GoogleConstants.MESSAGES.COURSES_LIST_FAILED);
      }

      const payload = (await response.json()) as {
        courses?: Array<Record<string, unknown>>;
        nextPageToken?: string;
      };

      for (const raw of payload.courses ?? []) {
        const id = typeof raw.id === 'string' ? raw.id : null;
        if (!id) continue;
        courses.push({
          id,
          name: typeof raw.name === 'string' ? raw.name : id,
          section: typeof raw.section === 'string' ? raw.section : null,
          descriptionHeading:
            typeof raw.descriptionHeading === 'string' ? raw.descriptionHeading : null,
          room: typeof raw.room === 'string' ? raw.room : null,
          courseState: typeof raw.courseState === 'string' ? raw.courseState : null,
          enrollmentState:
            typeof raw.enrollmentState === 'string' ? raw.enrollmentState : null,
          alternateLink: typeof raw.alternateLink === 'string' ? raw.alternateLink : null,
          ownerId: typeof raw.ownerId === 'string' ? raw.ownerId : null,
        });
      }

      pageToken =
        typeof payload.nextPageToken === 'string' && payload.nextPageToken
          ? payload.nextPageToken
          : undefined;
    } while (pageToken);

    return courses;
  }

  /**
   * Fetches a single Classroom course (includes ownerId for ownership checks).
   */
  async getCourse(accessToken: string, googleCourseId: string): Promise<GoogleClassroomCourse> {
    const courseId = googleCourseId.trim();
    if (!courseId) {
      throw new BadRequestException(GoogleConstants.MESSAGES.COURSES_LIST_FAILED);
    }

    const coursesUrl =
      this.configService.get<string>('google.classroomCoursesUrl') ||
      'https://classroom.googleapis.com/v1/courses';
    const url = `${coursesUrl.replace(/\/+$/, '')}/${encodeURIComponent(courseId)}`;

    const response = await this.outboundHttp.fetch(OutboundIntegration.Google, url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 401 || response.status === 403) {
      this.logger.warn(
        `[Google Classroom] courses.get unauthorized (HTTP ${response.status})`,
      );
      throw new UnauthorizedException(GoogleConstants.MESSAGES.REAUTH_REQUIRED);
    }

    if (response.status === 404) {
      throw new BadRequestException(GoogleConstants.MESSAGES.COURSES_LIST_FAILED);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.warn(
        `[Google Classroom] courses.get failed HTTP ${response.status}: ${detail.slice(0, 200)}`,
      );
      throw new BadRequestException(GoogleConstants.MESSAGES.COURSES_LIST_FAILED);
    }

    const raw = (await response.json()) as Record<string, unknown>;
    const id = typeof raw.id === 'string' ? raw.id : null;
    if (!id) {
      throw new BadRequestException(GoogleConstants.MESSAGES.COURSES_LIST_FAILED);
    }

    return {
      id,
      name: typeof raw.name === 'string' ? raw.name : id,
      section: typeof raw.section === 'string' ? raw.section : null,
      descriptionHeading:
        typeof raw.descriptionHeading === 'string' ? raw.descriptionHeading : null,
      room: typeof raw.room === 'string' ? raw.room : null,
      courseState: typeof raw.courseState === 'string' ? raw.courseState : null,
      enrollmentState: typeof raw.enrollmentState === 'string' ? raw.enrollmentState : null,
      alternateLink: typeof raw.alternateLink === 'string' ? raw.alternateLink : null,
      ownerId: typeof raw.ownerId === 'string' ? raw.ownerId : null,
    };
  }

  /**
   * Lists students enrolled in a Google Classroom course (paginated).
   * Requires classroom.rosters; email needs classroom.profile.emails.
   */
  async fetchRoster(
    accessToken: string,
    googleCourseId: string,
  ): Promise<GoogleClassroomRosterStudent[]> {
    const courseId = googleCourseId.trim();
    if (!courseId) {
      throw new BadRequestException(GoogleConstants.MESSAGES.ROSTER_LIST_FAILED);
    }

    const baseUrl =
      this.configService.get<string>('google.classroomCoursesUrl') ||
      'https://classroom.googleapis.com/v1/courses';
    const studentsUrl = `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(courseId)}/students`;

    const students: GoogleClassroomRosterStudent[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(studentsUrl);
      url.searchParams.set('pageSize', '100');
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }

      const response = await this.outboundHttp.fetch(OutboundIntegration.Google, url.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (response.status === 401 || response.status === 403) {
        this.logger.warn(
          `[Google Classroom] courses.students.list unauthorized (HTTP ${response.status})`,
        );
        throw new UnauthorizedException(GoogleConstants.MESSAGES.REAUTH_REQUIRED);
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        this.logger.warn(
          `[Google Classroom] courses.students.list failed HTTP ${response.status}: ${detail.slice(0, 200)}`,
        );
        throw new BadRequestException(GoogleConstants.MESSAGES.ROSTER_LIST_FAILED);
      }

      const payload = (await response.json()) as {
        students?: Array<Record<string, unknown>>;
        nextPageToken?: string;
      };

      for (const raw of payload.students ?? []) {
        const mapped = this.mapRosterStudent(raw);
        if (mapped) {
          students.push(mapped);
        }
      }

      pageToken =
        typeof payload.nextPageToken === 'string' && payload.nextPageToken
          ? payload.nextPageToken
          : undefined;
    } while (pageToken);

    return students;
  }

  private mapRosterStudent(raw: Record<string, unknown>): GoogleClassroomRosterStudent | null {
    const profile =
      raw.profile && typeof raw.profile === 'object'
        ? (raw.profile as Record<string, unknown>)
        : null;
    const profileId = typeof profile?.id === 'string' ? profile.id.trim() : '';
    const userId = typeof raw.userId === 'string' ? raw.userId.trim() : '';
    const googleUserId = profileId || userId;
    if (!googleUserId) {
      return null;
    }

    const name =
      profile?.name && typeof profile.name === 'object'
        ? (profile.name as Record<string, unknown>)
        : null;
    const googleName =
      typeof name?.fullName === 'string' && name.fullName.trim()
        ? name.fullName.trim()
        : null;
    const googleEmail =
      typeof profile?.emailAddress === 'string' && profile.emailAddress.trim()
        ? profile.emailAddress.trim()
        : null;

    return { googleUserId, googleEmail, googleName };
  }

  /**
   * Creates a published ASSIGNMENT CourseWork in a Google Classroom course.
   * Requires classroom.coursework.students scope.
   */
  async createCourseWork(
    accessToken: string,
    courseId: string,
    input: CreateGoogleCourseWorkInput,
  ): Promise<GoogleClassroomCourseWork> {
    const baseUrl =
      this.configService.get<string>('google.classroomCoursesUrl') ||
      'https://classroom.googleapis.com/v1/courses';
    const url = `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(courseId)}/courseWork`;

    const body: Record<string, unknown> = {
      title: input.title.trim(),
      description:
        input.description?.trim() ||
        'Click Open Simulation. Teachers open the educator portal; students open the student app (same button — Google signs you in and routes by account).',
      workType: 'ASSIGNMENT',
      state: 'PUBLISHED',
      maxPoints: input.maxPoints ?? 100,
      // Classroom only supports link materials (not custom HTML buttons). One CTA
      // for everyone; backend /classroom/launch routes by Google login role.
      materials: [
        {
          link: {
            url: input.launchLink,
            title: 'Open Simulation',
          },
        },
      ],
    };

    if (input.dueDate && !Number.isNaN(input.dueDate.getTime())) {
      body.dueDate = {
        year: input.dueDate.getFullYear(),
        month: input.dueDate.getMonth() + 1,
        day: input.dueDate.getDate(),
      };
      body.dueTime = { hours: 23, minutes: 59 };
    }

    const response = await this.outboundHttp.fetch(OutboundIntegration.Google, url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (response.status === 401 || response.status === 403) {
      this.logger.warn(
        `[Google Classroom] courseWork.create unauthorized (HTTP ${response.status})`,
      );
      throw new UnauthorizedException(GoogleConstants.MESSAGES.REAUTH_REQUIRED);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.warn(
        `[Google Classroom] courseWork.create failed HTTP ${response.status}: ${detail.slice(0, 300)}`,
      );
      throw new BadRequestException(GoogleConstants.MESSAGES.COURSEWORK_CREATE_FAILED);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const id = typeof payload.id === 'string' ? payload.id : '';
    if (!id) {
      throw new BadRequestException(GoogleConstants.MESSAGES.COURSEWORK_CREATE_FAILED);
    }

    return {
      id,
      title: typeof payload.title === 'string' ? payload.title : input.title,
      alternateLink:
        typeof payload.alternateLink === 'string' ? payload.alternateLink : null,
      state: typeof payload.state === 'string' ? payload.state : null,
      workType: typeof payload.workType === 'string' ? payload.workType : null,
      maxPoints: typeof payload.maxPoints === 'number' ? payload.maxPoints : null,
    };
  }

  /**
   * Deletes CourseWork created by this OAuth project.
   * Requires classroom.coursework.students scope.
   */
  async deleteCourseWork(
    accessToken: string,
    courseId: string,
    courseWorkId: string,
  ): Promise<void> {
    const baseUrl =
      this.configService.get<string>('google.classroomCoursesUrl') ||
      'https://classroom.googleapis.com/v1/courses';
    const url = `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(courseId)}/courseWork/${encodeURIComponent(courseWorkId)}`;

    const response = await this.outboundHttp.fetch(OutboundIntegration.Google, url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 401 || response.status === 403) {
      this.logger.warn(
        `[Google Classroom] courseWork.delete unauthorized (HTTP ${response.status})`,
      );
      throw new UnauthorizedException(GoogleConstants.MESSAGES.REAUTH_REQUIRED);
    }

    // Already gone in Classroom — treat as success for idempotent cleanup.
    if (response.status === 404 || response.status === 410) {
      return;
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      // FAILED_PRECONDITION when already deleted
      if (response.status === 400 && detail.toLowerCase().includes('deleted')) {
        return;
      }
      this.logger.warn(
        `[Google Classroom] courseWork.delete failed HTTP ${response.status}: ${detail.slice(0, 300)}`,
      );
      throw new BadRequestException(GoogleConstants.MESSAGES.COURSEWORK_DELETE_FAILED);
    }
  }

  /**
   * Lists student submissions for a CourseWork, optionally filtered by Google user id.
   * Requires classroom.student-submissions.students.readonly (or coursework.students).
   */
  async listStudentSubmissions(
    accessToken: string,
    courseId: string,
    courseWorkId: string,
    googleUserId?: string,
  ): Promise<GoogleClassroomStudentSubmission[]> {
    const cid = courseId.trim();
    const cwid = courseWorkId.trim();
    if (!cid || !cwid) {
      throw new BadRequestException(GoogleConstants.MESSAGES.GRADE_PASSBACK_FAILED);
    }

    const baseUrl = this.coursesBaseUrl();
    const listUrl =
      `${baseUrl}/${encodeURIComponent(cid)}/courseWork/${encodeURIComponent(cwid)}/studentSubmissions`;

    const submissions: GoogleClassroomStudentSubmission[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(listUrl);
      url.searchParams.set('pageSize', '100');
      if (googleUserId?.trim()) {
        url.searchParams.set('userId', googleUserId.trim());
      }
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }

      const response = await this.fetchWithRetry(url.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      this.throwIfAuthFailed(response, 'studentSubmissions.list');
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        this.logger.warn(
          `[Google Classroom] studentSubmissions.list failed HTTP ${response.status}: ${detail.slice(0, 300)}`,
        );
        throw new BadRequestException(GoogleConstants.MESSAGES.GRADE_PASSBACK_FAILED);
      }

      const payload = (await response.json()) as {
        studentSubmissions?: Array<Record<string, unknown>>;
        nextPageToken?: string;
      };

      for (const raw of payload.studentSubmissions ?? []) {
        const id = typeof raw.id === 'string' ? raw.id : '';
        if (!id) continue;
        submissions.push({
          id,
          userId: typeof raw.userId === 'string' ? raw.userId : null,
          state: typeof raw.state === 'string' ? raw.state : null,
          assignedGrade: typeof raw.assignedGrade === 'number' ? raw.assignedGrade : null,
          draftGrade: typeof raw.draftGrade === 'number' ? raw.draftGrade : null,
        });
      }

      pageToken =
        typeof payload.nextPageToken === 'string' && payload.nextPageToken
          ? payload.nextPageToken
          : undefined;
    } while (pageToken);

    return submissions;
  }

  /**
   * Patches assignedGrade + draftGrade on a student submission (teacher token).
   */
  async patchStudentSubmission(
    accessToken: string,
    courseId: string,
    courseWorkId: string,
    submissionId: string,
    grades: { assignedGrade: number; draftGrade: number },
  ): Promise<GoogleClassroomStudentSubmission> {
    const cid = courseId.trim();
    const cwid = courseWorkId.trim();
    const sid = submissionId.trim();
    if (!cid || !cwid || !sid) {
      throw new BadRequestException(GoogleConstants.MESSAGES.GRADE_PASSBACK_FAILED);
    }

    const baseUrl = this.coursesBaseUrl();
    const url =
      `${baseUrl}/${encodeURIComponent(cid)}/courseWork/${encodeURIComponent(cwid)}` +
      `/studentSubmissions/${encodeURIComponent(sid)}?updateMask=assignedGrade,draftGrade`;

    const response = await this.fetchWithRetry(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assignedGrade: grades.assignedGrade,
        draftGrade: grades.draftGrade,
      }),
    });

    this.throwIfAuthFailed(response, 'studentSubmissions.patch');
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.warn(
        `[Google Classroom] studentSubmissions.patch failed HTTP ${response.status}: ${detail.slice(0, 300)}`,
      );
      throw new BadRequestException(GoogleConstants.MESSAGES.GRADE_PASSBACK_FAILED);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    return {
      id: typeof payload.id === 'string' ? payload.id : sid,
      userId: typeof payload.userId === 'string' ? payload.userId : null,
      state: typeof payload.state === 'string' ? payload.state : null,
      assignedGrade: typeof payload.assignedGrade === 'number' ? payload.assignedGrade : grades.assignedGrade,
      draftGrade: typeof payload.draftGrade === 'number' ? payload.draftGrade : grades.draftGrade,
    };
  }

  /**
   * Returns a graded submission so the score is visible in the Classroom gradebook.
   */
  async returnStudentSubmission(
    accessToken: string,
    courseId: string,
    courseWorkId: string,
    submissionId: string,
  ): Promise<void> {
    const cid = courseId.trim();
    const cwid = courseWorkId.trim();
    const sid = submissionId.trim();
    if (!cid || !cwid || !sid) {
      throw new BadRequestException(GoogleConstants.MESSAGES.GRADE_PASSBACK_FAILED);
    }

    const baseUrl = this.coursesBaseUrl();
    const url =
      `${baseUrl}/${encodeURIComponent(cid)}/courseWork/${encodeURIComponent(cwid)}` +
      `/studentSubmissions/${encodeURIComponent(sid)}:return`;

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });

    this.throwIfAuthFailed(response, 'studentSubmissions.return');
    // Already returned — treat as success for idempotent passback.
    if (response.status === 400) {
      const detail = await response.text().catch(() => '');
      if (detail.toLowerCase().includes('already') || detail.toLowerCase().includes('returned')) {
        return;
      }
      this.logger.warn(
        `[Google Classroom] studentSubmissions.return failed HTTP 400: ${detail.slice(0, 300)}`,
      );
      throw new BadRequestException(GoogleConstants.MESSAGES.GRADE_PASSBACK_FAILED);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.warn(
        `[Google Classroom] studentSubmissions.return failed HTTP ${response.status}: ${detail.slice(0, 300)}`,
      );
      throw new BadRequestException(GoogleConstants.MESSAGES.GRADE_PASSBACK_FAILED);
    }
  }

  private coursesBaseUrl(): string {
    return (
      this.configService.get<string>('google.classroomCoursesUrl') ||
      'https://classroom.googleapis.com/v1/courses'
    ).replace(/\/+$/, '');
  }

  private throwIfAuthFailed(response: Response, operation: string): void {
    if (response.status === 401 || response.status === 403) {
      this.logger.warn(
        `[Google Classroom] ${operation} unauthorized (HTTP ${response.status})`,
      );
      throw new UnauthorizedException(GoogleConstants.MESSAGES.REAUTH_REQUIRED);
    }
  }

  /** Retry transient 429/5xx responses (does not retry auth or permanent 4xx). */
  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    attempts = GoogleConstants.OAUTH.TOKEN_RETRY_ATTEMPTS,
  ): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await this.outboundHttp.fetch(OutboundIntegration.Google, url, init);
        const transient =
          response.status === 429 || (response.status >= 500 && response.status <= 599);
        if (transient && attempt < attempts) {
          this.logger.warn(
            `[Google Classroom] transient HTTP ${response.status} on attempt ${attempt}/${attempts}; retrying`,
          );
          await this.delay(GoogleConstants.OAUTH.TOKEN_RETRY_BASE_DELAY_MS * attempt);
          continue;
        }
        return response;
      } catch (err) {
        if (err instanceof GatewayTimeoutException) throw err;
        lastError = err;
        if (attempt < attempts) {
          await this.delay(GoogleConstants.OAUTH.TOKEN_RETRY_BASE_DELAY_MS * attempt);
          continue;
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new BadRequestException(GoogleConstants.MESSAGES.GRADE_PASSBACK_FAILED);
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
