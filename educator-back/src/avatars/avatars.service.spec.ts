import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { Test } from '@nestjs/testing';
import { Avatar } from 'src/database/entities';
import { AVATAR_REPOSITORY, SIMULATION_V2_REPOSITORY } from 'src/database/tokens';
import { AvatarStatus } from 'src/common/constants';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { ICurrentUser } from 'src/common/interfaces';
import { AvatarsService } from './avatars.service';

/**
 * The avatar platform's Session Router reads this table directly:
 *
 *   SELECT avatar_id, display_name, asset_path, voice_profile_id, gpu_sku,
 *          min_replicas, max_replicas, scale_to_zero, status, unreal_map,
 *          pixel_streaming_version
 *   FROM avatars WHERE avatar_id = $1 AND status = 'ready'
 *
 * (Realityworks-Avatar/services/session-router/postgres_catalog.py, _COLUMNS)
 *
 * Postgres errors on a SELECT naming a column that does not exist, and the
 * Router catches PostgresError and returns None — so dropping or renaming one
 * of these does NOT surface as an error. Every avatar lookup silently returns
 * "not found" and no session ever starts.
 */
describe('Avatar entity — Session Router column contract', () => {
  const ROUTER_COLUMNS = [
    'avatar_id',
    'display_name',
    'asset_path',
    'voice_profile_id',
    'gpu_sku',
    'min_replicas',
    'max_replicas',
    'scale_to_zero',
    'status',
    'unreal_map',
    'pixel_streaming_version',
  ];

  it('declares every column the Router SELECTs', () => {
    const source = readFileSync(
      join(__dirname, '..', 'database', 'entities', 'avatar.entity.ts'),
      'utf8',
    );

    // Resolve the COLUMN name, not the property name: TypeORM uses the property
    // unless `name:` overrides it, so a renamed `name:` must fail this even
    // though the property is untouched.
    const declared = new Set<string>();
    for (const match of source.matchAll(/@(?:Primary(?:Generated)?)?Column\(\s*(?:'uuid',\s*)?\{([^}]*)\}\s*\)\s*(\w+)[!?]?:/g)) {
      const [, options, property] = match;
      const named = /name:\s*'([^']+)'/.exec(options);
      declared.add(named ? named[1] : property);
    }
    for (const match of source.matchAll(/@(?:Create|Update|Delete)DateColumn\(\{\s*name:\s*'([^']+)'/g)) {
      declared.add(match[1]);
    }

    expect(ROUTER_COLUMNS.filter((column) => !declared.has(column))).toEqual([]);
  });

  it('declares every column in the migration that creates the table', () => {
    // Located by SUFFIX, not by a hardcoded timestamp: a migration may have to
    // be renumbered (this one was, on 28 Sep 2026, after its timestamp
    // collided with another branch's). Pinning the full filename here turned
    // that rename into an unrelated test failure.
    const migrationsDir = join(__dirname, '..', 'database', 'migrations');
    const migration = readdirSync(migrationsDir).find((f) =>
      f.endsWith('-CreateAvatarsTable.ts'),
    );
    if (!migration) {
      throw new Error('could not find the *-CreateAvatarsTable.ts migration');
    }
    const source = readFileSync(join(migrationsDir, migration), 'utf8');
    expect(ROUTER_COLUMNS.filter((column) => !source.includes(`"${column}"`))).toEqual([]);
  });
});

describe('AvatarsService', () => {
  let service: AvatarsService;
  let repo: {
    find: jest.Mock;
    findAndCountPaginated: jest.Mock;
    findByAvatarId: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    merge: jest.Mock;
    softDeleteByAvatarId: jest.Mock;
  };
  let simulationRepo: {
    countSimulationByAvatarId: jest.Mock;
  };

  const currentUser = { userId: 'u-1', roles: ['District Admin'] } as unknown as ICurrentUser;

  const avatar10 = {
    avatarUuid: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    avatarId: 'avatar-10',
    displayName: 'avatar-10 — appearance not yet seen',
    appearance: 'appearance not yet seen',
    unrealMap: '/Game/Maps/Production/L_AVT_10',
    assetPath: 'packages/avatars/10/v4',
    status: AvatarStatus.READY,
  } as Avatar;

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findAndCountPaginated: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
      }),
      findByAvatarId: jest.fn(),
      create: jest.fn((data: Partial<Avatar>) => Promise.resolve(data as Avatar)),
      save: jest.fn((entity: Avatar) => Promise.resolve(entity)),
      merge: jest.fn((target: Avatar, source: Partial<Avatar>) => Object.assign(target, source)),
      softDeleteByAvatarId: jest.fn(),
    };

    simulationRepo = {
      // Default: nothing references the avatar, so remove() is allowed.
      countSimulationByAvatarId: jest.fn().mockResolvedValue(0),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AvatarsService,
        { provide: AVATAR_REPOSITORY, useValue: repo },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationRepo },
      ],
    }).compile();

    service = moduleRef.get(AvatarsService);
  });

  describe('findAll', () => {
    it('returns only ready avatars by default, so the picker cannot offer an unservable one', async () => {
      await service.findAll(currentUser, {});
      expect(repo.findAndCountPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ status: AvatarStatus.READY }),
      );
    });

    it('honours an explicit status filter', async () => {
      await service.findAll(currentUser, { status: AvatarStatus.RETIRED });
      expect(repo.findAndCountPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ status: AvatarStatus.RETIRED }),
      );
    });

    it('returns the items with pagination meta alongside, never nested in data', async () => {
      repo.findAndCountPaginated.mockResolvedValue({
        items: [avatar10],
        total: 1,
        page: 1,
        pageSize: 10,
      });
      const result = await service.findAll(currentUser, {});
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].avatarId).toBe('avatar-10');
      expect(result.meta).toEqual(expect.objectContaining({ total: 1 }));
    });
  });

  describe('findOne', () => {
    it('returns a retired avatar — a scenario may legitimately still reference one', async () => {
      repo.findByAvatarId.mockResolvedValue({ ...avatar10, status: AvatarStatus.RETIRED });
      const result = await service.findOne(currentUser, 'avatar-10');
      expect(result.data?.status).toBe(AvatarStatus.RETIRED);
    });
  });

  describe('create', () => {
    it('defaults to syncing, so a half-finished ingest is visible but not routable', async () => {
      repo.findByAvatarId.mockResolvedValue(null);
      const result = await service.create(currentUser, {
        avatarId: 'avatar-31',
        displayName: 'thirty-one',
      });
      expect(result.data?.status).toBe(AvatarStatus.SYNCING);
    });
  });

  describe('the ready/unrealMap guard', () => {
    // A pod launched without a map starts, passes every probe, reports healthy,
    // and streams the WRONG PATIENT. This is the only thing preventing that.
    it('refuses create with ready and no unrealMap', async () => {
      repo.findByAvatarId.mockResolvedValue(null);
      await expect(
        service.create(currentUser, {
          avatarId: 'avatar-31',
          displayName: 'thirty-one',
          status: AvatarStatus.READY,
        }),
      ).rejects.toThrow(ERROR_MSG.AVATAR.READY_WITHOUT_MAP);
    });

    it('refuses create with ready and a whitespace-only unrealMap', async () => {
      repo.findByAvatarId.mockResolvedValue(null);
      await expect(
        service.create(currentUser, {
          avatarId: 'avatar-31',
          displayName: 'thirty-one',
          status: AvatarStatus.READY,
          unrealMap: '   ',
        }),
      ).rejects.toThrow(ERROR_MSG.AVATAR.READY_WITHOUT_MAP);
    });

    it('refuses promotion to ready when the stored row has no map', async () => {
      repo.findByAvatarId.mockResolvedValue({ ...avatar10, unrealMap: null, status: AvatarStatus.SYNCING });
      await expect(
        service.update(currentUser, 'avatar-10', { status: AvatarStatus.READY }),
      ).rejects.toThrow(ERROR_MSG.AVATAR.READY_WITHOUT_MAP);
    });

    it('allows promotion to ready when the same call supplies the map', async () => {
      repo.findByAvatarId.mockResolvedValue({ ...avatar10, unrealMap: null, status: AvatarStatus.SYNCING });
      const result = await service.update(currentUser, 'avatar-10', {
        status: AvatarStatus.READY,
        unrealMap: '/Game/Maps/Production/L_AVT_10',
      });
      expect(result.data?.status).toBe(AvatarStatus.READY);
    });
  });

  describe('the guardrail message is wired through i18n', () => {
    // The HttpExceptionFilter translates ERROR_MSG keys at response time. A
    // key missing from en/error.json would fall back to the raw key string,
    // so pin both ends of the wire.
    it('has a translation for the guardrail key in en/error.json', () => {
      const source = readFileSync(
        join(__dirname, '..', 'common', 'i18n', 'en', 'error.json'),
        'utf8',
      );
      const errorJson = JSON.parse(source) as { AVATAR?: { READY_WITHOUT_MAP?: string } };
      expect(errorJson.AVATAR?.READY_WITHOUT_MAP).toBe(
        'Cannot mark avatar ready: unrealMap is not set',
      );
    });

    it('points ERROR_MSG at exactly that key', () => {
      expect(ERROR_MSG.AVATAR.READY_WITHOUT_MAP).toBe('error.AVATAR.READY_WITHOUT_MAP');
    });
  });

  describe('machine callers (service key, no user)', () => {
    // @ServiceAuth() short-circuits the JWT path, so @CurrentUser() is
    // undefined for these calls. findAll/findOne take _currentUser and must
    // never dereference it: if someone later scopes or audits by currentUser,
    // these two tests fail instead of the routes 500ing only for machines.
    it('findAll ignores an undefined user', async () => {
      repo.findAndCountPaginated.mockResolvedValue({
        items: [avatar10],
        total: 1,
        page: 1,
        pageSize: 10,
      });
      const result = await service.findAll(undefined as unknown as ICurrentUser, {});
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].avatarId).toBe('avatar-10');
    });

    it('findOne ignores an undefined user', async () => {
      repo.findByAvatarId.mockResolvedValue({ ...avatar10 });
      const result = await service.findOne(undefined as unknown as ICurrentUser, 'avatar-10');
      expect(result.data?.avatarId).toBe('avatar-10');
    });
  });

  describe('update', () => {
    it('re-publishing at a new package version is an update, not an error', async () => {
      repo.findByAvatarId.mockResolvedValue({ ...avatar10 });
      const result = await service.update(currentUser, 'avatar-10', {
        assetPath: 'packages/avatars/10/v5',
      });
      expect(result.data?.assetPath).toBe('packages/avatars/10/v5');
    });
  });

  describe('remove', () => {
    it('soft-deletes, never hard-deletes — a scenario must outlive its avatar row', async () => {
      repo.findByAvatarId.mockResolvedValue({ ...avatar10 });

      await service.remove(currentUser, 'avatar-10');

      expect(repo.softDeleteByAvatarId).toHaveBeenCalledWith('avatar-10');
    });

    it('refuses while a scenario still points at the avatar', async () => {
      repo.findByAvatarId.mockResolvedValue({ ...avatar10 });
      simulationRepo.countSimulationByAvatarId.mockResolvedValue(3);

      await expect(service.remove(currentUser, 'avatar-10')).rejects.toThrow(
        ERROR_MSG.COMMON.BAD_REQUEST,
      );
      expect(repo.softDeleteByAvatarId).not.toHaveBeenCalled();
    });

    it('checks for referencing scenarios BEFORE deleting, not after', async () => {
      // The FK is ON DELETE RESTRICT, so deleting first would surface as a
      // driver 500 instead of the 400 this guard produces.
      repo.findByAvatarId.mockResolvedValue({ ...avatar10 });
      const order: string[] = [];
      simulationRepo.countSimulationByAvatarId.mockImplementation(() => {
        order.push('count');
        return Promise.resolve(0);
      });
      repo.softDeleteByAvatarId.mockImplementation(() => {
        order.push('delete');
        return Promise.resolve();
      });

      await service.remove(currentUser, 'avatar-10');

      expect(order).toEqual(['count', 'delete']);
    });

    it('404s on an unknown avatar rather than reporting a successful delete', async () => {
      repo.findByAvatarId.mockResolvedValue(null);

      await expect(service.remove(currentUser, 'avatar-99')).rejects.toBeDefined();
      expect(repo.softDeleteByAvatarId).not.toHaveBeenCalled();
    });
  });
});
