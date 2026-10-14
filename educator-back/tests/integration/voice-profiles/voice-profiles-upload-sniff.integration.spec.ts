import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { VoiceProfilesController } from 'src/voice-profiles/voice-profiles.controller';
import { VoiceProfilesService } from 'src/voice-profiles/voice-profiles.service';
import { AzureBlobService } from 'src/common/services/azure-blob.service';
import { AudioNormalizerService } from 'src/common/services/audio-normalizer.service';
import { LoggerService } from 'src/common/services/logger.service';
import { VOICE_PROFILE_REPOSITORY, SIMULATION_V2_REPOSITORY } from 'src/database/tokens';
import { buildTestApp, TEST_JWT_SECRET, TEST_USERS } from '../setup/test-app.factory';

jest.setTimeout(30000);

/**
 * The REAL AudioNormalizerService behind the real controller. The controller's mimetype gate is
 * client-controlled, so a payload that claims audio/wav but is not audio must still be refused by
 * the byte sniff. It is rejected before any ffmpeg process is spawned, so no ffmpeg is needed.
 */
describe('Voice profile upload: the mimetype is not trusted (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;
  const repo = {
    findActiveByDisplayName: jest.fn().mockResolvedValue(null),
    createWithAudio: jest.fn(),
  };
  const blobService = { uploadToContainer: jest.fn() };

  beforeAll(async () => {
    const built = await buildTestApp({
      controllers: [VoiceProfilesController],
      providers: [
        VoiceProfilesService,
        AudioNormalizerService,
        { provide: LoggerService, useValue: { error: jest.fn(), log: jest.fn(), warn: jest.fn() } },
        { provide: VOICE_PROFILE_REPOSITORY, useValue: repo },
        { provide: SIMULATION_V2_REPOSITORY, useValue: {} },
        { provide: AzureBlobService, useValue: blobService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'jwt.accessSecret' ? TEST_JWT_SECRET : 'voice-profiles',
            ),
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

  const upload = (bytes: Buffer, mimetype: string): request.Test =>
    request(app.getHttpServer() as never)
      .post('/api/voice-profiles')
      .set('Authorization', `Bearer ${signToken(TEST_USERS.scenarioAdmin)}`)
      .field('displayName', 'Spoof')
      .attach('file', bytes, { filename: 'voice.wav', contentType: mimetype });

  it.each([
    [
      'an HLS playlist posing as audio/wav',
      Buffer.from('#EXTM3U\n#EXTINF:10,\nhttp://127.0.0.1/x\n'),
    ],
    [
      'an executable posing as audio/wav',
      Buffer.from('MZ\x90\x00\x03\x00\x00\x00 not audio at all'),
    ],
  ])('400s %s, saving and uploading nothing', async (_name, bytes) => {
    const res = await upload(bytes, 'audio/wav').expect(400);
    expect(JSON.stringify(res.body)).toContain('UNDECODABLE');
    expect(repo.createWithAudio).not.toHaveBeenCalled();
    expect(blobService.uploadToContainer).not.toHaveBeenCalled();
  });

  it('still 400s a non-audio mimetype at the interceptor', async () => {
    await upload(Buffer.from('RIFF....WAVE'), 'text/plain').expect(400);
  });
});
