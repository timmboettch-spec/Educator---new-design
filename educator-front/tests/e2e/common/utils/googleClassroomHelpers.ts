import { test, type Locator, type Page, type Route } from '@playwright/test';

export const SCHOOL_ID = 'school-gc-001';
export const SCHOOL_NAME = 'Riverside High';

export const GC_COPY = {
  navItem: 'Google Classroom',
  connect: 'Connect',
  disconnect: 'Disconnect',
  connectSuccess: 'Google Classroom connected successfully.',
  disconnectSuccess: 'Google Classroom disconnected.',
  errorCallback: 'Google Classroom connect failed. Try again.',
  errorProviderDenied: 'Google consent was denied. No connection was created.',
  tokenExpired:
    'Google Classroom connection needs re-authorization (token expired or invalid).',
  coursesUpToDate: 'Google courses are up to date — no new courses to link.',
  resyncCourses: 'Re-sync courses',
  linked: 'Linked',
  notLinked: 'Not linked',
  link: 'Link',
  unlink: 'Unlink',
  linkSuccess: 'Google course linked to class.',
  unlinkSuccess:
    'Google course unlinked. The class was moved to Archived Google Classroom.',
  syncRoster: 'Sync roster',
  rosterSyncSuccess: 'Google Classroom roster synced.',
  tabCourses: 'Courses',
  tabArchived: 'Archived Google Classroom',
  selectAll: 'Select all',
  linkSelected: 'Link selected',
  bulkLinkSuccess: 'Linked 2 Google course(s) and synced rosters.',
  relink: 'Relink',
  relinkSuccess: 'Class relinked to Google course.',
  archivedEmpty: 'No archived Google Classroom classes.',
} as const;

export interface GcConnection {
  connected: boolean;
  schoolId: string;
  status: 'active' | 'revoked' | 'error' | null;
  googleAccountEmail: string | null;
  googleAccountId: string | null;
  scopes: string | null;
  tokenExpiresAt: string | null;
  connectedByEducatorId: string | null;
}

export interface GcProvisionItem {
  course: {
    id: string;
    name: string;
    section: string | null;
    descriptionHeading: string | null;
    room: string | null;
    courseState: string | null;
    enrollmentState: string | null;
    alternateLink: string | null;
  };
  classId: string;
  className: string;
  linked: boolean;
  mappingId: string | null;
  isNew: boolean;
  archived: boolean;
}

export interface GcArchivedClass {
  classId: string;
  className: string;
  googleCourseId: string | null;
  googleCourseName: string | null;
  courseExists: boolean | null;
  archivedAt: string | null;
}

export function disconnectedConnection(): GcConnection {
  return {
    connected: false,
    schoolId: SCHOOL_ID,
    status: null,
    googleAccountEmail: null,
    googleAccountId: null,
    scopes: null,
    tokenExpiresAt: null,
    connectedByEducatorId: null,
  };
}

export function buildConnection(
  overrides: Partial<GcConnection> = {}
): GcConnection {
  return { ...disconnectedConnection(), ...overrides };
}

export function buildProvisionItem(options: {
  id: string;
  name: string;
  classId: string;
  className?: string;
  isNew?: boolean;
  linked?: boolean;
  mappingId?: string | null;
  archived?: boolean;
}): GcProvisionItem {
  return {
    course: {
      id: options.id,
      name: options.name,
      section: null,
      descriptionHeading: null,
      room: null,
      courseState: 'ACTIVE',
      enrollmentState: 'TEACHER',
      alternateLink: null,
    },
    classId: options.classId,
    className: options.className ?? options.name,
    linked: options.linked ?? false,
    mappingId: options.mappingId ?? null,
    isNew: options.isNew ?? false,
    archived: options.archived ?? false,
  };
}

export function buildArchivedClass(options: {
  classId: string;
  className: string;
  googleCourseId?: string | null;
  googleCourseName?: string | null;
  courseExists?: boolean | null;
}): GcArchivedClass {
  return {
    classId: options.classId,
    className: options.className,
    googleCourseId: options.googleCourseId ?? null,
    googleCourseName: options.googleCourseName ?? options.className,
    courseExists: options.courseExists ?? true,
    archivedAt: '2026-01-05T10:00:00.000Z',
  };
}

export function educatorUser(
  options: { googleClassroomEnabled?: boolean } = {}
): Record<string, unknown> {
  const enabled = options.googleClassroomEnabled ?? true;
  return {
    id: 'edu-gc-001',
    email: 'gc.educator@example.test',
    full_name: 'GC Educator',
    role: 'Educator',
    is_license_active: true,
    google_classroom_enabled: enabled,
    school: {
      id: SCHOOL_ID,
      school_name: SCHOOL_NAME,
      google_classroom_enabled: enabled,
    },
  };
}

async function fulfillJson(
  route: Route,
  body: unknown,
  status = 200
): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export async function stubAllApis(page: Page): Promise<void> {
  const info = test.info();
  const unmocked = new Set<string>();
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route: Route) => {
      const { pathname } = new URL(route.request().url());
      if (!unmocked.has(pathname)) {
        unmocked.add(pathname);
        info.annotations.push({ type: 'unmocked-api', description: pathname });
      }
      await fulfillJson(route, { status: 200, message: 'ok', data: {} });
    }
  );
}

export async function seedEducatorSession(
  page: Page,
  user: Record<string, unknown>
): Promise<void> {
  await page.addInitScript((serializedUser: string) => {
    document.cookie =
      'auth_token=mock-educator-access-token; path=/; SameSite=Lax';
    document.cookie = 'csrfToken=mock-csrf-token; path=/; SameSite=Lax';
    document.cookie = `auth_user=${encodeURIComponent(serializedUser)}; path=/; SameSite=Lax`;
    document.cookie = 'auth_session_active=1; path=/; SameSite=Lax';
    localStorage.setItem('accessToken', 'mock-educator-access-token');
    localStorage.setItem('csrfToken', 'mock-csrf-token');
    sessionStorage.setItem('session_active', '1');
  }, JSON.stringify(user));
}

export interface GcProvisionResponse {
  items: GcProvisionItem[];
  newCount?: number;
  archivedMatchCount?: number;
}

export interface GcMockOptions {
  connection?: Partial<GcConnection>;
  provision?: GcProvisionResponse;
  archived?: GcArchivedClass[];
  failures?: Record<string, { status: number; message: string }>;
}

export interface GcMockHandle {
  calls: (key: string) => number;
  lastBulkLinkIds: () => string[];
  lastLinkPayload: () => Record<string, unknown> | null;
  setConnection: (next: Partial<GcConnection>) => void;
  setProvision: (next: GcProvisionResponse) => void;
  setArchived: (next: GcArchivedClass[]) => void;
  setFailure: (
    key: string,
    failure: { status: number; message: string } | null
  ) => void;
}

export async function mockGoogleClassroom(
  page: Page,
  options: GcMockOptions = {}
): Promise<GcMockHandle> {
  let connection = buildConnection(options.connection);
  let provision: GcProvisionResponse = options.provision ?? { items: [] };
  let archived: GcArchivedClass[] = options.archived ?? [];
  const failures: Record<string, { status: number; message: string }> = {
    ...(options.failures ?? {}),
  };
  const counts: Record<string, number> = {};
  let lastBulkLinkIds: string[] = [];
  let lastLinkPayload: Record<string, unknown> | null = null;

  const record = (key: string): void => {
    counts[key] = (counts[key] ?? 0) + 1;
  };

  await page.route(
    (url) => url.pathname.includes('/api/google/schools/'),
    async (route: Route) => {
      const request = route.request();
      const method = request.method();
      const { pathname } = new URL(request.url());

      const key = ((): string => {
        if (pathname.endsWith('/connection')) return `${method} /connection`;
        if (pathname.endsWith('/connect')) return `${method} /connect`;
        if (pathname.endsWith('/courses/provision'))
          return `${method} /provision`;
        if (pathname.endsWith('/archived-google-classes'))
          return `${method} /archived`;
        if (pathname.endsWith('/courses')) return `${method} /courses`;
        if (pathname.endsWith('/course-mappings/bulk-link'))
          return `${method} /bulk-link`;
        if (pathname.endsWith('/sync-roster')) return `${method} /sync-roster`;
        if (pathname.endsWith('/course-mappings'))
          return `${method} /course-mappings`;
        return `${method} /course-mappings/:id`;
      })();

      record(key);

      const failure = failures[key];
      if (failure) {
        await fulfillJson(route, { message: failure.message }, failure.status);
        return;
      }

      switch (key) {
        case 'GET /connection':
          await fulfillJson(route, { data: connection });
          return;
        case 'DELETE /connection':
          connection = disconnectedConnection();
          await fulfillJson(route, { data: connection });
          return;
        case 'POST /connect':
          await fulfillJson(route, {
            data: {
              authorizationUrl:
                'https://accounts.google.com/o/oauth2/v2/auth?mock=1',
              schoolId: SCHOOL_ID,
            },
          });
          return;
        case 'GET /courses':
          await fulfillJson(route, { data: { courses: [] } });
          return;
        case 'POST /provision':
          await fulfillJson(route, {
            data: {
              schoolId: SCHOOL_ID,
              items: provision.items,
              newCount: provision.newCount ?? 0,
              archivedMatchCount: provision.archivedMatchCount ?? 0,
            },
          });
          return;
        case 'GET /archived':
          await fulfillJson(route, { data: { classes: archived } });
          return;
        case 'POST /course-mappings': {
          const body = (request.postDataJSON() ?? {}) as Record<
            string,
            unknown
          >;
          lastLinkPayload = body;
          const googleCourseId = String(body.googleCourseId ?? '');
          const jitClassId = googleCourseId.replace(/^gc-/, 'cls-');
          await fulfillJson(route, {
            data: {
              id: `mapping-${googleCourseId || 'x'}`,
              schoolId: SCHOOL_ID,
              classId: jitClassId,
              googleCourseId,
              googleCourseName: (body.googleCourseName as string) ?? null,
              linkedByEducatorId: 'edu-gc-001',
              lastRosterSyncedAt: null,
              createdAt: '2026-01-05T10:00:00.000Z',
              updatedAt: '2026-01-05T10:00:00.000Z',
            },
          });
          return;
        }
        case 'POST /bulk-link': {
          const body = (request.postDataJSON() ?? {}) as {
            courses?: Array<{ googleCourseId?: string }>;
            googleCourseIds?: string[];
          };
          const bulkCourses =
            body.courses ??
            body.googleCourseIds?.map((googleCourseId) => ({
              googleCourseId,
            })) ??
            [];
          lastBulkLinkIds = bulkCourses.map((course) =>
            String(course.googleCourseId ?? '')
          );
          await fulfillJson(route, {
            data: {
              schoolId: SCHOOL_ID,
              results: bulkCourses.map((course) => {
                const googleCourseId = String(course.googleCourseId ?? '');
                return {
                  googleCourseId,
                  success: true,
                  mapping: {
                    id: `mapping-${googleCourseId}`,
                    schoolId: SCHOOL_ID,
                    classId: googleCourseId.replace(/^gc-/, 'cls-'),
                    googleCourseId,
                    googleCourseName:
                      (course as { googleCourseName?: string })
                        .googleCourseName ?? null,
                    linkedByEducatorId: 'edu-gc-001',
                    lastRosterSyncedAt: null,
                    createdAt: '2026-01-05T10:00:00.000Z',
                    updatedAt: '2026-01-05T10:00:00.000Z',
                  },
                };
              }),
            },
          });
          return;
        }
        case 'POST /sync-roster': {
          const mappingId = pathname.split('/').slice(-2)[0];
          await fulfillJson(route, {
            data: {
              mappingId,
              classId: 'cls-synced',
              googleCourseId: 'gc-synced',
              lastRosterSyncedAt: '2026-01-06T09:30:00.000Z',
              added: 3,
              updated: 1,
              deactivated: 0,
              total: 4,
            },
          });
          return;
        }
        default:
          await fulfillJson(route, { data: {} });
      }
    }
  );

  return {
    calls: (key: string) => counts[key] ?? 0,
    lastBulkLinkIds: () => lastBulkLinkIds,
    lastLinkPayload: () => lastLinkPayload,
    setConnection: (next) => {
      connection = buildConnection({ ...connection, ...next });
    },
    setProvision: (next) => {
      provision = next;
    },
    setArchived: (next) => {
      archived = next;
    },
    setFailure: (key, failure) => {
      if (failure) failures[key] = failure;
      else delete failures[key];
    },
  };
}

export function toastText(page: Page, text: string): Locator {
  return page
    .locator('[data-sonner-toaster]')
    .getByText(text, { exact: false });
}
