import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EducatorsService } from '../../../src/educators/educators.service';

import { AzureBlobService, LoggerService } from '../../../src/common/services';
import { MailService } from '../../../src/mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { EducatorSessionService } from '../../../src/session/educator-session.service';
import { InviteTokenService } from '../../../src/invites/invite-token.service';
import {
  DistrictAdmin,
  Educator,
  EducatorSchool,
  Schools,
  Student,
  UserRole,
} from 'src/database/entities';
import {
  CLASS_REPOSITORY,
  CLASS_SIMULATION_REPOSITORY,
  DISTRICT_ADMIN_REPOSITORY,
  EDUCATOR_REPOSITORY,
  EDUCATOR_SEAT_REQUEST_REPOSITORY,
  EDUCATOR_SCHOOL_REPOSITORY,
  INVITE_REPOSITORY,
  SCHOOLS_REPOSITORY,
  USER_ROLE_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
} from 'src/database/tokens';

const makeSchool = (id: string, name: string): Schools =>
  ({ id, school_name: name, is_active: true, lms_enabled: false }) as Schools;

const makeEducator = (overrides: Partial<Educator> = {}): Educator => {
  const e = Object.create(Educator.prototype) as Educator;
  return Object.assign(e, {
    id: 'edu-1',
    full_name: 'Edu One',
    is_active: true,
    tokens: 5,
    school: makeSchool('school-1', 'Alpha School'),
    schoolAssignments: undefined,
    // `Educator.email`/`.status` no longer exist as columns — identity and lifecycle resolve
    // through the linked `user_roles` row (`userRole.user.email` / `userRole.status`).
    userRole: {
      userRoleId: 'ur-1',
      userId: 'user-1',
      status: CommonStatus.ACTIVE,
      user: { id: 'user-1', email: 'edu@test.com' },
    } as UserRole,
    // `admin` is a `DistrictAdmin`, keyed by its own `districtAdminId` PK — not a `User`.
    districtAdminId: 'da-1',
    admin: { districtAdminId: 'da-1', fullName: 'Admin One' } as DistrictAdmin,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  });
};

describe('Educator entity — multi-school helpers', () => {
  it('schools getter returns empty array when no assignments loaded', () => {
    const e = makeEducator();
    expect(e.schools).toEqual([]);
  });

  it('schools getter returns all schools from assignments', () => {
    const s1 = makeSchool('s1', 'A');
    const s2 = makeSchool('s2', 'B');
    const e = makeEducator({
      schoolAssignments: [
        { school: s1, is_primary: true } as EducatorSchool,
        { school: s2, is_primary: false } as EducatorSchool,
      ],
    });
    expect(e.schools).toHaveLength(2);
    expect(e.schools.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('primarySchool returns primary-flagged school', () => {
    const s1 = makeSchool('s1', 'A');
    const s2 = makeSchool('s2', 'B');
    const e = makeEducator({
      schoolAssignments: [
        { school: s1, is_primary: false } as EducatorSchool,
        { school: s2, is_primary: true } as EducatorSchool,
      ],
    });
    expect(e.primarySchool?.id).toBe('s2');
  });

  it('primarySchool falls back to first assignment when none is flagged primary', () => {
    const s1 = makeSchool('s1', 'A');
    const s2 = makeSchool('s2', 'B');
    const e = makeEducator({
      schoolAssignments: [
        { school: s1, is_primary: false } as EducatorSchool,
        { school: s2, is_primary: false } as EducatorSchool,
      ],
    });
    expect(e.primarySchool?.id).toBe('s1');
  });

  it('primarySchool falls back to legacy school FK when no assignments', () => {
    const e = makeEducator({ school: makeSchool('legacy', 'Legacy'), schoolAssignments: [] });
    expect(e.primarySchool?.id).toBe('legacy');
  });

  it('primarySchool returns null when no school at all', () => {
    const e = makeEducator({ school: null, schoolAssignments: [] });
    expect(e.primarySchool).toBeNull();
  });
});

describe('EducatorsService — multi-school methods', () => {
  let service: EducatorsService;

  const educatorRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const educatorSchoolRepo = {
    findOne: jest.fn(),
    count: jest.fn(),
    remove: jest.fn(),
    upsert: jest.fn(),
    create: jest.fn(),
  };
  const schoolRepo = { findOne: jest.fn() };
  const inviteRepo = {
    delete: jest.fn(),
    deleteByEmail: jest.fn(),
    deletePendingByEmail: jest.fn(),
    create: jest.fn(),
  };
  const notificationsGateway = {
    notifyAccountDeleted: jest.fn(),
    notifyAccountDeactivated: jest.fn(),
    notifyAdminEducatorLowSeatWarning: jest.fn(),
    notifyAdminSchoolLowSeatWarning: jest.fn(),
    notifyEducatorSchoolAdded: jest.fn(),
    notifyEducatorSchoolRemoved: jest.fn(),
    notifyEducatorSchoolStatusChanged: jest.fn(),
    notifyAdminEducatorStatusUpdated: jest.fn(),
  };
  const txManager = {
    delete: jest.fn().mockResolvedValue({}),
    findOne: jest.fn(),
    save: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
    query: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue({}),
  };
  const dataSource = {
    query: jest.fn(),
    transaction: jest.fn(async (cb: (m: typeof txManager) => Promise<unknown>) => cb(txManager)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EducatorsService,
        {
          provide: InviteTokenService,
          useValue: {
            issue: jest.fn().mockReturnValue('mock-invite-token'),
            buildInviteUrl: jest
              .fn()
              .mockReturnValue('http://localhost:5173/signup/mock-invite-token'),
            resolve: jest.fn(),
          },
        },
        { provide: EDUCATOR_REPOSITORY, useValue: educatorRepo },
        { provide: EDUCATOR_SEAT_REQUEST_REPOSITORY, useValue: {} },
        { provide: EDUCATOR_SCHOOL_REPOSITORY, useValue: educatorSchoolRepo },
        { provide: USER_ROLE_REPOSITORY, useValue: { update: jest.fn(), findById: jest.fn() } },
        {
          provide: DISTRICT_ADMIN_REPOSITORY,
          useValue: { findByUserRoleId: jest.fn(), updateByUserRoleId: jest.fn() },
        },
        { provide: SCHOOLS_REPOSITORY, useValue: schoolRepo },
        { provide: CLASS_REPOSITORY, useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(Student), useValue: { update: jest.fn() } },
        { provide: CLASS_SIMULATION_REPOSITORY, useValue: { update: jest.fn() } },
        { provide: INVITE_REPOSITORY, useValue: inviteRepo },
        {
          provide: AzureBlobService,
          useValue: { uploadFile: jest.fn(), isConfigured: jest.fn().mockReturnValue(false) },
        },
        { provide: DataSource, useValue: dataSource },
        { provide: MailService, useValue: { sendMail: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('http://localhost') },
        },
        {
          provide: NotificationsGateway,
          useValue: notificationsGateway,
        },
        {
          provide: NotificationsService,
          useValue: { isPreferenceEnabled: jest.fn().mockResolvedValue(false) },
        },
        {
          provide: EducatorSessionService,
          useValue: {
            invalidateEducator: jest.fn().mockResolvedValue(undefined),
            invalidateBySchool: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: SIMULATION_REPORT_REPOSITORY,
          useValue: {
            findStudentScenarioPairsWithAttempts: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            verbose: jest.fn(),
            fatal: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get(EducatorsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('ensureEducatorSchoolRow', () => {
    it('does nothing when assignment already exists', async () => {
      educatorSchoolRepo.findOne.mockResolvedValue({ id: 'es-1' });
      await service.ensureEducatorSchoolRow('edu-1', 'school-1');
      expect(educatorSchoolRepo.create).not.toHaveBeenCalled();
    });

    it('creates primary assignment when no previous assignments', async () => {
      educatorSchoolRepo.findOne.mockResolvedValue(null);
      educatorSchoolRepo.count.mockResolvedValue(0);
      educatorSchoolRepo.create.mockResolvedValue({});
      await service.ensureEducatorSchoolRow('edu-1', 'school-1');
      expect(educatorSchoolRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ is_primary: true }),
      );
    });

    it('creates non-primary assignment when educator already has one school', async () => {
      educatorSchoolRepo.findOne.mockResolvedValue(null);
      educatorSchoolRepo.count.mockResolvedValue(1);
      educatorSchoolRepo.create.mockResolvedValue({});
      await service.ensureEducatorSchoolRow('edu-1', 'school-2');
      expect(educatorSchoolRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ is_primary: false }),
      );
    });
  });

  describe('addSchool', () => {
    it('returns NOT_FOUND when educator does not belong to admin', async () => {
      educatorRepo.findOne.mockResolvedValue(null);
      const result = await service.addSchool('edu-1', 'school-2', 'admin-1');
      expect(result.success).toBe(false);
    });

    it('returns NOT_FOUND when school does not belong to admin', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      schoolRepo.findOne.mockResolvedValue(null);
      const result = await service.addSchool('edu-1', 'school-2', 'admin-1');
      expect(result.success).toBe(false);
    });

    it('succeeds and returns updated educator', async () => {
      const eduWithSchools = makeEducator({
        schoolAssignments: [
          { school: makeSchool('school-2', 'B'), is_primary: false } as EducatorSchool,
        ],
      });
      educatorRepo.findOne
        .mockResolvedValueOnce(makeEducator()) // findByIdAndOwner
        .mockResolvedValueOnce(eduWithSchools); // final reload
      schoolRepo.findOne.mockResolvedValue(makeSchool('school-2', 'B'));
      educatorSchoolRepo.findOne.mockResolvedValue(null);
      educatorSchoolRepo.count.mockResolvedValue(1);
      educatorSchoolRepo.create.mockResolvedValue({});

      const result = await service.addSchool('edu-1', 'school-2', 'admin-1');
      expect(result.success).toBe(true);
    });
  });

  describe('removeSchool', () => {
    it('returns NOT_FOUND when educator does not belong to admin', async () => {
      educatorRepo.findOne.mockResolvedValue(null);
      const result = await service.removeSchool('edu-1', 'school-1', 'admin-1');
      expect(result.success).toBe(false);
    });

    it('returns error when educator is not assigned to the given school', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      educatorSchoolRepo.findOne.mockResolvedValue(null);
      const result = await service.removeSchool('edu-1', 'school-99', 'admin-1');
      expect(result.success).toBe(false);
    });

    it('promotes next assignment to primary when primary is removed', async () => {
      const remainingAssignment = { id: 'es-2', is_primary: false, school: { id: 'school-2' } };
      educatorRepo.findOne
        .mockResolvedValueOnce(makeEducator()) // findByIdAndOwner
        .mockResolvedValueOnce(makeEducator()); // final reload
      educatorSchoolRepo.findOne.mockResolvedValueOnce({
        id: 'es-1',
        is_primary: true,
        school: { id: 'school-1', school_name: 'Test School' },
      }); // existing assignment
      txManager.findOne.mockResolvedValueOnce(remainingAssignment); // next remaining (inside tx)
      txManager.count.mockResolvedValueOnce(1); // still has one assignment left

      await service.removeSchool('edu-1', 'school-1', 'admin-1');
      expect(txManager.save).toHaveBeenCalledWith(expect.objectContaining({ is_primary: true }));
    });

    it('notifies the educator when another assignment remains', async () => {
      const remainingAssignment = { id: 'es-2', is_primary: false, school: { id: 'school-2' } };
      educatorRepo.findOne
        .mockResolvedValueOnce(makeEducator())
        .mockResolvedValueOnce(makeEducator());
      educatorSchoolRepo.findOne.mockResolvedValueOnce({
        id: 'es-1',
        is_primary: true,
        school: { id: 'school-1', school_name: 'Test School' },
      });
      txManager.findOne.mockResolvedValueOnce(remainingAssignment);
      txManager.count.mockResolvedValueOnce(1);

      await service.removeSchool('edu-1', 'school-1', 'admin-1');

      expect(notificationsGateway.notifyEducatorSchoolRemoved).toHaveBeenCalledWith('edu-1');
    });

    it('clears legacy school FK when last assignment is removed', async () => {
      educatorRepo.findOne
        .mockResolvedValueOnce(makeEducator()) // findByIdAndOwner
        .mockResolvedValueOnce(makeEducator()); // final reload
      educatorSchoolRepo.findOne.mockResolvedValueOnce({
        id: 'es-1',
        is_primary: true,
        school: { id: 'school-1', school_name: 'Test School' },
      }); // existing
      txManager.findOne.mockResolvedValueOnce(null); // no remaining assignments
      txManager.count.mockResolvedValueOnce(0); // zero left

      await service.removeSchool('edu-1', 'school-1', 'admin-1');
      expect(txManager.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE educators SET school_id = NULL'),
        ['edu-1'],
      );
    });

    it('also notifies the educator when the last assignment is removed', async () => {
      educatorRepo.findOne
        .mockResolvedValueOnce(makeEducator())
        .mockResolvedValueOnce(makeEducator());
      educatorSchoolRepo.findOne.mockResolvedValueOnce({
        id: 'es-1',
        is_primary: true,
        school: { id: 'school-1', school_name: 'Test School' },
      });
      txManager.findOne.mockResolvedValueOnce(null);
      txManager.count.mockResolvedValueOnce(0);

      await service.removeSchool('edu-1', 'school-1', 'admin-1');

      expect(notificationsGateway.notifyEducatorSchoolRemoved).toHaveBeenCalledWith('edu-1');
    });
  });
});

describe('EducatorSessionService — invalidateBySchool uses junction table', () => {
  let sessionService: EducatorSessionService;

  const educatorRepo = {
    findActiveIdsBySchool: jest.fn(),
    updateTokenInvalidatedAt: jest.fn().mockResolvedValue(undefined),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EducatorSessionService,
        { provide: EDUCATOR_REPOSITORY, useValue: educatorRepo },
        { provide: EDUCATOR_SEAT_REQUEST_REPOSITORY, useValue: {} },
        {
          provide: LoggerService,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            verbose: jest.fn(),
            fatal: jest.fn(),
          },
        },
      ],
    }).compile();
    sessionService = module.get(EducatorSessionService);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns empty array when no educators found for school', async () => {
    educatorRepo.findActiveIdsBySchool.mockResolvedValue([]);
    const result = await sessionService.invalidateBySchool('school-1');
    expect(result).toEqual([]);
    expect(educatorRepo.updateTokenInvalidatedAt).not.toHaveBeenCalled();
  });

  it('invalidates educators found via junction table query', async () => {
    educatorRepo.findActiveIdsBySchool.mockResolvedValue(['edu-1', 'edu-2']);

    const result = await sessionService.invalidateBySchool('school-1');
    expect(result).toEqual(['edu-1', 'edu-2']);
    expect(educatorRepo.updateTokenInvalidatedAt).toHaveBeenCalledWith(
      ['edu-1', 'edu-2'],
      expect.any(Date),
    );
  });
});
