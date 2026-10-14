import { createOutboundHttpStub } from '../helpers/outbound-http.stub';
import { CanvasAdapter } from '../../../src/lms/adapters/canvas.adapter';

/** Minimal Canvas-shaped NRPS v2 membership container fixture. */
const CANVAS_NRPS_FIXTURE = {
  id: 'https://canvas.instructure.com/api/lti/courses/123/names_and_roles',
  context: {
    id: '123',
    label: 'BIO101',
    title: 'Intro Biology',
  },
  members: [
    {
      status: 'Active',
      name: 'Ada Teacher',
      email: 'ada@school.edu',
      user_id: '535fa085f22b4655f48cd5a36a9215f64c062838',
      roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
    },
    {
      status: 'Active',
      name: 'Bob Student',
      email: 'bob@school.edu',
      user_id: 'a1b2c3d4e5f6478901234567890abcde',
      roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
    },
    {
      status: 'Active',
      name: 'Cara TA',
      email: 'cara@school.edu',
      user_id: 42,
      roles: [
        'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
        'http://purl.imsglobal.org/vocab/lis/v2/membership/Instructor#TeachingAssistant',
      ],
    },
  ],
};

describe('CanvasAdapter', () => {
  let adapter: CanvasAdapter;
  let outbound: ReturnType<typeof createOutboundHttpStub>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    outbound = createOutboundHttpStub();
    adapter = new CanvasAdapter(outbound.client);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  describe('fetchRoster', () => {
    it('fetches and parses a Canvas NRPS membership container', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(CANVAS_NRPS_FIXTURE),
      });

      const result = await adapter.fetchRoster(
        'https://canvas.instructure.com/api/lti/courses/123/names_and_roles',
        'canvas-access-token',
      );

      expect(global.fetch).toHaveBeenCalledWith(
        'https://canvas.instructure.com/api/lti/courses/123/names_and_roles',
        {
          headers: {
            Authorization: 'Bearer canvas-access-token',
            Accept: 'application/vnd.ims.lti-nrps.v2.membershipcontainer+json',
          },
        },
      );

      expect(result.context).toEqual({
        id: '123',
        label: 'BIO101',
        title: 'Intro Biology',
      });
      expect(result.members).toHaveLength(3);
      expect(result.members[0]).toEqual({
        userId: '535fa085f22b4655f48cd5a36a9215f64c062838',
        name: 'Ada Teacher',
        email: 'ada@school.edu',
        roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
      });
      expect(result.members[1].roles).toContain(
        'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
      );
      expect(result.members[2].userId).toBe('42');
    });

    it('returns empty members when Canvas omits the members array', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            context: { id: '99', label: null, title: 'Empty Course' },
          }),
      });

      const result = await adapter.fetchRoster(
        'https://canvas.test.instructure.com/api/lti/courses/99/names_and_roles',
        'token',
      );

      expect(result.context.title).toBe('Empty Course');
      expect(result.members).toEqual([]);
    });

    it('throws when nrpsUrl is missing', async () => {
      await expect(adapter.fetchRoster('', 'token')).rejects.toThrow('Canvas NRPS URL is required');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('throws when accessToken is missing', async () => {
      await expect(adapter.fetchRoster('https://canvas.example/nrps', '')).rejects.toThrow(
        'Canvas NRPS access token is required',
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('throws when Canvas returns a non-OK status', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'forbidden',
      });

      await expect(adapter.fetchRoster('https://canvas.example/nrps', 'token')).rejects.toThrow(
        'Canvas NRPS failed: 403 forbidden',
      );
    });

    it('throws when Canvas returns invalid JSON', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => '<html>not-json</html>',
      });

      await expect(adapter.fetchRoster('https://canvas.example/nrps', 'token')).rejects.toThrow(
        'Canvas NRPS returned invalid JSON',
      );
    });
  });

  describe('fetchRosterFromPlatformWs', () => {
    const config = {
      lmsBaseUrl: 'https://rwthrive.instructure.com',
      lmsApiToken: 'canvas-api-token',
    } as never;

    it('fetches and maps Canvas REST course users into roster members', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify([
            {
              id: 120,
              name: 'Usman Ahmad',
              email: 'Usman.Ahmad@rwthrive.com',
              login_id: 'Usman.Ahmad@rwthrive.com',
              enrollments: [
                {
                  type: 'TeacherEnrollment',
                  role: 'TeacherEnrollment',
                  enrollment_state: 'active',
                },
              ],
            },
            {
              id: 121,
              name: 'Student One',
              email: 'student@rwthrive.com',
              enrollments: [
                {
                  type: 'StudentEnrollment',
                  role: 'StudentEnrollment',
                  enrollment_state: 'active',
                },
              ],
            },
          ]),
      });

      const result = await adapter.fetchRosterFromPlatformWs(config, 108);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://rwthrive.instructure.com/api/v1/courses/108/users?include[]=enrollments&per_page=100',
        {
          headers: { Authorization: 'Bearer canvas-api-token' },
        },
      );
      expect(result.context.id).toBe('108');
      expect(result.members).toHaveLength(2);
      expect(result.members[0]).toEqual({
        userId: '120',
        name: 'Usman Ahmad',
        email: 'Usman.Ahmad@rwthrive.com',
        roles: ['teacherenrollment'],
      });
      expect(result.members[1].roles).toContain('studentenrollment');
    });

    it('follows Canvas Link rel=next pagination', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: (name: string) =>
              name.toLowerCase() === 'link'
                ? '<https://rwthrive.instructure.com/api/v1/courses/108/users?page=2&per_page=100>; rel="next"'
                : null,
          },
          text: async () =>
            JSON.stringify([
              {
                id: 1,
                name: 'Page One',
                email: 'one@test.com',
                enrollments: [{ type: 'StudentEnrollment', enrollment_state: 'active' }],
              },
            ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: () => null },
          text: async () =>
            JSON.stringify([
              {
                id: 2,
                name: 'Page Two',
                email: 'two@test.com',
                enrollments: [{ type: 'StudentEnrollment', enrollment_state: 'active' }],
              },
            ]),
        });

      const result = await adapter.fetchRosterFromPlatformWs(config, 108);

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result.members.map((m) => m.userId)).toEqual(['1', '2']);
    });

    it('throws when lmsBaseUrl or lmsApiToken is missing', async () => {
      await expect(
        adapter.fetchRosterFromPlatformWs({ lmsBaseUrl: null, lmsApiToken: null } as never, 108),
      ).rejects.toThrow('lmsBaseUrl and lmsApiToken are required');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('throws when Canvas REST returns non-OK', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
        headers: { get: () => null },
        text: async () => 'unauthorized',
      });

      await expect(adapter.fetchRosterFromPlatformWs(config, 108)).rejects.toThrow(
        'Canvas REST request failed: 401 unauthorized',
      );
    });
  });

  describe('listCourses', () => {
    it('lists courses from GET /api/v1/courses', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify([
            {
              id: 108,
              name: 'Intro Biology',
              course_code: 'BIO101',
              workflow_state: 'available',
              total_students: 12,
            },
          ]),
      });

      const result = await adapter.listCourses({
        lmsBaseUrl: 'https://rwthrive.instructure.com',
        lmsApiToken: 'token',
      } as never);

      expect(result.total).toBe(1);
      expect(result.courses[0]).toMatchObject({
        id: 108,
        fullname: 'Intro Biology',
        shortname: 'BIO101',
        visible: 1,
      });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://rwthrive.instructure.com/api/v1/courses?per_page=100',
        { headers: { Authorization: 'Bearer token' } },
      );
    });

    it('falls back to accounts/self/courses when user courses fail', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          headers: { get: () => null },
          text: async () => 'unauthorized',
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: () => null },
          text: async () =>
            JSON.stringify([
              { id: 50, name: 'Admin Course', course_code: 'ADM', workflow_state: 'available' },
            ]),
        });

      const result = await adapter.listCourses({
        lmsBaseUrl: 'https://rwthrive.instructure.com',
        lmsApiToken: 'token',
      } as never);

      expect(result.courses[0].id).toBe(50);
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        'https://rwthrive.instructure.com/api/v1/accounts/self/courses?per_page=100',
        { headers: { Authorization: 'Bearer token' } },
      );
    });
  });

  describe('enrichRosterRoles', () => {
    it('replaces NRPS roles with Canvas REST enrollment roles when available', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify([
            {
              id: '42',
              name: 'Cara TA',
              email: 'cara@school.edu',
              enrollments: [{ type: 'TaEnrollment', enrollment_state: 'active' }],
            },
          ]),
      });

      const enriched = await adapter.enrichRosterRoles(
        {
          lmsBaseUrl: 'https://canvas.instructure.com',
          lmsApiToken: 'token',
        } as never,
        'https://canvas.instructure.com/api/lti/courses/123/names_and_roles',
        {
          context: { id: '123', label: null, title: null },
          members: [
            {
              userId: '42',
              name: 'Cara TA',
              email: 'cara@school.edu',
              roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
            },
          ],
        },
      );

      expect(enriched.members[0].roles).toEqual(['taenrollment']);
    });
  });

  describe('getEnrolledStudentsForCourse', () => {
    it('returns learner-only students in Moodle-compatible shape', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify([
            {
              id: 120,
              name: 'Teacher',
              email: 't@test.com',
              enrollments: [{ type: 'TeacherEnrollment', enrollment_state: 'active' }],
            },
            {
              id: 200,
              name: 'Learner',
              email: 'l@test.com',
              enrollments: [{ type: 'StudentEnrollment', enrollment_state: 'active' }],
            },
          ]),
      });

      const result = await adapter.getEnrolledStudentsForCourse(
        {
          lmsBaseUrl: 'https://rwthrive.instructure.com',
          lmsApiToken: 'token',
        } as never,
        108,
      );

      expect(result.total).toBe(1);
      expect(result.students[0]).toMatchObject({
        id: 200,
        fullname: 'Learner',
        email: 'l@test.com',
      });
    });
  });

  describe('getUserEmail', () => {
    it('returns primary email from Canvas user profile', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ primary_email: 'user@school.edu' }),
      });

      const result = await adapter.getUserEmail(
        {
          lmsBaseUrl: 'https://rwthrive.instructure.com',
          lmsApiToken: 'token',
        } as never,
        '120',
      );

      expect(result).toEqual({ email: 'user@school.edu', error: null });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://rwthrive.instructure.com/api/v1/users/120/profile',
        { headers: { Authorization: 'Bearer token' } },
      );
    });
  });
});
