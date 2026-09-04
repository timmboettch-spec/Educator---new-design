import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SchoolsController } from '../../../src/schools/schools.controller';
import { SchoolsService } from '../../../src/schools/schools.service';
import { Schools } from '../../../src/schools/entity/schools.entity';
import { User } from '../../../src/users/entity/user.entity';
import { ClassSimulation } from '../../../src/class-simulations/entity/class-simulation.entity';
import { Invite } from '../../../src/invites/entity/invite.entity';
import { CommonStatus } from 'src/common/enums/status.enum';
import { JwtRequest } from 'src/common/types';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EducatorSessionService } from '../../../src/session/educator-session.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { MailService } from '../../../src/mail/mail.service';

const makeReq = (userId: string, roles: string[]): JwtRequest => {
  const req = Object.assign(new Request('http://localhost'), { user: { userId, roles } });
  return req;
};

const makeUser = (o: Partial<User> = {}): User =>
  ({ id: 'user-1', status: CommonStatus.ACTIVE, ...o }) as User;

const makeSchool = (o: Partial<Schools> = {}): Schools => ({
  id: 'school-1',
  school_name: 'Test School',
  status: CommonStatus.ACTIVE,
  is_active: true,
  deleted_at: null,
  created_at: new Date(),
  updated_at: new Date(),
  lms_enabled: false,
  user_id: makeUser(),
  ...o,
});

const districtReq = makeReq('user-1', ['District Admin']);
const educatorReq = makeReq('user-1', ['Educator']);

describe('Schools (Controller + Service)', () => {
  let controller: SchoolsController;
  let service: SchoolsService;

  const schoolRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    create: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const userRepo = { findOne: jest.fn() };
  const classSimulationRepo = { update: jest.fn() };
  const inviteRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const mailService = {
    sendMail: jest.fn().mockResolvedValue(undefined),
    sendInviteEmail: jest.fn().mockResolvedValue(undefined),
  };
  const configService = {
    get: jest.fn().mockReturnValue(undefined),
  };

  // Chainable query builder mock for queryRunner.manager.createQueryBuilder
  const makeQbMock = (): Record<string, jest.Mock> => {
    const qb: Record<string, jest.Mock> = {};
    const chain = (): Record<string, jest.Mock> => qb;
    qb.select = jest.fn().mockReturnValue(qb);
    qb.from = jest.fn().mockReturnValue(qb);
    qb.innerJoin = jest.fn().mockReturnValue(qb);
    qb.where = jest.fn().mockReturnValue(qb);
    qb.andWhere = jest.fn().mockReturnValue(qb);
    qb.groupBy = jest.fn().mockReturnValue(qb);
    qb.having = jest.fn().mockReturnValue(qb);
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    qb.delete = jest.fn().mockReturnValue(qb);
    qb.execute = jest.fn().mockResolvedValue({});
    void chain;
    return qb;
  };

  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      update: jest.fn(),
      find: jest.fn(),
      findByIds: jest.fn(),
      createQueryBuilder: jest.fn(),
      query: jest.fn().mockResolvedValue(undefined),
    },
  };
  const dataSource = {
    query: jest.fn().mockResolvedValue([]),
    createQueryRunner: jest.fn(),
  };

  beforeEach(async () => {
    dataSource.createQueryRunner.mockReturnValue(queryRunner);
    queryRunner.manager.find.mockResolvedValue([]);
    queryRunner.manager.findByIds.mockResolvedValue([]);
    queryRunner.manager.update.mockResolvedValue({});
    queryRunner.manager.createQueryBuilder.mockReturnValue(makeQbMock());

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchoolsController],
      providers: [
        SchoolsService,
        { provide: getRepositoryToken(Schools), useValue: schoolRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(ClassSimulation), useValue: classSimulationRepo },
        { provide: getRepositoryToken(Invite), useValue: inviteRepo },
        { provide: DataSource, useValue: dataSource },
        {
          provide: EducatorSessionService,
          useValue: {
            isTokenInvalidated: jest.fn().mockResolvedValue(false),
            invalidateBySchool: jest.fn().mockResolvedValue([]),
          },
        },
        { provide: NotificationsGateway, useValue: { notifyEducatorSchoolDeactivated: jest.fn() } },
        { provide: MailService, useValue: mailService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    controller = module.get(SchoolsController);
    service = module.get(SchoolsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('UNIT: creates school successfully', async () => {
      schoolRepo.create.mockReturnValue(makeSchool());
      schoolRepo.save.mockResolvedValue(makeSchool());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      const result = await service.create('user-1', { school_name: 'Test School' });
      expect(result.success).toBe(true);
    });

    it('UNIT: returns failure when save returns array', async () => {
      schoolRepo.create.mockReturnValue(makeSchool());
      schoolRepo.save.mockResolvedValue([makeSchool()]);
      const result = await service.create('user-1', { school_name: 'X' });
      expect(result.success).toBe(false);
    });

    it('INTEGRATION: throws ForbiddenException for non-District Admin', async () => {
      await expect(controller.create({ school_name: 'X' }, educatorReq)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('INTEGRATION: throws ForbiddenException when user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(controller.create({ school_name: 'X' }, districtReq)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('INTEGRATION: throws ForbiddenException when user inactive', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ status: CommonStatus.INACTIVE }));
      await expect(controller.create({ school_name: 'X' }, districtReq)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('INTEGRATION: throws BadRequestException when school exists', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      await expect(controller.create({ school_name: 'Test School' }, districtReq)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('INTEGRATION: creates successfully', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(makeSchool());
      schoolRepo.create.mockReturnValue(makeSchool());
      schoolRepo.save.mockResolvedValue(makeSchool());
      const result = await controller.create({ school_name: 'Test School' }, districtReq);
      expect(result.data).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('UNIT: returns schools for user', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([makeSchool()]),
      };
      schoolRepo.createQueryBuilder.mockReturnValue(qb);
      const result = await service.findAll('user-1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('INTEGRATION: GET /schools/user — returns list', async () => {
      jest
        .spyOn(service, 'findAll')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [makeSchool()] });
      const result = await controller.findAll(districtReq);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('findByAdmin', () => {
    it('INTEGRATION: throws when non-owner and not Super Admin', async () => {
      await expect(controller.findByAdmin({ adminId: 'other' }, educatorReq)).rejects.toThrow();
    });

    it('INTEGRATION: Super Admin can fetch any admin schools', async () => {
      const superReq = makeReq('super-1', ['Super Admin']);
      jest
        .spyOn(service, 'findAll')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [] });
      const result = await controller.findByAdmin({ adminId: 'other' }, superReq);
      expect(result.data).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('UNIT: returns school', async () => {
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      const result = await service.findOne(makeSchool());
      expect(result.data?.id).toBe('school-1');
    });

    it('INTEGRATION: throws NotFoundException when not found', async () => {
      schoolRepo.findOne.mockResolvedValue(null);
      await expect(controller.findOne({ id: 'bad' }, districtReq)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('INTEGRATION: returns school', async () => {
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      const result = await controller.findOne({ id: 'school-1' }, districtReq);
      expect((result.data as Schools).id).toBe('school-1');
    });
  });

  describe('update', () => {
    it('UNIT: updates school name', async () => {
      const updated = makeSchool({ school_name: 'New' });
      schoolRepo.save.mockResolvedValue(updated);
      schoolRepo.findOne.mockResolvedValue(updated);
      const result = await service.update(makeSchool(), { school_name: 'New' });
      expect(result.data?.school_name).toBe('New');
    });

    it('INTEGRATION: throws NotFoundException when not found', async () => {
      schoolRepo.findOne.mockResolvedValue(null);
      await expect(
        controller.update({ id: 'bad' }, { school_name: 'X' }, districtReq),
      ).rejects.toThrow(NotFoundException);
    });

    it('INTEGRATION: updates successfully', async () => {
      schoolRepo.findOne
        .mockResolvedValueOnce(makeSchool())
        .mockResolvedValueOnce(makeSchool({ school_name: 'New' }));
      schoolRepo.save.mockResolvedValue(makeSchool({ school_name: 'New' }));
      const result = await controller.update(
        { id: 'school-1' },
        { school_name: 'New' },
        districtReq,
      );
      expect((result.data as Schools).school_name).toBe('New');
    });
  });

  describe('remove', () => {
    it('UNIT: removes school', async () => {
      const result = await service.remove(makeSchool());
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('INTEGRATION: throws ForbiddenException when user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(controller.remove({ id: 'school-1' }, districtReq)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('INTEGRATION: throws NotFoundException when school not found', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(null);
      await expect(controller.remove({ id: 'bad' }, districtReq)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('INTEGRATION: deletes successfully', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      const result = await controller.remove({ id: 'school-1' }, districtReq);
      expect(result.data).toBeNull();
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
    });
  });

  describe('regression', () => {
    it('create: uses req.user.userId when dto.user_id not provided', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(makeSchool());
      schoolRepo.create.mockReturnValue(makeSchool());
      schoolRepo.save.mockResolvedValue(makeSchool());
      const spy = jest.spyOn(service, 'findUserById');
      await controller.create({ school_name: 'X' }, districtReq);
      expect(spy).toHaveBeenCalledWith('user-1');
    });

    it('update: status unchanged when not in dto', async () => {
      const school = makeSchool();
      schoolRepo.findOne.mockResolvedValueOnce(school).mockResolvedValueOnce(school);
      schoolRepo.save.mockResolvedValue(school);
      const result = await controller.update(
        { id: 'school-1' },
        { school_name: 'Only Name' },
        districtReq,
      );
      expect((result.data as Schools).status).toBe(CommonStatus.ACTIVE);
    });
  });
});
