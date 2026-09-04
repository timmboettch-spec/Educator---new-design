import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UsersController } from '../../../src/users/users.controller';
import { UsersService } from '../../../src/users/users.service';
import { EducatorsService } from '../../../src/educators/educators.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../../../src/users/entity/user.entity';
import { Role } from '../../../src/roles/entity/role.entity';
import { Educator } from '../../../src/educators/entity/educator.entity';
import { AzureBlobService } from 'src/config/azure-blob.config';
import { InvitesService } from '../../../src/invites/invites.service';
import { CommonStatus } from 'src/common/enums/status.enum';
import { AppStatus } from 'src/common/utils/messages';
import { JwtRequest } from 'src/common/types';
import * as bcrypt from 'bcrypt';

const makeReq = (userId: string, type = 'admin'): JwtRequest => {
  const req = Object.assign(new Request('http://localhost'), { user: { userId, type } });
  return req;
};

const makeUser = (o: Partial<User> = {}): User =>
  ({
    id: 'u-1',
    email: 'admin@test.com',
    password: 'hash',
    status: CommonStatus.ACTIVE,
    ...o,
  }) as User;

describe('Users (Controller + Service)', () => {
  let controller: UsersController;
  let service: UsersService;

  const userRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };
  const roleRepo = { findOne: jest.fn() };
  const educatorRepo = { findOne: jest.fn(), save: jest.fn() };
  const educatorsService = { updateProfile: jest.fn() };
  const invitesService = { findInviteById: jest.fn(), acceptInvite: jest.fn() };
  const azureBlobService = { uploadFile: jest.fn(), generateSasUrl: jest.fn().mockResolvedValue('https://img.com/pic.png') };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        UsersService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: EducatorsService, useValue: educatorsService },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: getRepositoryToken(Educator), useValue: educatorRepo },
        { provide: InvitesService, useValue: invitesService },
        { provide: AzureBlobService, useValue: azureBlobService },
      ],
    }).compile();
    controller = module.get(UsersController);
    service = module.get(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('UNIT: returns formatted users list', async () => {
      userRepo.find.mockResolvedValue([
        makeUser({ role: { id: 'r-1', role_name: 'District Admin' } as Role }),
      ]);
      const result = await service.findAll();
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('UNIT: returns empty array when no users', async () => {
      userRepo.find.mockResolvedValue([]);
      const result = await service.findAll();
      expect(result.data).toHaveLength(0);
    });

    it('INTEGRATION: GET /users — returns SUCCESS', async () => {
      jest
        .spyOn(service, 'findAll')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [] });
      const result = await controller.findAll();
      expect(result.status).toBe(AppStatus.SUCCESS);
    });

    it('REGRESSION: role is null when user has no role', async () => {
      userRepo.find.mockResolvedValue([makeUser({ role: undefined })]);
      const result = await service.findAll();
      expect(result.data![0].role).toBeNull();
    });
  });

  describe('findById', () => {
    it('UNIT: returns user when found', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      const result = await service.findById('u-1');
      expect(result.success).toBe(true);
    });

    it('UNIT: returns failure when not found', async () => {
      userRepo.findOne.mockResolvedValue(null);
      const result = await service.findById('bad');
      expect(result.success).toBe(false);
    });

    it('INTEGRATION: GET /users/:id — throws when not found', async () => {
      jest
        .spyOn(service, 'findById')
        .mockResolvedValue({ success: false, message: 'Not found', type: 'notfound' });
      await expect(controller.findOne('bad-uuid')).rejects.toThrow();
    });
  });

  describe('updateProfile', () => {
    it('UNIT: updates full_name', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ full_name: 'Old' }));
      userRepo.save.mockResolvedValue(makeUser({ full_name: 'New' }));
      const result = await service.updateProfile('u-1', { full_name: 'New' });
      expect(result.success).toBe(true);
      expect(result.data?.full_name).toBe('New');
    });

    it('UNIT: returns failure when user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);
      const result = await service.updateProfile('bad', { full_name: 'X' });
      expect(result.success).toBe(false);
    });

    it('INTEGRATION: PUT /users/profile — admin path', async () => {
      jest.spyOn(service, 'updateProfile').mockResolvedValue({
        success: true,
        message: 'Updated',
        data: { id: 'u-1', full_name: 'New', profile_picture: null },
      });

      const result = await controller.updateProfile(makeReq('u-1'), { full_name: 'New' });
      expect(result.status).toBe(AppStatus.SUCCESS);
    });

    it('INTEGRATION: PUT /users/profile — educator path delegates to educatorsService', async () => {
      educatorsService.updateProfile.mockResolvedValue({
        success: true,
        message: 'Updated',
        data: { id: 'edu-1', full_name: 'New', profile_picture: null },
      });
      const result = await controller.updateProfile(makeReq('edu-1', 'educator'), {
        full_name: 'New',
      });
      expect(result.status).toBe(AppStatus.SUCCESS);
      expect(educatorsService.updateProfile).toHaveBeenCalled();
    });

    it('REGRESSION: non-http profile_picture sanitized to null', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ profile_picture: 'invalid-url' }));
      userRepo.save.mockResolvedValue(makeUser({ profile_picture: 'invalid-url' }));
      const result = await service.updateProfile('u-1', {});
      expect(result.data?.profile_picture).toBeNull();
    });
  });

  describe('changePassword', () => {
    it('UNIT: changes password successfully', async () => {
      const hash = await bcrypt.hash('old', 10);
      userRepo.findOne.mockResolvedValue(makeUser({ password: hash }));
      userRepo.save.mockResolvedValue(makeUser());
      const result = await service.changePassword('u-1', 'old', 'new');
      expect(result.success).toBe(true);
    });

    it('UNIT: fails with wrong old password', async () => {
      const hash = await bcrypt.hash('correct', 10);
      userRepo.findOne.mockResolvedValue(makeUser({ password: hash }));
      const result = await service.changePassword('u-1', 'wrong', 'new');
      expect(result.success).toBe(false);
    });

    it('UNIT: changes educator password', async () => {
      const hash = await bcrypt.hash('old', 10);
      userRepo.findOne.mockResolvedValue(null);
      educatorRepo.findOne.mockResolvedValue({ id: 'edu-1', password: hash });
      educatorRepo.save.mockResolvedValue({});
      const result = await service.changePassword('edu-1', 'old', 'new');
      expect(result.success).toBe(true);
    });

    it('UNIT: fails when neither user nor educator found', async () => {
      userRepo.findOne.mockResolvedValue(null);
      educatorRepo.findOne.mockResolvedValue(null);
      const result = await service.changePassword('bad', 'old', 'new');
      expect(result.success).toBe(false);
    });

    it('INTEGRATION: PUT /users/change-password — returns SUCCESS', async () => {
      jest
        .spyOn(service, 'changePassword')
        .mockResolvedValue({ success: true, message: 'Changed', data: null });
      const result = await controller.changePassword({
        user_id: 'u-1',
        old_password: 'old',
        new_password: 'new',
      });
      expect(result.status).toBe(AppStatus.SUCCESS);
    });
  });

  describe('getProfilePicture', () => {
    it('UNIT: returns profile picture URL', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ profile_picture: 'https://img.com/pic.png' }));
      const result = await service.getProfilePicture('u-1');
      expect(result).toBe('https://img.com/pic.png');
    });

    it('UNIT: returns null when no profile picture', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ profile_picture: undefined }));
      const result = await service.getProfilePicture('u-1');
      expect(result == null || result === '').toBe(true);
    });

    it('INTEGRATION: GET /users/profile-picture — returns data', async () => {
      jest.spyOn(service, 'getProfilePicture').mockResolvedValue('https://img.com/pic.png');
      const result = await controller.getProfilePicture(makeReq('u-1'));
      expect(result.status).toBe(AppStatus.SUCCESS);
    });
  });
});
