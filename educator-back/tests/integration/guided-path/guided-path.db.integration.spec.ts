import { randomUUID } from 'crypto';
import { DataSource, QueryFailedError } from 'typeorm';
import { databseConfig } from '../../../src/database/data-source';
import { GuidedPath } from '../../../src/database/entities';
import { GuidedPathRepository } from '../../../src/database/repositories/guided-path.repository';
import { GuidedPathService } from '../../../src/guided-path/guided-path.service';
import { RoleSlug } from '../../../src/common/constants';
import type { ICurrentUser } from '../../../src/common/interfaces';

const hasDbConfig = Boolean(process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_NAME);

const describeWithDb = hasDbConfig ? describe : describe.skip;

const UNIQUE_VIOLATION = '23505';

/**
 * Runs `GuidedPathService` against real Postgres so the `(user_id, role_type)` unique index and
 * the per-role row split are exercised for real (the HTTP suite uses an in-memory repository).
 */
describeWithDb('GuidedPath (DB Integration)', () => {
  let dataSource: DataSource;
  let guidedPathRepository: GuidedPathRepository;
  let service: GuidedPathService;
  let userId: string;
  let currentUser: ICurrentUser;

  const rowsFor = (id: string): Promise<GuidedPath[]> =>
    dataSource.getRepository(GuidedPath).find({ where: { userId: id } });

  beforeAll(async () => {
    dataSource = new DataSource({ ...databseConfig, synchronize: false, logging: false });
    await dataSource.initialize();
    guidedPathRepository = new GuidedPathRepository(dataSource.getRepository(GuidedPath));
    service = new GuidedPathService(guidedPathRepository);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(() => {
    userId = randomUUID();
    currentUser = { userId } as ICurrentUser;
  });

  afterEach(async () => {
    await dataSource.getRepository(GuidedPath).delete({ userId });
  });

  it('gives a dual-role user two separate rows, one per role', async () => {
    const educatorPath = await service.getOrCreate(currentUser, RoleSlug.EDUCATOR);
    const adminPath = await service.getOrCreate(currentUser, RoleSlug.DISTRICT_ADMIN);

    expect(adminPath.guidedPathId).not.toBe(educatorPath.guidedPathId);
    const rows = await rowsFor(userId);
    expect(rows.map((row) => row.roleType).sort()).toEqual(
      [RoleSlug.DISTRICT_ADMIN, RoleSlug.EDUCATOR].sort(),
    );
  });

  it('keeps each role’s progress independent when one is updated', async () => {
    await service.getOrCreate(currentUser, RoleSlug.EDUCATOR);
    await service.upsert(currentUser, RoleSlug.DISTRICT_ADMIN, {
      state: { step1: true },
      completed: true,
    });

    const educatorPath = await guidedPathRepository.findByUserAndRole(userId, RoleSlug.EDUCATOR);
    const adminPath = await guidedPathRepository.findByUserAndRole(userId, RoleSlug.DISTRICT_ADMIN);

    expect(educatorPath).toMatchObject({ state: {}, completed: false });
    expect(adminPath).toMatchObject({ state: { step1: true }, completed: true });
    expect(await rowsFor(userId)).toHaveLength(2);
  });

  it('reuses the same row for repeated calls with the same role', async () => {
    const first = await service.getOrCreate(currentUser, RoleSlug.DISTRICT_ADMIN);
    await service.upsert(currentUser, RoleSlug.DISTRICT_ADMIN, { completed: true });
    const second = await service.getOrCreate(currentUser, RoleSlug.DISTRICT_ADMIN);

    expect(second.guidedPathId).toBe(first.guidedPathId);
    expect(second.completed).toBe(true);
    expect(await rowsFor(userId)).toHaveLength(1);
  });

  it('rejects a second row for the same user and role with a unique violation', async () => {
    await guidedPathRepository.create({
      userId,
      roleType: RoleSlug.DISTRICT_ADMIN,
      state: {},
      completed: false,
    });

    const duplicate = guidedPathRepository.create({
      userId,
      roleType: RoleSlug.DISTRICT_ADMIN,
      state: {},
      completed: false,
    });

    await expect(duplicate).rejects.toBeInstanceOf(QueryFailedError);
    await expect(duplicate).rejects.toMatchObject({ driverError: { code: UNIQUE_VIOLATION } });
    expect(await rowsFor(userId)).toHaveLength(1);
  });
});
