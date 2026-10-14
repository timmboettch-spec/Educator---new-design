import { BadRequestException, GatewayTimeoutException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleClassroomService } from '../../../src/google/google-classroom.service';
import { GoogleConstants } from '../../../src/google/google.constants';
import { LoggerService } from '../../../src/common/services';
import { OutboundIntegration } from '../../../src/common/constants';
import { createOutboundHttpStub } from '../helpers/outbound-http.stub';

describe('GoogleClassroomService', () => {
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'google.classroomCoursesUrl') {
        return 'https://classroom.googleapis.com/v1/courses';
      }
      return undefined;
    }),
  } as unknown as ConfigService;

  const logger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  } as unknown as LoggerService;

  let service: GoogleClassroomService;
  let outbound: ReturnType<typeof createOutboundHttpStub>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    outbound = createOutboundHttpStub();
    service = new GoogleClassroomService(configService, logger, outbound.client);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('routes every call through the outbound client as the Google integration', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ courses: [] }),
    });

    await service.listCourses('access-token');

    expect(outbound.integrations).toEqual([OutboundIntegration.Google]);
  });

  it('lists teacher courses and maps fields', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          courses: [
            {
              id: 'course-1',
              name: 'Realityworks Classroom Test Course',
              section: 'Period 1',
              courseState: 'ACTIVE',
              enrollmentState: 'ACTIVE',
              alternateLink: 'https://classroom.google.com/c/abc',
            },
          ],
        }),
    });

    const courses = await service.listCourses('access-token');

    expect(courses).toEqual([
      {
        id: 'course-1',
        name: 'Realityworks Classroom Test Course',
        section: 'Period 1',
        descriptionHeading: null,
        room: null,
        courseState: 'ACTIVE',
        enrollmentState: 'ACTIVE',
        alternateLink: 'https://classroom.google.com/c/abc',
        ownerId: null,
      },
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('teacherId=me'),
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer access-token' },
      }),
    );
  });

  it('paginates through nextPageToken', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            courses: [{ id: 'c1', name: 'One' }],
            nextPageToken: 'page-2',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            courses: [{ id: 'c2', name: 'Two' }],
          }),
      });

    const courses = await service.listCourses('access-token');
    expect(courses.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws REAUTH_REQUIRED on 401', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('unauthorized'),
    });

    await expect(service.listCourses('bad-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.listCourses('bad-token')).rejects.toThrow(
      GoogleConstants.MESSAGES.REAUTH_REQUIRED,
    );
  });

  it('throws BadRequest on non-auth API failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('boom'),
    });

    await expect(service.listCourses('access-token')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('fetches roster students using profile id and email', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          students: [
            {
              userId: 'g-1',
              profile: {
                id: 'g-1',
                emailAddress: 'gc-student1@curionn.com',
                name: { fullName: 'GC Student 1' },
              },
            },
            {
              profile: { emailAddress: 'missing-id@curionn.com' },
            },
          ],
        }),
    });

    const roster = await service.fetchRoster('access-token', 'course-1');

    expect(roster).toEqual([
      {
        googleUserId: 'g-1',
        googleEmail: 'gc-student1@curionn.com',
        googleName: 'GC Student 1',
      },
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/courses/course-1/students'),
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer access-token' },
      }),
    );
  });

  it('paginates roster through nextPageToken', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            students: [
              {
                userId: 'g-1',
                profile: { id: 'g-1', emailAddress: 'gc-student1@curionn.com' },
              },
            ],
            nextPageToken: 'page-2',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            students: [
              {
                userId: 'g-2',
                profile: { id: 'g-2', emailAddress: 'gc-student2@curionn.com' },
              },
            ],
          }),
      });

    const roster = await service.fetchRoster('access-token', 'course-1');
    expect(roster.map((s) => s.googleUserId)).toEqual(['g-1', 'g-2']);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toContain('pageToken=page-2');
  });

  it('throws REAUTH_REQUIRED when roster fetch is unauthorized', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('unauthorized'),
    });

    await expect(service.fetchRoster('bad-token', 'course-1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.fetchRoster('bad-token', 'course-1')).rejects.toThrow(
      GoogleConstants.MESSAGES.REAUTH_REQUIRED,
    );
  });

  it('throws REAUTH_REQUIRED when roster fetch is forbidden', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve('forbidden'),
    });

    await expect(service.fetchRoster('bad-token', 'course-1')).rejects.toThrow(
      GoogleConstants.MESSAGES.REAUTH_REQUIRED,
    );
  });

  it('creates published coursework with link material', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: 'cw-1',
          title: 'Trauma Sim',
          alternateLink: 'https://classroom.google.com/c/x/a/y',
          state: 'PUBLISHED',
          workType: 'ASSIGNMENT',
          maxPoints: 100,
        }),
    });

    const result = await service.createCourseWork('access-token', 'course-1', {
      title: 'Trauma Sim',
      launchLink:
        'http://localhost:3000/api/auth/google/classroom/launch?simulationId=sim-1&googleCourseId=course-1',
      maxPoints: 100,
      dueDate: new Date(2026, 8, 15),
    });

    expect(result).toEqual({
      id: 'cw-1',
      title: 'Trauma Sim',
      alternateLink: 'https://classroom.google.com/c/x/a/y',
      state: 'PUBLISHED',
      workType: 'ASSIGNMENT',
      maxPoints: 100,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://classroom.googleapis.com/v1/courses/course-1/courseWork',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.workType).toBe('ASSIGNMENT');
    expect(body.state).toBe('PUBLISHED');
    expect(body.dueDate).toEqual({ year: 2026, month: 9, day: 15 });
    expect(body.materials[0].link.url).toContain(
      'auth/google/classroom/launch?simulationId=sim-1',
    );
  });

  it('lists student submissions filtered by userId', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          studentSubmissions: [
            {
              id: 'sub-1',
              userId: 'google-user-1',
              state: 'TURNED_IN',
              assignedGrade: null,
              draftGrade: null,
            },
          ],
        }),
    });

    const rows = await service.listStudentSubmissions(
      'access-token',
      'course-1',
      'cw-1',
      'google-user-1',
    );

    expect(rows).toEqual([
      {
        id: 'sub-1',
        userId: 'google-user-1',
        state: 'TURNED_IN',
        assignedGrade: null,
        draftGrade: null,
      },
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('userId=google-user-1'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('patches assigned and draft grades', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: 'sub-1',
          userId: 'google-user-1',
          assignedGrade: 92,
          draftGrade: 92,
          state: 'RETURNED',
        }),
    });

    const result = await service.patchStudentSubmission(
      'access-token',
      'course-1',
      'cw-1',
      'sub-1',
      { assignedGrade: 92, draftGrade: 92 },
    );

    expect(result.assignedGrade).toBe(92);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('updateMask=assignedGrade,draftGrade'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('returns a student submission', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    });

    await expect(
      service.returnStudentSubmission('access-token', 'course-1', 'cw-1', 'sub-1'),
    ).resolves.toBeUndefined();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('studentSubmissions/sub-1:return'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('does not retry a timed-out patch', async () => {
    global.fetch = jest.fn().mockRejectedValue(new GatewayTimeoutException('timed out'));

    await expect(
      service.patchStudentSubmission('access-token', 'course-1', 'cw-1', 'sub-1', {
        assignedGrade: 80,
        draftGrade: 80,
      }),
    ).rejects.toBeInstanceOf(GatewayTimeoutException);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries transient 500 then succeeds for patch', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('temp'),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'sub-1',
            assignedGrade: 80,
            draftGrade: 80,
          }),
      });

    const result = await service.patchStudentSubmission(
      'access-token',
      'course-1',
      'cw-1',
      'sub-1',
      { assignedGrade: 80, draftGrade: 80 },
    );

    expect(result.assignedGrade).toBe(80);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
