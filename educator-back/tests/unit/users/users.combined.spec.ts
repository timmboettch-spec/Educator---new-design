import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UsersController } from '../../../src/users/users.controller';
import { UsersService } from '../../../src/users/users.service';
import { EducatorsService } from '../../../src/educators/educators.service';
import { User, Role, UserRole, Educator } from 'src/database/entities';
import {
  DISTRICT_ADMIN_REPOSITORY,
  EDUCATOR_REPOSITORY,
  ROLE_REPOSITORY,
  USER_REPOSITORY,
  USER_ROLE_REPOSITORY,
} from 'src/database/tokens';
import { DatabaseService } from 'src/database/services/database.service';
import { AzureBlobService, LoggerService } from 'src/common/services';
import { InvitesService } from '../../../src/invites/invites.service';
import { CommonStatus } from 'src/common/enums/status.enum';
import { AppStatus } from 'src/common/utils/messages';
import { JwtRequest } from 'src/common/types';
import { UserTokenType } from 'src/common/constants';
import * as bcrypt from 'bcrypt';

const makeReq = (userId: string, type = UserTokenType.ADMIN): JwtRequest => {
  const req = Object.assign(new Request('http://localhost'), {
    user: { userId, educatorId: userId, type },
  });
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
    findByIdWithPassword: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };
  const roleRepo = { findOne: jest.fn() };
  const educatorRepo = { findOne: jest.fn(), update: jest.fn() };
  const userRoleRepo = {
    update: jest.fn(),
    findById: jest.fn(),
    findByUserAndRoleSlug: jest.fn(),
  };
  const districtAdminRepo = {
    findByUserRoleId: jest.fn(),
    updateByUserRoleId: jest.fn(),
  };
  const educatorsService = { updateProfile: jest.fn() };
  const invitesService = { findInviteById: jest.fn(), markInviteAccepted: jest.fn() };
  const azureBlobService = {
    uploadFile: jest.fn(),
    generateSasUrl: jest.fn().mockResolvedValue('https://img.com/pic.png'),
  };
  const databaseService = {
    connection: { createQueryBuilder: jest.fn() },
    pingCheck: jest.fn(),
    runInTransaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        UsersService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: EducatorsService, useValue: educatorsService },
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: ROLE_REPOSITORY, useValue: roleRepo },
        { provide: EDUCATOR_REPOSITORY, useValue: educatorRepo },
        { provide: USER_ROLE_REPOSITORY, useValue: userRoleRepo },
        { provide: DISTRICT_ADMIN_REPOSITORY, useValue: districtAdminRepo },
        { provide: InvitesService, useValue: invitesService },
        { provide: AzureBlobService, useValue: azureBlobService },
        { provide: DatabaseService, useValue: databaseService },
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
    controller = module.get(UsersController);
    service = module.get(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('UNIT: returns formatted users list', async () => {
      userRepo.find.mockResolvedValue([
        makeUser({
          userRoles: [
            {
              status: CommonStatus.ACTIVE,
              role: { id: 'r-1', role_name: 'District Admin' } as Role,
            } as UserRole,
          ],
        }),
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

    it('REGRESSION: role is null when user has no role assignment', async () => {
      userRepo.find.mockResolvedValue([makeUser({ userRoles: [] })]);
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
    it('UNIT: updates fullName', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userRoleRepo.findByUserAndRoleSlug.mockResolvedValue({ userRoleId: 'da-role-1' });
      districtAdminRepo.findByUserRoleId.mockResolvedValue({
        userRoleId: 'da-role-1',
        fullName: 'Old',
      });
      districtAdminRepo.updateByUserRoleId.mockResolvedValue(undefined);
      const result = await service.updateProfile('u-1', { fullName: 'New' });
      expect(result.success).toBe(true);
      expect(result.data?.fullName).toBe('New');
      expect(districtAdminRepo.updateByUserRoleId).toHaveBeenCalledWith('da-role-1', {
        fullName: 'New',
        profilePicture: undefined,
      });
    });

    it('UNIT: returns failure when user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);
      const result = await service.updateProfile('bad', { fullName: 'X' });
      expect(result.success).toBe(false);
    });

    it('UNIT: returns failure when user has no linked District Admin role', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userRoleRepo.findByUserAndRoleSlug.mockResolvedValue(null);
      const result = await service.updateProfile('u-1', { fullName: 'New' });
      expect(result.success).toBe(false);
    });

    it('INTEGRATION: PUT /users/profile — admin path', async () => {
      jest.spyOn(service, 'updateProfile').mockResolvedValue({
        success: true,
        message: 'Updated',
        data: { id: 'u-1', fullName: 'New', profilePicture: null },
      });

      const result = await controller.updateProfile(makeReq('u-1'), { fullName: 'New' });
      expect(result.status).toBe(AppStatus.SUCCESS);
    });

    it('INTEGRATION: PUT /users/profile — educator path delegates to educatorsService', async () => {
      educatorsService.updateProfile.mockResolvedValue({
        success: true,
        message: 'Updated',
        data: { id: 'edu-1', full_name: 'New', profile_picture: null },
      });
      const result = await controller.updateProfile(makeReq('edu-1', UserTokenType.EDUCATOR), {
        fullName: 'New',
      });
      expect(result.status).toBe(AppStatus.SUCCESS);
      expect(educatorsService.updateProfile).toHaveBeenCalled();
    });

    it('REGRESSION: non-http profilePicture sanitized to null', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userRoleRepo.findByUserAndRoleSlug.mockResolvedValue({ userRoleId: 'da-role-1' });
      districtAdminRepo.findByUserRoleId.mockResolvedValue({
        userRoleId: 'da-role-1',
        profilePicture: 'invalid-url',
      });
      const result = await service.updateProfile('u-1', {});
      expect(result.data?.profilePicture).toBeNull();
    });
  });

  describe('getProfilePicture', () => {
    it('UNIT: returns profile picture URL', async () => {
      userRoleRepo.findByUserAndRoleSlug.mockResolvedValue({ userRoleId: 'da-role-1' });
      districtAdminRepo.findByUserRoleId.mockResolvedValue({
        userRoleId: 'da-role-1',
        profilePicture: 'https://img.com/pic.png',
      });
      const result = await service.getProfilePicture('u-1');
      expect(result).toBe('https://img.com/pic.png');
    });

    it('UNIT: returns null when no profile picture', async () => {
      userRoleRepo.findByUserAndRoleSlug.mockResolvedValue({ userRoleId: 'da-role-1' });
      districtAdminRepo.findByUserRoleId.mockResolvedValue({
        userRoleId: 'da-role-1',
        profilePicture: undefined,
      });
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
