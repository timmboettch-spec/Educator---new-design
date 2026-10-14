import { Test, TestingModule } from '@nestjs/testing';
import { GuidedPathService } from '../../../src/guided-path/guided-path.service';
import { GUIDED_PATH_REPOSITORY } from 'src/database/tokens';
import { GuidedPath } from 'src/database/entities';
import { RoleSlug } from 'src/common/constants';
import type { ICurrentUser } from 'src/common/interfaces';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const GUIDED_PATH_ID = '33333333-3333-3333-3333-333333333333';

const currentUser: ICurrentUser = { userId: USER_ID, roles: [RoleSlug.EDUCATOR] };

const existingGuidedPath: GuidedPath = {
  guidedPathId: GUIDED_PATH_ID,
  userId: USER_ID,
  roleType: RoleSlug.EDUCATOR,
  state: { step1: true, step2: false },
  completed: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('GuidedPathService', () => {
  let service: GuidedPathService;

  const guidedPathRepository = {
    findOrCreateByUserAndRole: jest.fn(),
    upsertByUserAndRole: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuidedPathService,
        { provide: GUIDED_PATH_REPOSITORY, useValue: guidedPathRepository },
      ],
    }).compile();

    service = module.get(GuidedPathService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getOrCreate', () => {
    it('returns the existing record when one already exists for the (userId, roleType)', async () => {
      guidedPathRepository.findOrCreateByUserAndRole.mockResolvedValue(existingGuidedPath);

      const result = await service.getOrCreate(currentUser, RoleSlug.EDUCATOR);

      expect(result).toEqual(existingGuidedPath);
      expect(guidedPathRepository.findOrCreateByUserAndRole).toHaveBeenCalledWith(
        USER_ID,
        RoleSlug.EDUCATOR,
      );
    });

    it('creates and returns a default record when none exists yet', async () => {
      const defaultGuidedPath: GuidedPath = {
        ...existingGuidedPath,
        state: {},
        completed: false,
      };
      guidedPathRepository.findOrCreateByUserAndRole.mockResolvedValue(defaultGuidedPath);

      const result = await service.getOrCreate(currentUser, RoleSlug.EDUCATOR);

      expect(result.state).toEqual({});
      expect(result.completed).toBe(false);
    });
  });

  describe('upsert', () => {
    it('stores district admin progress under the district admin role, apart from the educator row', async () => {
      const adminUser: ICurrentUser = { userId: USER_ID, roles: [RoleSlug.DISTRICT_ADMIN] };
      guidedPathRepository.upsertByUserAndRole.mockResolvedValue({
        ...existingGuidedPath,
        roleType: RoleSlug.DISTRICT_ADMIN,
      });

      await service.upsert(adminUser, RoleSlug.DISTRICT_ADMIN, { completed: true });

      expect(guidedPathRepository.upsertByUserAndRole).toHaveBeenCalledWith(
        USER_ID,
        RoleSlug.DISTRICT_ADMIN,
        { completed: true },
      );
    });

    it('applies state-only update and leaves completed untouched in the payload', async () => {
      guidedPathRepository.upsertByUserAndRole.mockResolvedValue({
        ...existingGuidedPath,
        state: { step1: true },
      });

      await service.upsert(currentUser, RoleSlug.EDUCATOR, { state: { step1: true } });

      expect(guidedPathRepository.upsertByUserAndRole).toHaveBeenCalledWith(
        USER_ID,
        RoleSlug.EDUCATOR,
        { state: { step1: true } },
      );
    });

    it('applies completed-only update and leaves state untouched in the payload', async () => {
      guidedPathRepository.upsertByUserAndRole.mockResolvedValue({
        ...existingGuidedPath,
        completed: true,
      });

      await service.upsert(currentUser, RoleSlug.EDUCATOR, { completed: true });

      expect(guidedPathRepository.upsertByUserAndRole).toHaveBeenCalledWith(
        USER_ID,
        RoleSlug.EDUCATOR,
        { completed: true },
      );
    });

    it('applies both state and completed independently when both are provided', async () => {
      guidedPathRepository.upsertByUserAndRole.mockResolvedValue({
        ...existingGuidedPath,
        state: { step1: true },
        completed: true,
      });

      await service.upsert(currentUser, RoleSlug.EDUCATOR, {
        state: { step1: true },
        completed: true,
      });

      expect(guidedPathRepository.upsertByUserAndRole).toHaveBeenCalledWith(
        USER_ID,
        RoleSlug.EDUCATOR,
        { state: { step1: true }, completed: true },
      );
    });

    it('rejects when neither state nor completed is provided', async () => {
      await expect(service.upsert(currentUser, RoleSlug.EDUCATOR, {})).rejects.toBeTruthy();
      expect(guidedPathRepository.upsertByUserAndRole).not.toHaveBeenCalled();
    });

    it('fully replaces (does not deep-merge) the state blob when a new one is provided', async () => {
      guidedPathRepository.upsertByUserAndRole.mockResolvedValue({
        ...existingGuidedPath,
        state: { stepA: true },
      });

      const result = await service.upsert(currentUser, RoleSlug.EDUCATOR, {
        state: { stepA: true },
      });

      expect(result.state).toEqual({ stepA: true });
      expect(result.state).not.toHaveProperty('step1');
      expect(result.state).not.toHaveProperty('step2');
    });

    it('succeeds identically whether or not a row already exists (upsert semantics)', async () => {
      guidedPathRepository.upsertByUserAndRole.mockResolvedValue(existingGuidedPath);

      const firstWrite = await service.upsert(currentUser, RoleSlug.EDUCATOR, { completed: true });
      const secondWrite = await service.upsert(currentUser, RoleSlug.EDUCATOR, { completed: true });

      expect(firstWrite).toEqual(existingGuidedPath);
      expect(secondWrite).toEqual(existingGuidedPath);
      expect(guidedPathRepository.upsertByUserAndRole).toHaveBeenCalledTimes(2);
    });
  });
});
