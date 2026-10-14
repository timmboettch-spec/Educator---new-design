import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { VoiceProfilesController } from 'src/voice-profiles/voice-profiles.controller';
import { VoiceProfilesService } from 'src/voice-profiles/voice-profiles.service';
import { AzureBlobService } from 'src/common/services/azure-blob.service';
import { AudioNormalizerService } from 'src/common/services/audio-normalizer.service';
import { VoiceProfileStatus } from 'src/common/constants';
import { VOICE_PROFILE_REPOSITORY, SIMULATION_V2_REPOSITORY } from 'src/database/tokens';
import { buildTestApp, TEST_JWT_SECRET, TEST_USERS } from '../setup/test-app.factory';

jest.setTimeout(30000);

const FIXTURE_WAV = readFileSync(
  join(__dirname, '..', '..', 'unit', 'voice-profiles', 'fixtures', 'tone-24k-pcm16.wav'),
);

const PID = '3f2b8c1e-5d4a-4b6f-8a7c-1e2d3c4b5a69';

const profileRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  voiceProfileId: PID,
  displayName: 'Stock Female 1',
  status: VoiceProfileStatus.ACTIVE,
  blobPath: `voices/${PID}/voice.wav`,
  durationMs: 9800,
  defaultForGender: null,
  createdAt: new Date('2026-09-30T10:00:00.000Z'),
  updatedAt: new Date('2026-09-30T10:00:00.000Z'),
  ...overrides,
});

describe('Voice Profiles API (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;

  const httpServer = (): Parameters<typeof request>[0] => app.getHttpServer() as never;

  const repo = {
    find: jest.fn(),
    findAllOrdered: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    findActiveById: jest.fn(),
    findActiveByDisplayName: jest.fn().mockResolvedValue(null),
    findActiveDefaultForGender: jest.fn().mockResolvedValue(null),
    createWithAudio: jest.fn(
      async (data: Record<string, unknown>, upload: (id: string) => Promise<string>) => {
        const row = profileRow(data);
        return { ...row, blobPath: await upload(row.voiceProfileId as string) };
      },
    ),
    updateLocked: jest.fn(
      async (id: string, build: (locked: Record<string, unknown>) => Record<string, unknown>) => {
        const locked = (await repo.findById(id)) as Record<string, unknown>;
        return Object.assign(locked, build(locked));
      },
    ),
    retireIfUnused: jest.fn().mockResolvedValue(undefined),
    save: jest.fn((entity: Record<string, unknown>) => Promise.resolve(entity)),
    merge: jest.fn((target: Record<string, unknown>, source: Record<string, unknown>) =>
      Object.assign(target, source),
    ),
  };
  const simulationRepo = {
    countByVoiceProfileId: jest.fn().mockResolvedValue(0),
    countGroupedByVoiceProfileId: jest.fn().mockResolvedValue(new Map()),
    findIdsByVoiceProfileId: jest.fn().mockResolvedValue([]),
  };
  const blobService = {
    uploadToContainer: jest.fn().mockResolvedValue(undefined),
    downloadStreamFromContainer: jest.fn(),
  };
  const normalizer = {
    normalizeVoiceReference: jest.fn().mockResolvedValue({ buffer: FIXTURE_WAV, durationMs: 500 }),
  };

  beforeAll(async () => {
    const built = await buildTestApp({
      controllers: [VoiceProfilesController],
      providers: [
        VoiceProfilesService,
        { provide: VOICE_PROFILE_REPOSITORY, useValue: repo },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationRepo },
        { provide: AzureBlobService, useValue: blobService },
        { provide: AudioNormalizerService, useValue: normalizer },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'jwt.accessSecret') return TEST_JWT_SECRET;
              if (key === 'azureBlob.voiceProfilesContainer') return 'voice-profiles';
              return null;
            }),
          },
        },
      ],
    });
    app = built.app;
    signToken = built.signToken;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  describe('roles', () => {
    it('401s unauthenticated', async () => {
      await request(httpServer()).get('/api/voice-profiles').expect(401);
    });

    it('403s a student on the admin list route', async () => {
      await request(httpServer())
        .get('/api/voice-profiles')
        .set('Authorization', `Bearer ${signToken(TEST_USERS.student)}`)
        .expect(403);
    });

    it('403s an educator on the admin list route', async () => {
      await request(httpServer())
        .get('/api/voice-profiles')
        .set('Authorization', `Bearer ${signToken(TEST_USERS.educator)}`)
        .expect(403);
    });

    it('200s a scenario_admin on the admin list route', async () => {
      repo.findAllOrdered.mockResolvedValue([profileRow()]);
      const res = await request(httpServer())
        .get('/api/voice-profiles')
        .set('Authorization', `Bearer ${signToken(TEST_USERS.scenarioAdmin)}`)
        .expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        voiceProfileId: PID,
        displayName: 'Stock Female 1',
        status: 'active',
        durationMs: 9800,
        usageCount: 0,
      });
    });
  });

  describe('POST /voice-profiles (multipart upload)', () => {
    it('happy path: scenario_admin, displayName + file → 201-shaped body with the created profile', async () => {
      repo.findAllOrdered.mockResolvedValue([]);
      const res = await request(httpServer())
        .post('/api/voice-profiles')
        .set('Authorization', `Bearer ${signToken(TEST_USERS.scenarioAdmin)}`)
        .field('displayName', 'Stock Female 1')
        .attach('file', FIXTURE_WAV, 'voice.wav')
        .expect(201);

      expect(normalizer.normalizeVoiceReference).toHaveBeenCalled();
      expect(blobService.uploadToContainer).toHaveBeenCalled();
      expect(res.body.data).toMatchObject({ displayName: 'Stock Female 1' });
    });

    it('400s with no file', async () => {
      const res = await request(httpServer())
        .post('/api/voice-profiles')
        .set('Authorization', `Bearer ${signToken(TEST_USERS.scenarioAdmin)}`)
        .field('displayName', 'Stock Female 1')
        .expect(400);
      expect(res.body.error).toBeDefined();
    });

    it('accepts the demographic/performance tags as multipart fields, age coerced from a string to a number', async () => {
      repo.findAllOrdered.mockResolvedValue([]);
      const res = await request(httpServer())
        .post('/api/voice-profiles')
        .set('Authorization', `Bearer ${signToken(TEST_USERS.scenarioAdmin)}`)
        .field('displayName', 'Stock Female 1')
        .field('gender', 'female')
        .field('age', '34')
        .field('ethnicity', 'Not Hispanic or Latino')
        .field('emotion', 'calm')
        .attach('file', FIXTURE_WAV, 'voice.wav')
        .expect(201);

      expect(repo.createWithAudio).toHaveBeenCalledWith(
        expect.objectContaining({ gender: 'female', age: 34, emotion: 'calm' }),
        expect.any(Function),
      );
      expect(res.body.data).toMatchObject({ gender: 'female', age: 34, emotion: 'calm' });
    });

    it("400s a non-numeric age (multipart fields arrive as strings, so this exercises the validation pipe's coercion)", async () => {
      await request(httpServer())
        .post('/api/voice-profiles')
        .set('Authorization', `Bearer ${signToken(TEST_USERS.scenarioAdmin)}`)
        .field('displayName', 'Stock Female 1')
        .field('age', 'not-a-number')
        .attach('file', FIXTURE_WAV, 'voice.wav')
        .expect(400);
    });
  });

  describe('GET /voice-profiles (catalog filters)', () => {
    it('passes gender/age/ethnicity/emotion query params through to the repository as parsed types', async () => {
      repo.findAllOrdered.mockResolvedValue([]);
      await request(httpServer())
        .get('/api/voice-profiles?gender=female&age=34&ethnicity=Hispanic&emotion=calm')
        .set('Authorization', `Bearer ${signToken(TEST_USERS.scenarioAdmin)}`)
        .expect(200);

      expect(repo.findAllOrdered).toHaveBeenCalledWith(
        VoiceProfileStatus.ACTIVE,
        expect.objectContaining({
          gender: 'female',
          age: 34,
          ethnicity: 'Hispanic',
          emotion: 'calm',
        }),
      );
    });
  });

  describe('PATCH /voice-profiles/:id (gender-tag consistency)', () => {
    it("409s setting defaultForGender to a value that contradicts the voice's own gender tag", async () => {
      repo.findById.mockResolvedValue(profileRow({ gender: 'male' }));
      const res = await request(httpServer())
        .patch(`/api/voice-profiles/${PID}`)
        .set('Authorization', `Bearer ${signToken(TEST_USERS.scenarioAdmin)}`)
        .send({ defaultForGender: 'female' })
        .expect(409);
      expect(res.body.error).toBeDefined();
    });

    it('200s setting gender and defaultForGender together in one request', async () => {
      repo.findById.mockResolvedValue(profileRow());
      const res = await request(httpServer())
        .patch(`/api/voice-profiles/${PID}`)
        .set('Authorization', `Bearer ${signToken(TEST_USERS.scenarioAdmin)}`)
        .send({ gender: 'female', defaultForGender: 'female' })
        .expect(200);
      expect(res.body.data).toMatchObject({ gender: 'female', defaultForGender: 'female' });
    });
  });

  describe('GET /voice-profiles/:id/audio', () => {
    it('401s without a token', async () => {
      await request(httpServer()).get(`/api/voice-profiles/${PID}/audio`).expect(401);
    });

    it('200s an authenticated educator', async () => {
      repo.findById.mockResolvedValue(profileRow());
      blobService.downloadStreamFromContainer.mockResolvedValue({
        stream: require('stream').Readable.from([Buffer.from('RIFF')]),
        contentLength: 4,
      });
      const res = await request(httpServer())
        .get(`/api/voice-profiles/${PID}/audio`)
        .set('Authorization', `Bearer ${signToken(TEST_USERS.educator)}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('audio/wav');
    });

    it('410s a retired profile', async () => {
      repo.findById.mockResolvedValue(profileRow({ status: VoiceProfileStatus.RETIRED }));
      await request(httpServer())
        .get(`/api/voice-profiles/${PID}/audio`)
        .set('Authorization', `Bearer ${signToken(TEST_USERS.educator)}`)
        .expect(410);
    });
  });

  describe('malformed :id', () => {
    const admin = (): string => `Bearer ${signToken(TEST_USERS.scenarioAdmin)}`;

    it('400s a non-UUID id on GET :id/audio, PUT :id/audio, PATCH :id and DELETE :id without touching the service', async () => {
      await request(httpServer())
        .get('/api/voice-profiles/not-a-uuid/audio')
        .set('Authorization', admin())
        .expect(400);
      await request(httpServer())
        .put('/api/voice-profiles/not-a-uuid/audio')
        .set('Authorization', admin())
        .attach('file', FIXTURE_WAV, 'voice.wav')
        .expect(400);
      await request(httpServer())
        .patch('/api/voice-profiles/not-a-uuid')
        .set('Authorization', admin())
        .send({ displayName: 'x' })
        .expect(400);
      await request(httpServer())
        .delete('/api/voice-profiles/not-a-uuid')
        .set('Authorization', admin())
        .expect(400);
      expect(repo.findById).not.toHaveBeenCalled();
    });
  });

  describe('signed audio route (removed)', () => {
    it('is no longer served: an anonymous request to the old signed path is a 404, not a 200/403', async () => {
      await request(httpServer())
        .get(`/api/voice-profiles/${PID}/audio/signed?exp=9999999999&sig=anything`)
        .expect(404);
      expect(blobService.downloadStreamFromContainer).not.toHaveBeenCalled();
    });
  });
});
