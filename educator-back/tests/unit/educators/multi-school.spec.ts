import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EducatorsService } from '../../../src/educators/educators.service';
import { Educator } from '../../../src/educators/entity/educator.entity';
import { EducatorSchool } from '../../../src/educators/entity/educator-school.entity';
import { Schools } from '../../../src/schools/entity/schools.entity';
import { User } from '../../../src/users/entity/user.entity';
import { Invite } from '../../../src/invites/entity/invite.entity';
import { Class } from '../../../src/class/entity/class.entity';
import { Student } from '../../../src/students/entity/students.entity';
import { ClassSimulation } from '../../../src/class-simulations/entity/class-simulation.entity';
import { AzureBlobService } from '../../../src/config/azure-blob.config';
import { MailService } from '../../../src/mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { EducatorSessionService } from '../../../src/session/educator-session.service';
import { TutorPatientService } from '../../../src/common/utils/tutor-patient.service';

const makeSchool = (id: string, name: string): Schools =>
  ({ id, school_name: name, is_active: true, lms_enabled: false } as Schools);

const makeEducator = (overrides: Partial<Educator> = {}): Educator => {
  const e = Object.create(Educator.prototype) as Educator;
  return Object.assign(e, {
    id: 'edu-1',
    email: 'edu@test.com',
    full_name: 'Edu One',
    status: CommonStatus.ACTIVE,
    is_active: true,
    tokens: 5,
    school: makeSchool('school-1', 'Alpha School'),
    schoolAssignments: undefined,
    admin: { id: 'admin-1' } as User,
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
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const educatorSchoolRepo = {
    findOne: jest.fn(),
    count: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    upsert: jest.fn(),
    create: jest.fn(),
  };
  const schoolRepo = { findOne: jest.fn() };
  const inviteRepo = { delete: jest.fn(), save: jest.fn(), create: jest.fn() };
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
        { provide: getRepositoryToken(Educator), useValue: educatorRepo },
        { provide: getRepositoryToken(EducatorSchool), useValue: educatorSchoolRepo },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Schools), useValue: schoolRepo },
        { provide: getRepositoryToken(Class), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(Student), useValue: { update: jest.fn() } },
        { provide: getRepositoryToken(ClassSimulation), useValue: { update: jest.fn() } },
        { provide: getRepositoryToken(Invite), useValue: inviteRepo },
        { provide: AzureBlobService, useValue: { uploadFile: jest.fn(), isConfigured: jest.fn().mockReturnValue(false) } },
        { provide: DataSource, useValue: dataSource },
        { provide: MailService, useValue: { sendMail: jest.fn().mockResolvedValue(undefined) } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('http://localhost') } },
        { provide: NotificationsGateway, useValue: { notifyAccountDeleted: jest.fn(), notifyAccountDeactivated: jest.fn(), notifyAdminEducatorLowSeatWarning: jest.fn(), notifyAdminSchoolLowSeatWarning: jest.fn(), notifyEducatorSchoolAdded: jest.fn(), notifyEducatorSchoolRemoved: jest.fn(), notifyEducatorSchoolStatusChanged: jest.fn(), notifyAdminEducatorStatusUpdated: jest.fn() } },
        { provide: EducatorSessionService, useValue: { invalidateEducator: jest.fn().mockResolvedValue(undefined), invalidateBySchool: jest.fn().mockResolvedValue([]) } },
        { provide: TutorPatientService, useValue: { getReportsByStudentIds: jest.fn().mockResolvedValue({ matched: [], isMatch: false }) } },
      ],
    }).compile();
    service = module.get(EducatorsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('ensureEducatorSchoolRow', () => {
    it('does nothing when assignment already exists', async () => {
      educatorSchoolRepo.findOne.mockResolvedValue({ id: 'es-1' });
      await service.ensureEducatorSchoolRow('edu-1', 'school-1');
      expect(educatorSchoolRepo.save).not.toHaveBeenCalled();
    });

    it('creates primary assignment when no previous assignments', async () => {
      educatorSchoolRepo.findOne.mockResolvedValue(null);
      educatorSchoolRepo.count.mockResolvedValue(0);
      educatorSchoolRepo.create.mockReturnValue({ educator: {}, school: {}, is_primary: true });
      educatorSchoolRepo.save.mockResolvedValue({});
      await service.ensureEducatorSchoolRow('edu-1', 'school-1');
      expect(educatorSchoolRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ is_primary: true }),
      );
    });

    it('creates non-primary assignment when educator already has one school', async () => {
      educatorSchoolRepo.findOne.mockResolvedValue(null);
      educatorSchoolRepo.count.mockResolvedValue(1);
      educatorSchoolRepo.create.mockReturnValue({ educator: {}, school: {}, is_primary: false });
      educatorSchoolRepo.save.mockResolvedValue({});
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
        schoolAssignments: [{ school: makeSchool('school-2', 'B'), is_primary: false } as EducatorSchool],
      });
      educatorRepo.findOne
        .mockResolvedValueOnce(makeEducator())     // findByIdAndOwner
        .mockResolvedValueOnce(eduWithSchools);    // final reload
      schoolRepo.findOne.mockResolvedValue(makeSchool('school-2', 'B'));
      educatorSchoolRepo.findOne.mockResolvedValue(null);
      educatorSchoolRepo.count.mockResolvedValue(1);
      educatorSchoolRepo.create.mockReturnValue({});
      educatorSchoolRepo.save.mockResolvedValue({});

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
        .mockResolvedValueOnce(makeEducator())   // findByIdAndOwner
        .mockResolvedValueOnce(makeEducator());  // final reload
      educatorSchoolRepo.findOne.mockResolvedValueOnce({ id: 'es-1', is_primary: true }); // existing assignment
      txManager.findOne.mockResolvedValueOnce(remainingAssignment); // next remaining (inside tx)
      txManager.count.mockResolvedValueOnce(1); // still has one assignment left

      await service.removeSchool('edu-1', 'school-1', 'admin-1');
      expect(txManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ is_primary: true }),
      );
    });

    it('clears legacy school FK when last assignment is removed', async () => {
      educatorRepo.findOne
        .mockResolvedValueOnce(makeEducator())   // findByIdAndOwner
        .mockResolvedValueOnce(makeEducator());  // final reload
      educatorSchoolRepo.findOne.mockResolvedValueOnce({ id: 'es-1', is_primary: true }); // existing
      txManager.findOne.mockResolvedValueOnce(null); // no remaining assignments
      txManager.count.mockResolvedValueOnce(0); // zero left

      await service.removeSchool('edu-1', 'school-1', 'admin-1');
      expect(txManager.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE educators SET school_id = NULL'),
        ['edu-1'],
      );
    });
  });
});

describe('EducatorSessionService — invalidateBySchool uses junction table', () => {
  let sessionService: EducatorSessionService;

  const rawManyMock = jest.fn();
  const educatorRepo = {
    createQueryBuilder: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
  };

  const makeQb = (): Record<string, jest.Mock> => {
    const qb: Record<string, jest.Mock> = {};
    qb.innerJoin = jest.fn().mockReturnValue(qb);
    qb.where = jest.fn().mockReturnValue(qb);
    qb.andWhere = jest.fn().mockReturnValue(qb);
    qb.select = jest.fn().mockReturnValue(qb);
    qb.getRawMany = rawManyMock;
    qb.update = jest.fn().mockReturnValue(qb);
    qb.set = jest.fn().mockReturnValue(qb);
    qb.whereInIds = jest.fn().mockReturnValue(qb);
    qb.execute = jest.fn().mockResolvedValue({});
    return qb;
  };

  beforeEach(async () => {
    educatorRepo.createQueryBuilder.mockReturnValue(makeQb());
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EducatorSessionService,
        { provide: getRepositoryToken(Educator), useValue: educatorRepo },
      ],
    }).compile();
    sessionService = module.get(EducatorSessionService);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns empty array when no educators found for school', async () => {
    rawManyMock.mockResolvedValue([]);
    const result = await sessionService.invalidateBySchool('school-1');
    expect(result).toEqual([]);
  });

  it('invalidates educators found via junction table query', async () => {
    rawManyMock.mockResolvedValue([{ id: 'edu-1' }, { id: 'edu-2' }]);
    const qb = makeQb();
    qb.execute = jest.fn().mockResolvedValue({});
    educatorRepo.createQueryBuilder
      .mockReturnValueOnce(makeQb())   // first call — find educators
      .mockReturnValueOnce(qb);        // second call — update

    const result = await sessionService.invalidateBySchool('school-1');
    expect(result).toEqual(['edu-1', 'edu-2']);
  });
});
