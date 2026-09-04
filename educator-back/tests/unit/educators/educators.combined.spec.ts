import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EducatorsController } from '../../../src/educators/educators.controller';
import { EducatorsService } from '../../../src/educators/educators.service';
import { Educator } from '../../../src/educators/entity/educator.entity';
import { EducatorSchool } from '../../../src/educators/entity/educator-school.entity';
import { User } from '../../../src/users/entity/user.entity';
import { Schools } from '../../../src/schools/entity/schools.entity';
import { Invite } from '../../../src/invites/entity/invite.entity';
import { Class } from '../../../src/class/entity/class.entity';
import { Student } from '../../../src/students/entity/students.entity';
import { ClassSimulation } from '../../../src/class-simulations/entity/class-simulation.entity';
import { AzureBlobService } from '../../../src/config/azure-blob.config';
import { MailService } from '../../../src/mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { EducatorSessionService } from '../../../src/session/educator-session.service';
import { TutorPatientService } from '../../../src/common/utils/tutor-patient.service';
import { CommonStatus } from 'src/common/enums/status.enum';
import { JwtRequest } from 'src/common/types';
import { AppStatus } from 'src/common/utils/messages';

const makeReq = (userId: string, roles: string[] = ['Admin']): JwtRequest => {
  const req = Object.assign(new Request('http://localhost'), { user: { userId, roles } });
  return req;
};

const makeEducator = (o: Partial<Educator> = {}): Educator =>
  ({
    id: 'edu-1',
    email: 'edu@test.com',
    full_name: 'Test Educator',
    status: CommonStatus.ACTIVE,
    is_active: true,
    tokens: 10,
    created_at: new Date(),
    updated_at: new Date(),
    admin: { id: 'admin-1' } as User,
    school: { id: 'school-1', school_name: 'Test School' } as Schools,
    ...o,
  }) as Educator;

const makeSchool = (o: Partial<Schools> = {}): Schools =>
  ({ id: 'school-1', school_name: 'Test School', ...o }) as Schools;

const adminReq = makeReq('admin-1');

describe('Educators (Controller + Service)', () => {
  let controller: EducatorsController;
  let service: EducatorsService;

  const educatorRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    create: jest.fn(),
  };
  const userRepo = { findOne: jest.fn() };
  const schoolRepo = { findOne: jest.fn() };
  const classRepo = { find: jest.fn(), findOne: jest.fn() };
  const studentRepo = { find: jest.fn(), findOne: jest.fn() };
  const classSimulationRepo = { find: jest.fn(), findOne: jest.fn() };
  const inviteRepo = { findOne: jest.fn(), delete: jest.fn(), save: jest.fn(), create: jest.fn() };
  const azureBlobService = { uploadFile: jest.fn(), isConfigured: jest.fn().mockReturnValue(true), generateSasUrl: jest.fn().mockImplementation((url: string) => Promise.resolve(url)) };
  const dataSource = { query: jest.fn(), transaction: jest.fn() };
  const mailService = { sendMail: jest.fn().mockResolvedValue(undefined) };
  const configService = { get: jest.fn().mockReturnValue('http://localhost:5173') };
  const notificationsGateway = {
    notifyAccountDeleted: jest.fn(),
    notifyAccountDeactivated: jest.fn(),
    notifyAdminEducatorLowSeatWarning: jest.fn(),
    notifyAdminSchoolLowSeatWarning: jest.fn(),
    notifyAdminEducatorSeatRequest: jest.fn().mockResolvedValue(undefined),
  };
  const educatorSessionService = {
    invalidateEducator: jest.fn().mockResolvedValue(undefined),
    invalidateBySchool: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EducatorsController],
      providers: [
        EducatorsService,
        { provide: getRepositoryToken(Educator), useValue: educatorRepo },
        { provide: getRepositoryToken(EducatorSchool), useValue: { findOne: jest.fn(), count: jest.fn().mockResolvedValue(0), save: jest.fn().mockResolvedValue({}), remove: jest.fn().mockResolvedValue({}), update: jest.fn() } },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Schools), useValue: schoolRepo },
        { provide: getRepositoryToken(Class), useValue: classRepo },
        { provide: getRepositoryToken(Student), useValue: studentRepo },
        { provide: getRepositoryToken(ClassSimulation), useValue: classSimulationRepo },
        { provide: getRepositoryToken(Invite), useValue: inviteRepo },
        { provide: AzureBlobService, useValue: azureBlobService },
        { provide: DataSource, useValue: dataSource },
        { provide: MailService, useValue: mailService },
        { provide: ConfigService, useValue: configService },
        { provide: NotificationsGateway, useValue: notificationsGateway },
        { provide: EducatorSessionService, useValue: educatorSessionService },
        { provide: TutorPatientService, useValue: { getReportsByStudentIds: jest.fn().mockResolvedValue({ matched: [], isMatch: false }) } },
      ],
    }).compile();
    controller = module.get(EducatorsController);
    service = module.get(EducatorsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('UNIT: returns educators for admin', async () => {
      educatorRepo.find.mockResolvedValue([makeEducator()]);
      const result = await service.findAll('admin-1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('UNIT: returns empty array when none', async () => {
      educatorRepo.find.mockResolvedValue([]);
      const result = await service.findAll('admin-1');
      expect(result.data).toHaveLength(0);
    });

    it('INTEGRATION: GET /educators — returns list', async () => {
      jest
        .spyOn(service, 'findAll')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [makeEducator()] });
      const result = await controller.findAll(adminReq);
      expect(result.status).toBe(AppStatus.SUCCESS);
    });

    it('INTEGRATION: GET /educators/admin/:adminId — same admin succeeds', async () => {
      jest
        .spyOn(service, 'findAll')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [] });
      const result = await controller.findByAdmin('admin-1', adminReq);
      expect(result.status).toBe(AppStatus.SUCCESS);
    });

    it('REGRESSION: different admin throws', async () => {
      await expect(controller.findByAdmin('other-admin', adminReq)).rejects.toThrow();
    });

    it('REGRESSION: Super Admin can fetch any admin educators', async () => {
      const superReq = makeReq('super-1', ['Super Admin']);
      jest
        .spyOn(service, 'findAll')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [] });
      const result = await controller.findByAdmin('other-admin', superReq);
      expect(result.status).toBe(AppStatus.SUCCESS);
    });
  });

  describe('findOne', () => {
    it('UNIT: returns educator', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      const result = await service.findOne(makeEducator());
      expect(result.data?.id).toBe('edu-1');
    });

    it('INTEGRATION: throws NotFoundException when not found', async () => {
      jest.spyOn(service, 'findById').mockResolvedValue({ success: false, message: 'Not found', type: 'notfound' });
      await expect(controller.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('INTEGRATION: returns educator', async () => {
      jest.spyOn(service, 'findById').mockResolvedValue({
        success: true,
        message: 'Fetched',
        data: makeEducator(),
      });
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue({ success: true, message: 'Fetched', data: makeEducator() });
      const result = await controller.findOne('edu-1');
      expect((result.data as Educator).id).toBe('edu-1');
    });
  });

  describe('update', () => {
    it('UNIT: updates full_name', async () => {
      const updated = makeEducator({ full_name: 'New Name' });
      educatorRepo.save.mockResolvedValue(updated);
      educatorRepo.findOne.mockResolvedValue(updated);
      const result = await service.update(makeEducator(), { full_name: 'New Name' });
      expect(result.data?.full_name).toBe('New Name');
    });

    it('UNIT: updates status', async () => {
      const updated = makeEducator({ status: CommonStatus.INACTIVE });
      educatorRepo.save.mockResolvedValue(updated);
      educatorRepo.findOne.mockResolvedValue(updated);
      const result = await service.update(makeEducator(), { status: CommonStatus.INACTIVE });
      expect(result.data?.status).toBe(CommonStatus.INACTIVE);
    });

    it('INTEGRATION: throws NotFoundException when not found', async () => {
      jest.spyOn(service, 'findByIdAndOwner').mockResolvedValue(null);
      await expect(controller.update('bad-id', { full_name: 'X' }, adminReq)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('INTEGRATION: throws BadRequestException when school not owned', async () => {
      jest.spyOn(service, 'findByIdAndOwner').mockResolvedValue(makeEducator());
      jest.spyOn(service, 'findSchoolByOwner').mockResolvedValue(null);
      await expect(
        controller.update('edu-1', { school_id: 'bad-school' }, adminReq),
      ).rejects.toThrow(BadRequestException);
    });

    it('INTEGRATION: updates successfully', async () => {
      jest.spyOn(service, 'findByIdAndOwner').mockResolvedValue(makeEducator());
      jest.spyOn(service, 'update').mockResolvedValue({
        success: true,
        message: 'Updated',
        data: makeEducator({ full_name: 'New' }),
      });
      const result = await controller.update('edu-1', { full_name: 'New' }, adminReq);
      expect((result.data as Educator).full_name).toBe('New');
    });
  });

  describe('remove', () => {
    it('UNIT: removes educator', async () => {
      dataSource.query.mockResolvedValue([]);
      classRepo.find.mockResolvedValue([]);
      dataSource.transaction.mockImplementation(async (cb: (manager: unknown) => Promise<void>) => {
        const manager = {
          findOne: jest.fn()
            .mockResolvedValueOnce(makeEducator())
            .mockResolvedValueOnce(null),
          find: jest.fn().mockResolvedValue([]),
          save: jest.fn().mockResolvedValue({}),
          query: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockResolvedValue({}),
        };
        await cb(manager);
      });
      const result = await service.remove(makeEducator());
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('INTEGRATION: throws NotFoundException when not found', async () => {
      jest.spyOn(service, 'findByIdAndOwner').mockResolvedValue(null);
      await expect(controller.remove('bad-id', adminReq)).rejects.toThrow(NotFoundException);
    });

    it('INTEGRATION: deletes successfully', async () => {
      jest.spyOn(service, 'findByIdAndOwner').mockResolvedValue(makeEducator());
      jest
        .spyOn(service, 'remove')
        .mockResolvedValue({ success: true, message: 'Deleted', data: null });
      const result = await controller.remove('edu-1', adminReq);
      expect(result.data).toBeNull();
    });
  });

  describe('tokens', () => {
    it('UNIT: availableTokens returns count', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator({ tokens: 10 }));
      expect(await service.availableTokens('edu-1')).toBe(10);
    });

    it('UNIT: availableTokens returns 0 when not found', async () => {
      educatorRepo.findOne.mockResolvedValue(null);
      expect(await service.availableTokens('bad')).toBe(0);
    });

    it('UNIT: updateToken deducts correctly', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator({ tokens: 10 }));
      educatorRepo.save.mockResolvedValue(makeEducator({ tokens: 7 }));
      await service.updateToken('edu-1', 3);
      expect(educatorRepo.save).toHaveBeenCalledWith(expect.objectContaining({ tokens: 7 }));
    });

    it('UNIT: updateToken does not go below 0', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator({ tokens: 2 }));
      educatorRepo.save.mockResolvedValue(makeEducator({ tokens: 0 }));
      await service.updateToken('edu-1', 10);
      expect(educatorRepo.save).toHaveBeenCalledWith(expect.objectContaining({ tokens: 0 }));
    });

    it('UNIT: updateToken no-op when educator not found', async () => {
      educatorRepo.findOne.mockResolvedValue(null);
      await service.updateToken('bad', 5);
      expect(educatorRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('updateProfile', () => {
    it('UNIT: returns not found when educator missing', async () => {
      educatorRepo.findOne.mockResolvedValue(null);
      const result = await service.updateProfile('bad', { full_name: 'X' });
      expect(result.success).toBe(false);
    });

    it('UNIT: updates full_name', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      educatorRepo.save.mockResolvedValue(makeEducator({ full_name: 'New' }));
      const result = await service.updateProfile('edu-1', { full_name: 'New' });
      expect(result.success).toBe(true);
      expect(result.data?.full_name).toBe('New');
    });

    it('UNIT: uploads profile picture when file provided', async () => {
      azureBlobService.uploadFile.mockResolvedValue('https://azure.blob/pic.png');
      const updatedEducator = makeEducator({ profile_picture: 'https://azure.blob/pic.png' });
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      educatorRepo.save.mockResolvedValue(updatedEducator);
      const file = {
        buffer: Buffer.from('img'),
        originalname: 'pic.png',
        mimetype: 'image/png',
      } as Express.Multer.File;
      const result = await service.updateProfile('edu-1', {}, file);
      expect(result.success).toBe(true);
      expect(azureBlobService.uploadFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('service helpers', () => {
    it('findByIdAndOwner returns educator', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      expect((await service.findByIdAndOwner('edu-1', 'admin-1'))?.id).toBe('edu-1');
    });

    it('findByIdAndOwner returns null for wrong admin', async () => {
      educatorRepo.findOne.mockResolvedValue(null);
      expect(await service.findByIdAndOwner('edu-1', 'wrong')).toBeNull();
    });

    it('findSchoolByOwner returns school', async () => {
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      expect((await service.findSchoolByOwner('school-1', 'admin-1'))?.id).toBe('school-1');
    });
  });

  describe('requestMoreSeats', () => {
    // Reset the in-process cooldown map between tests so each case starts
    // clean without leaking state into the next one.
    beforeEach(() => {
      const cooldown = (
        service.constructor as unknown as { seatRequestCooldown: Map<string, number> }
      ).seatRequestCooldown;
      cooldown.clear();
    });

    it('UNIT: sends notification + email and returns success', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      userRepo.findOne.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@test.com',
        full_name: 'Admin User',
      });

      const result = await service.requestMoreSeats('edu-1', {
        requested_seats: 20,
        note: 'Need more for new class',
      });

      expect(result.success).toBe(true);
      expect(notificationsGateway.notifyAdminEducatorSeatRequest).toHaveBeenCalledWith(
        'admin-1',
        'edu-1',
        'Test Educator',
        'edu@test.com',
        20,
        10,
        'Need more for new class',
      );
      expect(mailService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'admin@test.com',
          template: 'educator-seat-request',
        }),
      );
    });

    it('UNIT: succeeds without requested_seats or note (general CTA)', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      userRepo.findOne.mockResolvedValue({ id: 'admin-1', email: 'admin@test.com' });

      const result = await service.requestMoreSeats('edu-1', {});
      expect(result.success).toBe(true);
      expect(notificationsGateway.notifyAdminEducatorSeatRequest).toHaveBeenCalledWith(
        'admin-1',
        'edu-1',
        'Test Educator',
        'edu@test.com',
        null,
        10,
        undefined,
      );
    });

    it('UNIT: returns not found when educator is inactive/missing', async () => {
      educatorRepo.findOne.mockResolvedValue(null);
      const result = await service.requestMoreSeats('nope', { requested_seats: 5 });
      expect(result.success).toBe(false);
      expect(notificationsGateway.notifyAdminEducatorSeatRequest).not.toHaveBeenCalled();
    });

    it('UNIT: returns admin-not-found when educator has no admin owner', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator({ admin: null }));
      const result = await service.requestMoreSeats('edu-1', {});
      expect(result.success).toBe(false);
      expect(notificationsGateway.notifyAdminEducatorSeatRequest).not.toHaveBeenCalled();
    });

    it('UNIT: enforces cooldown on rapid repeat requests', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      userRepo.findOne.mockResolvedValue({ id: 'admin-1', email: 'admin@test.com' });

      const first = await service.requestMoreSeats('edu-1', { requested_seats: 5 });
      expect(first.success).toBe(true);

      const second = await service.requestMoreSeats('edu-1', { requested_seats: 5 });
      expect(second.success).toBe(false);
      expect(notificationsGateway.notifyAdminEducatorSeatRequest).toHaveBeenCalledTimes(1);
    });

    it('UNIT: does not fail request when email send throws', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      userRepo.findOne.mockResolvedValue({ id: 'admin-1', email: 'admin@test.com' });
      mailService.sendMail.mockRejectedValueOnce(new Error('SMTP down'));

      const result = await service.requestMoreSeats('edu-1', { requested_seats: 5 });
      expect(result.success).toBe(true);
    });
  });
});
