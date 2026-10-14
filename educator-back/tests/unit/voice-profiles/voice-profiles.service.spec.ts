import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { VoiceProfile } from 'src/database/entities';
import { VoiceProfileRepository } from 'src/database/repositories/voice-profile.repository';
import { VOICE_PROFILE_REPOSITORY, SIMULATION_V2_REPOSITORY } from 'src/database/tokens';
import { VoiceProfileGender, VoiceProfileSource, VoiceProfileStatus } from 'src/common/constants';
import { AzureBlobService } from 'src/common/services/azure-blob.service';
import { AudioNormalizerService } from 'src/common/services/audio-normalizer.service';
import { ICurrentUser } from 'src/common/interfaces';
import { VoiceProfilesService } from 'src/voice-profiles/voice-profiles.service';

const UUID = '3f2b8c1e-5d4a-4b6f-8a7c-1e2d3c4b5a69';
const currentUser = { userId: 'u-1', roles: [] } as unknown as ICurrentUser;

const profile = (overrides: Partial<VoiceProfile> = {}): VoiceProfile =>
  ({
    voiceProfileId: 'p-1',
    displayName: 'Stock Female 1',
    status: VoiceProfileStatus.ACTIVE,
    blobPath: 'voices/p-1/voice.wav',
    durationMs: 9800,
    gender: null,
    age: null,
    ethnicity: null,
    emotion: null,
    defaultForGender: null,
    createdBy: null,
    updatedBy: null,
    retiredAt: null,
    createdAt: new Date('2026-09-30T10:00:00.000Z'),
    updatedAt: new Date('2026-09-30T10:00:00.000Z'),
    ...overrides,
  }) as VoiceProfile;

describe('VoiceProfilesService', () => {
  let service: VoiceProfilesService;
  let repo: {
    find: jest.Mock;
    findAllOrdered: jest.Mock;
    findById: jest.Mock;
    findActiveById: jest.Mock;
    findActiveByDisplayName: jest.Mock;
    findActiveDefaultForGender: jest.Mock;
    createWithAudio: jest.Mock;
    updateLocked: jest.Mock;
    retireIfUnused: jest.Mock;
    save: jest.Mock;
    merge: jest.Mock;
  };
  let simulationRepo: {
    countByVoiceProfileId: jest.Mock;
    countGroupedByVoiceProfileId: jest.Mock;
    findIdsByVoiceProfileId: jest.Mock;
  };
  let blobService: { uploadToContainer: jest.Mock; downloadStreamFromContainer: jest.Mock };
  let normalizer: { normalizeVoiceReference: jest.Mock };

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findAllOrdered: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      findActiveById: jest.fn(),
      findActiveByDisplayName: jest.fn().mockResolvedValue(null),
      findActiveDefaultForGender: jest.fn().mockResolvedValue(null),
      createWithAudio: jest.fn(
        async (data: Partial<VoiceProfile>, upload: (id: string) => Promise<string>) => {
          const row = profile(data);
          row.blobPath = await upload(row.voiceProfileId);
          return row;
        },
      ),
      // Stand-in for the row-locked write: builds the change from the profile findById returns.
      updateLocked: jest.fn(
        async (id: string, build: (locked: VoiceProfile) => Partial<VoiceProfile>) => {
          const locked = (await repo.findById(id)) as VoiceProfile;
          return Object.assign(locked, build(locked));
        },
      ),
      retireIfUnused: jest.fn().mockResolvedValue(undefined),
      save: jest.fn((entity: VoiceProfile) => Promise.resolve(entity)),
      merge: jest.fn((target: VoiceProfile, source: Partial<VoiceProfile>) =>
        Object.assign(target, source),
      ),
    };
    simulationRepo = {
      countByVoiceProfileId: jest.fn().mockResolvedValue(0),
      countGroupedByVoiceProfileId: jest.fn().mockResolvedValue(new Map()),
      findIdsByVoiceProfileId: jest.fn().mockResolvedValue([]),
    };
    blobService = {
      uploadToContainer: jest.fn().mockResolvedValue(undefined),
      downloadStreamFromContainer: jest.fn(),
    };
    normalizer = {
      normalizeVoiceReference: jest
        .fn()
        .mockResolvedValue({ buffer: Buffer.from('wav'), durationMs: 9800 }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        VoiceProfilesService,
        { provide: VOICE_PROFILE_REPOSITORY, useValue: repo },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationRepo },
        { provide: AzureBlobService, useValue: blobService },
        { provide: AudioNormalizerService, useValue: normalizer },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'jwt.accessSecret' ? 'test-secret' : 'voice-profiles',
            ),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(VoiceProfilesService);
  });

  const file = (buffer = Buffer.from('audio')): Express.Multer.File =>
    ({ buffer, mimetype: 'audio/wav' }) as Express.Multer.File;

  describe('create', () => {
    it('normalizes, uploads, and persists the blob path', async () => {
      const result = await service.create(currentUser, { displayName: 'Stock Female 1' }, file());
      expect(normalizer.normalizeVoiceReference).toHaveBeenCalled();
      expect(blobService.uploadToContainer).toHaveBeenCalledWith(
        'voice-profiles',
        'voices/p-1/voice.wav',
        Buffer.from('wav'),
        'audio/wav',
      );
      expect(result.data?.displayName).toBe('Stock Female 1');
      expect(result.data?.usageCount).toBe(0);
    });

    it('400s with no file', async () => {
      await expect(service.create(currentUser, { displayName: 'x' }, undefined)).rejects.toThrow();
    });

    it('409s when another active profile already has that display name', async () => {
      repo.findActiveByDisplayName.mockResolvedValue(profile({ voiceProfileId: 'other' }));
      const error = await service
        .create(currentUser, { displayName: 'Stock Female 1' }, file())
        .catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(409);
    });

    it('persists the demographic/performance tags when given, and leaves them null when omitted', async () => {
      const withTags = await service.create(
        currentUser,
        {
          displayName: 'Stock Female 1',
          gender: 'female',
          age: 34,
          ethnicity: 'Not Hispanic or Latino',
          emotion: 'calm',
        },
        file(),
      );
      expect(repo.createWithAudio).toHaveBeenCalledWith(
        expect.objectContaining({
          gender: 'female',
          age: 34,
          ethnicity: 'Not Hispanic or Latino',
          emotion: 'calm',
        }),
        expect.any(Function),
      );
      expect(withTags.data).toMatchObject({
        gender: 'female',
        age: 34,
        ethnicity: 'Not Hispanic or Latino',
        emotion: 'calm',
      });

      const withoutTags = await service.create(currentUser, { displayName: 'x' }, file());
      expect(repo.createWithAudio).toHaveBeenCalledWith(
        expect.objectContaining({
          gender: null,
          age: null,
          ethnicity: null,
          emotion: null,
        }),
        expect.any(Function),
      );
      expect(withoutTags.data).toMatchObject({
        gender: null,
        age: null,
        ethnicity: null,
        emotion: null,
      });
    });
  });

  describe('create with a failing upload (real repository over a rollback double)', () => {
    /**
     * Minimal stand-in for the TypeORM Repository behind `repo.manager.transaction`: the
     * transaction works on a copy of the rows and only keeps it when the callback resolves.
     */
    const buildRealRepository = (): { realRepo: VoiceProfileRepository; rows: () => Row[] } => {
      let committed: Row[] = [];
      let seq = 0;
      const lower = (v: unknown): string => String(v).toLowerCase();
      const fake = {
        findOne: ({ where }: { where: { displayName: { objectLiteralParameters: Row } } }) =>
          Promise.resolve(
            committed.find(
              (r) =>
                r.status === VoiceProfileStatus.ACTIVE &&
                lower(r.displayName) ===
                  lower(where.displayName.objectLiteralParameters.displayName),
            ) ?? null,
          ),
        manager: {
          transaction: async <T>(work: (m: unknown) => Promise<T>): Promise<T> => {
            const staged = committed.map((r) => ({ ...r }));
            const result = await work({
              getRepository: () => ({
                create: (d: Row) => ({ ...d }),
                save: (d: Row) => {
                  const row = { voiceProfileId: `new-${++seq}`, ...d };
                  staged.push(row);
                  return Promise.resolve({ ...row });
                },
                update: (where: Row, patch: Row) => {
                  staged
                    .filter((r) => r.voiceProfileId === where.voiceProfileId)
                    .forEach((r) => Object.assign(r, patch));
                  return Promise.resolve({ affected: 1 });
                },
              }),
            });
            committed = staged;
            return result;
          },
        },
      };
      return {
        realRepo: new VoiceProfileRepository(fake as unknown as Repository<VoiceProfile>),
        rows: () => committed,
      };
    };

    type Row = Record<string, unknown>;

    it('leaves no profile behind and keeps the display name free when the blob upload throws', async () => {
      const { realRepo, rows } = buildRealRepository();
      const moduleRef = await Test.createTestingModule({
        providers: [
          VoiceProfilesService,
          { provide: VOICE_PROFILE_REPOSITORY, useValue: realRepo },
          { provide: SIMULATION_V2_REPOSITORY, useValue: simulationRepo },
          { provide: AzureBlobService, useValue: blobService },
          { provide: AudioNormalizerService, useValue: normalizer },
          { provide: ConfigService, useValue: { get: jest.fn(() => 'voice-profiles') } },
        ],
      }).compile();
      const realService = moduleRef.get(VoiceProfilesService);
      blobService.uploadToContainer.mockRejectedValueOnce(new Error('blob unavailable'));

      await expect(
        realService.create(currentUser, { displayName: 'Stock Female 1' }, file()),
      ).rejects.toThrow();
      expect(rows()).toEqual([]);

      // The name is free again: the retry succeeds instead of hitting 409.
      const retry = await realService.create(
        currentUser,
        { displayName: 'Stock Female 1' },
        file(),
      );
      expect(retry.data?.displayName).toBe('Stock Female 1');
      expect(rows()).toHaveLength(1);
      expect(rows()[0].blobPath).toBe(`voices/${rows()[0].voiceProfileId}/voice.wav`);
    });
  });

  describe('concurrent-write unique violations (23505 from the partial indexes)', () => {
    const uniqueViolation = (constraint: string): QueryFailedError =>
      new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('duplicate key value'), { code: '23505', constraint }),
      );
    const message = (error: unknown): string =>
      JSON.stringify((error as HttpException).getResponse());

    it('create: the display-name index maps to 409 DISPLAY_NAME_TAKEN, not a 500', async () => {
      repo.createWithAudio.mockRejectedValue(
        uniqueViolation('UQ_voice_profiles_display_name_active'),
      );
      const error = await service
        .create(currentUser, { displayName: 'Stock Female 1' }, file())
        .catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(409);
      expect(message(error)).toContain('DISPLAY_NAME_TAKEN');
    });

    it('update: the display-name index maps to 409 DISPLAY_NAME_TAKEN', async () => {
      repo.findById.mockResolvedValue(profile());
      repo.updateLocked.mockRejectedValue(uniqueViolation('UQ_voice_profiles_display_name_active'));
      const error = await service
        .update(currentUser, 'p-1', { displayName: 'Taken' })
        .catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(409);
      expect(message(error)).toContain('DISPLAY_NAME_TAKEN');
    });

    it('update: the gender-default index maps to 409 DEFAULT_TAKEN naming the current holder', async () => {
      repo.findById.mockResolvedValue(profile({ gender: 'female' }));
      repo.updateLocked.mockRejectedValue(
        uniqueViolation('UQ_voice_profiles_default_for_gender_active'),
      );
      repo.findActiveDefaultForGender
        .mockResolvedValueOnce(null) // pre-check passes (the race)
        .mockResolvedValueOnce(profile({ voiceProfileId: 'other', displayName: 'Holder' }));
      const error = await service
        .update(currentUser, 'p-1', { defaultForGender: VoiceProfileGender.FEMALE })
        .catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(409);
      expect(message(error)).toContain('DEFAULT_TAKEN');
      expect(message(error)).toContain('Holder');
    });

    it('any other 23505 constraint, or a different error, still falls through to a 500', async () => {
      repo.createWithAudio.mockRejectedValueOnce(uniqueViolation('some_other_constraint'));
      const other = await service
        .create(currentUser, { displayName: 'x' }, file())
        .catch((e: unknown) => e);
      expect((other as HttpException).getStatus()).toBe(500);

      repo.createWithAudio.mockRejectedValueOnce(new Error('boom'));
      const plain = await service
        .create(currentUser, { displayName: 'x' }, file())
        .catch((e: unknown) => e);
      expect((plain as HttpException).getStatus()).toBe(500);
    });
  });

  describe('replaceAudio', () => {
    it('overwrites the blob and bumps duration', async () => {
      repo.findById.mockResolvedValue(profile());
      const result = await service.replaceAudio(currentUser, 'p-1', file());
      expect(blobService.uploadToContainer).toHaveBeenCalled();
      expect(result.data?.durationMs).toBe(9800);
    });

    it('409s when the profile is retired', async () => {
      repo.findById.mockResolvedValue(profile({ status: VoiceProfileStatus.RETIRED }));
      const error = await service.replaceAudio(currentUser, 'p-1', file()).catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(409);
    });
  });

  describe('update (rename / set-default)', () => {
    it('409s renaming or setting a gender default on a retired profile, and writes nothing', async () => {
      repo.findById.mockResolvedValue(
        profile({ status: VoiceProfileStatus.RETIRED, gender: 'female' }),
      );
      for (const dto of [
        { displayName: 'New Name' },
        { defaultForGender: VoiceProfileGender.FEMALE },
        { age: 40 },
      ]) {
        const error = await service.update(currentUser, 'p-1', dto).catch((e: unknown) => e);
        expect((error as HttpException).getStatus()).toBe(409);
      }
      expect(repo.updateLocked).not.toHaveBeenCalled();
    });

    it('re-checks the LOCKED row: a retire that committed after the first read still blocks the write', async () => {
      // findById (outside the lock) says active; the locked row inside updateLocked is retired.
      repo.findById
        .mockResolvedValueOnce(profile())
        .mockResolvedValue(profile({ status: VoiceProfileStatus.RETIRED }));
      const error = await service
        .update(currentUser, 'p-1', {
          defaultForGender: VoiceProfileGender.FEMALE,
          gender: 'female',
        })
        .catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(409);
      expect(JSON.stringify((error as HttpException).getResponse())).toContain('RETIRED_READ_ONLY');
    });

    it('renames', async () => {
      repo.findById.mockResolvedValue(profile());
      const result = await service.update(currentUser, 'p-1', { displayName: 'New Name' });
      expect(result.data?.displayName).toBe('New Name');
    });

    it('updates each demographic/performance tag independently, and clears one with null', async () => {
      repo.findById.mockResolvedValue(
        profile({ age: 30, ethnicity: 'Hispanic or Latino', emotion: 'calm' }),
      );
      const result = await service.update(currentUser, 'p-1', { age: 31, ethnicity: null });
      expect(result.data?.age).toBe(31);
      expect(result.data?.ethnicity).toBeNull();
      // untouched fields survive the merge unchanged
      expect(result.data?.emotion).toBe('calm');
    });

    it('sets a gender default when the voice is already tagged with a matching gender', async () => {
      repo.findById.mockResolvedValue(profile({ gender: 'female' }));
      const result = await service.update(currentUser, 'p-1', {
        defaultForGender: VoiceProfileGender.FEMALE,
      });
      expect(result.data?.defaultForGender).toBe(VoiceProfileGender.FEMALE);
    });

    it('sets a gender default in the same call that first sets a matching gender', async () => {
      repo.findById.mockResolvedValue(profile());
      const result = await service.update(currentUser, 'p-1', {
        gender: 'female',
        defaultForGender: VoiceProfileGender.FEMALE,
      });
      expect(result.data?.defaultForGender).toBe(VoiceProfileGender.FEMALE);
      expect(result.data?.gender).toBe('female');
    });

    it('409s setting a gender default when the voice has no gender tag at all', async () => {
      repo.findById.mockResolvedValue(profile());
      const error = await service
        .update(currentUser, 'p-1', { defaultForGender: VoiceProfileGender.FEMALE })
        .catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(409);
    });

    it("409s setting a gender default that contradicts the voice's own gender tag", async () => {
      repo.findById.mockResolvedValue(profile({ gender: 'male' }));
      const error = await service
        .update(currentUser, 'p-1', { defaultForGender: VoiceProfileGender.FEMALE })
        .catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(409);
    });

    it('409s changing gender away from an existing, still-set default', async () => {
      repo.findById.mockResolvedValue(
        profile({ gender: 'female', defaultForGender: VoiceProfileGender.FEMALE }),
      );
      const error = await service
        .update(currentUser, 'p-1', { gender: 'male' })
        .catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(409);
    });

    it('leaves an existing default alone when the update touches unrelated fields, even with no gender tag', async () => {
      // Guards a legacy row created before `gender` existed: defaultForGender
      // was already set, gender is still null, and this update never
      // touches either — it must not be retroactively blocked.
      repo.findById.mockResolvedValue(
        profile({ gender: null, defaultForGender: VoiceProfileGender.MALE }),
      );
      const result = await service.update(currentUser, 'p-1', { age: 40 });
      expect(result.data?.age).toBe(40);
      expect(result.data?.defaultForGender).toBe(VoiceProfileGender.MALE);
    });

    it('409s when another active profile already has that gender default', async () => {
      repo.findById.mockResolvedValue(profile({ gender: 'female' }));
      repo.findActiveDefaultForGender.mockResolvedValue(profile({ voiceProfileId: 'other' }));
      const error = await service
        .update(currentUser, 'p-1', { defaultForGender: VoiceProfileGender.FEMALE })
        .catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(409);
    });

    it('clearing the default (null) is not a conflict with itself', async () => {
      repo.findById.mockResolvedValue(
        profile({ gender: 'female', defaultForGender: VoiceProfileGender.FEMALE }),
      );
      const result = await service.update(currentUser, 'p-1', { defaultForGender: null });
      expect(result.data?.defaultForGender).toBeNull();
    });
  });

  describe('retire', () => {
    it('delegates the check-and-retire to one repository transaction with the id-list limit', async () => {
      const result = await service.retire(currentUser, 'p-1');
      expect(result.message).toBeDefined();
      expect(repo.retireIfUnused).toHaveBeenCalledWith('p-1', 5);
      // The service no longer reads, counts or saves around it (that was the race window).
      expect(simulationRepo.countByVoiceProfileId).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('surfaces the repository 409 (in use / default) and 404 unchanged', async () => {
      for (const status of [409, 404]) {
        repo.retireIfUnused.mockRejectedValueOnce(new HttpException({ message: 'x' }, status));
        const error = await service.retire(currentUser, 'p-1').catch((e: unknown) => e);
        expect((error as HttpException).getStatus()).toBe(status);
      }
    });
  });

  describe('resolveForScenario', () => {
    it('uses the scenario voice when set and active', async () => {
      repo.findActiveById.mockResolvedValue(profile({ voiceProfileId: 'scenario-voice' }));
      const result = await service.resolveForScenario({
        voiceProfileId: 'scenario-voice',
        patientData: { gender: 'female' },
      });
      expect(result).toEqual(
        expect.objectContaining({ id: 'scenario-voice', source: VoiceProfileSource.SCENARIO }),
      );
    });

    it('falls back to the gender default when the scenario voice is retired (not found active)', async () => {
      repo.findActiveById.mockResolvedValue(null);
      repo.findActiveDefaultForGender.mockResolvedValue(
        profile({ voiceProfileId: 'default-male' }),
      );
      const result = await service.resolveForScenario({
        voiceProfileId: 'retired-voice',
        patientData: { gender: 'male' },
      });
      expect(result).toEqual(
        expect.objectContaining({ id: 'default-male', source: VoiceProfileSource.GENDER_DEFAULT }),
      );
      expect(repo.findActiveDefaultForGender).toHaveBeenCalledWith(VoiceProfileGender.MALE);
    });

    it.each([
      ['female', VoiceProfileGender.FEMALE],
      ['f', VoiceProfileGender.FEMALE],
      ['Female', VoiceProfileGender.FEMALE],
      ['F', VoiceProfileGender.FEMALE],
      ['male', VoiceProfileGender.MALE],
      [undefined, VoiceProfileGender.MALE],
      ['', VoiceProfileGender.MALE],
      ['nonbinary', VoiceProfileGender.MALE],
    ])('maps patientData.gender %p to %p', async (gender, expectedGender) => {
      repo.findActiveDefaultForGender.mockResolvedValue(profile());
      await service.resolveForScenario({ patientData: { gender } });
      expect(repo.findActiveDefaultForGender).toHaveBeenCalledWith(expectedGender);
    });

    it('returns null when there is no scenario voice and no stock default', async () => {
      const result = await service.resolveForScenario({ patientData: { gender: 'female' } });
      expect(result).toBeNull();
    });

    it('returns only id, displayName and source: no signed audioPath is handed out', async () => {
      repo.findActiveById.mockResolvedValue(profile({ voiceProfileId: 'p-1' }));
      const result = await service.resolveForScenario({ voiceProfileId: 'p-1' });
      expect(result).toEqual({
        id: 'p-1',
        displayName: expect.any(String),
        source: 'scenario',
      });
      expect(result).not.toHaveProperty('audioPath');
      expect(result).not.toHaveProperty('audioPathExpiresAt');
    });
  });

  describe('assertValidForScenarioWrite', () => {
    it('passes for null/undefined', async () => {
      await expect(service.assertValidForScenarioWrite(null)).resolves.toBeUndefined();
      await expect(service.assertValidForScenarioWrite(undefined)).resolves.toBeUndefined();
    });

    it('400s for an unknown or retired id', async () => {
      repo.findActiveById.mockResolvedValue(null);
      const error = await service.assertValidForScenarioWrite(UUID).catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(400);
    });

    it('400s a non-UUID id before it reaches the database (would be a 22P02 / 500)', async () => {
      for (const bad of ['missing', 'p-1', '', '123', 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz']) {
        const error = await service.assertValidForScenarioWrite(bad).catch((e: unknown) => e);
        expect((error as HttpException).getStatus()).toBe(400);
      }
      expect(repo.findActiveById).not.toHaveBeenCalled();
    });

    it('passes for an active id', async () => {
      repo.findActiveById.mockResolvedValue(profile());
      await expect(service.assertValidForScenarioWrite(UUID)).resolves.toBeUndefined();
    });
  });
});
