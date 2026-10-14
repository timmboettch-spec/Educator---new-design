import { GoogleController } from '../../../src/google/google.controller';
import { GoogleConnectionService } from '../../../src/google/google-connection.service';
import { GoogleCourseMappingService } from '../../../src/google/google-course-mapping.service';
import { GoogleRosterSyncService } from '../../../src/google/google-roster-sync.service';
import { GoogleOAuthService } from '../../../src/google/google-oauth.service';
import { GoogleOAuthStateService } from '../../../src/google/google-oauth-state.service';
import { GoogleConstants } from '../../../src/google/google.constants';
import { ROLES_KEY } from '../../../src/common/decorators/required-roles.decorator';
import { RoleSlug } from '../../../src/common/constants';
import { DataSource } from 'typeorm';
import * as educatorSchoolAccess from '../../../src/educators/utils/educator-school-access.util';

jest.mock('../../../src/educators/utils/educator-school-access.util', () => ({
  assertGoogleClassroomEnabledForSchool: jest.fn(),
  resolveActingEducatorId: jest.fn(() => 'edu-1'),
  resolveSchoolIdFromRequest: jest.fn(async (_manager, _req, schoolId: string) => schoolId),
}));

describe('GoogleController roster sync', () => {
  const rosterSyncService = {
    syncLinkedCourse: jest.fn(),
    syncAllLinkedCoursesForSchool: jest.fn(),
  } as unknown as jest.Mocked<GoogleRosterSyncService>;

  const courseMappingService = {
    archiveGoogleClassesForEducator: jest.fn(),
    provisionCoursesForSchool: jest.fn(),
    linkCourse: jest.fn(),
    bulkLinkCourses: jest.fn(),
    listArchivedGoogleClasses: jest.fn(),
  } as unknown as jest.Mocked<GoogleCourseMappingService>;

  const connectionService = {
    disconnect: jest.fn(),
  } as unknown as jest.Mocked<GoogleConnectionService>;


  const req = { user: { userId: 'edu-1', roles: ['Educator'] } };

  const syncResult = {
    mappingId: 'map-1',
    classId: 'class-1',
    googleCourseId: 'g-course-1',
    lastRosterSyncedAt: '2026-09-10T12:00:00.000Z',
    added: 3,
    reactivated: 1,
    deactivated: 0,
    unchanged: 0,
    total: 4,
  };

  let controller: GoogleController;

  beforeEach(() => {
    jest.clearAllMocks();
    (educatorSchoolAccess.resolveSchoolIdFromRequest as jest.Mock).mockResolvedValue('school-1');
    controller = new GoogleController(
      connectionService,
      courseMappingService,
      rosterSyncService,
      {} as GoogleOAuthService,
      {} as GoogleOAuthStateService,
      { manager: {} } as DataSource,
    );
  });

  it('declares @RequiredRoles(Educator) on the controller', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, GoogleController) as RoleSlug[] | undefined;
    expect(roles).toEqual([RoleSlug.EDUCATOR]);
  });

  it('syncs one linked course roster', async () => {
    rosterSyncService.syncLinkedCourse.mockResolvedValue(syncResult);

    const response = await controller.syncRoster('school-1', 'map-1', req as never);

    expect(rosterSyncService.syncLinkedCourse).toHaveBeenCalledWith({
      schoolId: 'school-1',
      mappingId: 'map-1',
      educatorId: 'edu-1',
    });
    expect(response.message).toBe(GoogleConstants.MESSAGES.ROSTER_SYNCED);
    expect(response.data).toEqual({
      mappingId: 'map-1',
      classId: 'class-1',
      googleCourseId: 'g-course-1',
      lastRosterSyncedAt: '2026-09-10T12:00:00.000Z',
      added: 3,
      updated: 1,
      deactivated: 0,
      total: 4,
    });
  });

  it('syncs all linked course rosters for a school', async () => {
    rosterSyncService.syncAllLinkedCoursesForSchool.mockResolvedValue([syncResult]);

    const response = await controller.syncSchoolRosters('school-1', req as never);

    expect(rosterSyncService.syncAllLinkedCoursesForSchool).toHaveBeenCalledWith(
      'school-1',
      'edu-1',
    );
    expect(response.message).toBe(GoogleConstants.MESSAGES.ROSTERS_SYNCED);
    expect(response.data).toEqual({
      schoolId: 'school-1',
      results: [
        expect.objectContaining({
          mappingId: 'map-1',
          updated: 1,
          added: 3,
        }),
      ],
    });
  });

  it('archives educator google classes before disconnecting OAuth', async () => {
    courseMappingService.archiveGoogleClassesForEducator.mockResolvedValue({
      unlinked: 2,
      archived: 3,
    });
    connectionService.disconnect.mockResolvedValue({
      connected: false,
      schoolId: 'school-1',
      status: null,
      googleAccountEmail: null,
      googleAccountId: null,
      scopes: null,
      tokenExpiresAt: null,
      connectedByEducatorId: null,
    });

    const response = await controller.disconnect('school-1', req as never);

    expect(courseMappingService.archiveGoogleClassesForEducator).toHaveBeenCalledWith(
      'school-1',
      'edu-1',
    );
    expect(connectionService.disconnect).toHaveBeenCalledWith('school-1', 'edu-1');
    expect(response.message).toBe(GoogleConstants.MESSAGES.CONNECTION_DISCONNECTED);
  });

  it('provisions courses for a school', async () => {
    courseMappingService.provisionCoursesForSchool.mockResolvedValue({
      schoolId: 'school-1',
      items: [],
      newCount: 0,
      archivedMatchCount: 0,
    });

    const response = await controller.provisionCourses('school-1', req as never);

    expect(courseMappingService.provisionCoursesForSchool).toHaveBeenCalledWith({
      schoolId: 'school-1',
      educatorId: 'edu-1',
    });
    expect(response.message).toBe(GoogleConstants.MESSAGES.COURSES_PROVISIONED);
  });

  it('rejects educator when Google Classroom is disabled', async () => {
    (
      educatorSchoolAccess.assertGoogleClassroomEnabledForSchool as jest.Mock
    ).mockRejectedValueOnce(new Error(GoogleConstants.MESSAGES.FEATURE_DISABLED));

    await expect(
      controller.syncRoster('school-1', 'map-1', req as never),
    ).rejects.toThrow(GoogleConstants.MESSAGES.FEATURE_DISABLED);
    expect(rosterSyncService.syncLinkedCourse).not.toHaveBeenCalled();
  });
});
