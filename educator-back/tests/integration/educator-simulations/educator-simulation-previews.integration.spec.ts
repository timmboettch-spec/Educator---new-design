import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { EducatorSimulationPreviewsController } from '../../../src/educator-simulations/educator-simulation-previews.controller';
import { EducatorSimulationPreviewsService } from '../../../src/educator-simulations/educator-simulation-previews.service';
import {
  EDUCATOR_SIMULATION_PREVIEW_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
} from 'src/database/tokens';
import { PreviewConstants } from 'src/common/constants';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';

type PreviewBody = {
  message?: string;
  data?: { remaining?: number; max?: number } | null;
  error?: unknown;
};

const parseBody = (res: request.Response): PreviewBody => {
  const body: unknown = res.body;
  if (typeof body === 'object' && body !== null) {
    return body as PreviewBody;
  }
  throw new Error('Expected response body to be an object');
};

const SCENARIO_ID = 'assessment_ea_1775638894969';
const EDUCATOR_ID = TEST_USERS.educator.educatorId;
const PREVIEW_PATH = (scenarioId: string = SCENARIO_ID): string =>
  `/api/educator-simulations/${scenarioId}/preview`;

describe('Educator simulation previews (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;
  let educatorToken: string;
  let adminToken: string;

  const previewRepo = {
    findByEducatorAndScenario: jest.fn(),
    consumeIfAvailable: jest.fn(),
  };
  const simulationRepo = {
    findByBusinessId: jest.fn(),
  };

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [EducatorSimulationPreviewsController],
      providers: [
        EducatorSimulationPreviewsService,
        { provide: EDUCATOR_SIMULATION_PREVIEW_REPOSITORY, useValue: previewRepo },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationRepo },
      ],
    }));
    educatorToken = signToken(TEST_USERS.educator);
    adminToken = signToken(TEST_USERS.districtAdmin);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    simulationRepo.findByBusinessId.mockResolvedValue({ id: SCENARIO_ID, status: 'published' });
    previewRepo.findByEducatorAndScenario.mockResolvedValue(null);
    previewRepo.consumeIfAvailable.mockResolvedValue(1);
  });

  describe('GET :scenarioId/preview', () => {
    it('returns the full allowance for an educator who has never previewed', async () => {
      const res = await request(httpServer())
        .get(PREVIEW_PATH())
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(parseBody(res).data).toEqual({
        remaining: PreviewConstants.MAX_ALLOWANCE,
        max: PreviewConstants.MAX_ALLOWANCE,
      });
    });

    it('reports what is left after some previews were used', async () => {
      previewRepo.findByEducatorAndScenario.mockResolvedValue({ usedCount: 2 });

      const res = await request(httpServer())
        .get(PREVIEW_PATH())
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(parseBody(res).data).toEqual({ remaining: 1, max: 3 });
    });

    it('never reports a negative remaining count', async () => {
      previewRepo.findByEducatorAndScenario.mockResolvedValue({ usedCount: 7 });

      const res = await request(httpServer())
        .get(PREVIEW_PATH())
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(parseBody(res).data).toEqual({ remaining: 0, max: 3 });
    });

    it('looks up the allowance for the calling educator and the requested simulation only', async () => {
      await request(httpServer())
        .get(PREVIEW_PATH())
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(previewRepo.findByEducatorAndScenario).toHaveBeenCalledWith(EDUCATOR_ID, SCENARIO_ID);
    });

    it('returns 404 for an unknown simulation', async () => {
      simulationRepo.findByBusinessId.mockResolvedValue(null);

      await request(httpServer())
        .get(PREVIEW_PATH('does-not-exist'))
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(404);
    });

    it.each(['draft', 'archived', 'Archived'])(
      'returns 404 for a %s simulation the educator could not see in the catalog',
      async (status) => {
        simulationRepo.findByBusinessId.mockResolvedValue({ id: SCENARIO_ID, status });

        await request(httpServer())
          .get(PREVIEW_PATH())
          .set('Authorization', `Bearer ${educatorToken}`)
          .expect(404);

        expect(previewRepo.findByEducatorAndScenario).not.toHaveBeenCalled();
      },
    );

    it('returns 400 when the simulation id is too long', async () => {
      await request(httpServer())
        .get(PREVIEW_PATH('x'.repeat(PreviewConstants.VALIDATION.SCENARIO_ID_MAX_LENGTH + 1)))
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(400);

      expect(simulationRepo.findByBusinessId).not.toHaveBeenCalled();
    });

    it('refuses a district admin with 403', async () => {
      await request(httpServer())
        .get(PREVIEW_PATH())
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);

      expect(previewRepo.findByEducatorAndScenario).not.toHaveBeenCalled();
    });

    it('refuses an unauthenticated caller with 401', async () => {
      await request(httpServer()).get(PREVIEW_PATH()).expect(401);
    });
  });

  describe('POST :scenarioId/preview', () => {
    it('uses one preview and returns the updated allowance', async () => {
      previewRepo.consumeIfAvailable.mockResolvedValue(1);

      const res = await request(httpServer())
        .post(PREVIEW_PATH())
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(parseBody(res).data).toEqual({ remaining: 2, max: 3 });
      expect(previewRepo.consumeIfAvailable).toHaveBeenCalledTimes(1);
      expect(previewRepo.consumeIfAvailable).toHaveBeenCalledWith(
        EDUCATOR_ID,
        SCENARIO_ID,
        PreviewConstants.MAX_ALLOWANCE,
      );
    });

    it('reports zero remaining after the last preview is used', async () => {
      previewRepo.consumeIfAvailable.mockResolvedValue(3);

      const res = await request(httpServer())
        .post(PREVIEW_PATH())
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(parseBody(res).data).toEqual({ remaining: 0, max: 3 });
    });

    it('returns 409 with the exhausted message when no previews are left', async () => {
      previewRepo.consumeIfAvailable.mockResolvedValue(null);

      const res = await request(httpServer())
        .post(PREVIEW_PATH())
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(409);

      expect(JSON.stringify(parseBody(res))).toContain('ALLOWANCE_EXHAUSTED');
    });

    it('returns 404 for an unknown simulation without using a preview', async () => {
      simulationRepo.findByBusinessId.mockResolvedValue(null);

      await request(httpServer())
        .post(PREVIEW_PATH('does-not-exist'))
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(404);

      expect(previewRepo.consumeIfAvailable).not.toHaveBeenCalled();
    });

    it.each(['draft', 'archived'])(
      'returns 404 for a %s simulation without using a preview',
      async (status) => {
        simulationRepo.findByBusinessId.mockResolvedValue({ id: SCENARIO_ID, status });

        await request(httpServer())
          .post(PREVIEW_PATH())
          .set('Authorization', `Bearer ${educatorToken}`)
          .expect(404);

        expect(previewRepo.consumeIfAvailable).not.toHaveBeenCalled();
      },
    );

    it('refuses a district admin with 403 without using a preview', async () => {
      await request(httpServer())
        .post(PREVIEW_PATH())
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);

      expect(previewRepo.consumeIfAvailable).not.toHaveBeenCalled();
    });

    it('refuses an unauthenticated caller with 401', async () => {
      await request(httpServer()).post(PREVIEW_PATH()).expect(401);
    });

    it('uses exactly one preview per call, with no cooldown or deduplication', async () => {
      await request(httpServer())
        .post(PREVIEW_PATH())
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);
      await request(httpServer())
        .post(PREVIEW_PATH())
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(previewRepo.consumeIfAvailable).toHaveBeenCalledTimes(2);
    });
  });
});
