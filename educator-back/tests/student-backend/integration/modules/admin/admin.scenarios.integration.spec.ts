import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminModule } from '@/modules/admin/admin.module';
import { JsonDataService, JsonDataModule } from '@/data/json-data.service';
import { ScenarioAuthGuard } from '@/guards/scenario-auth.guard';

describe('Admin Scenarios API (e2e)', () => {
  let app: INestApplication;

  const mockJsonDataService = {
    getScenarioById: jest.fn(),
    getScenarios: jest.fn(),
    addScenario: jest.fn(),
    updateScenario: jest.fn(),
    deleteScenario: jest.fn(),
    getUnitById: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AdminModule, JsonDataModule],
    })
      .overrideProvider(JsonDataService)
      .useValue(mockJsonDataService)
      .overrideGuard(ScenarioAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api');
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/admin/scenarios', () => {
    it('rejects missing scenarioId/id with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/scenarios')
        .send({ title: 'T' })
        .expect(400);
    });

    it('rejects blank scenarioId with 400 + validation error', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/scenarios')
        .send({ scenarioId: '   ', title: 'T' })
        .expect(400);
    });

    it('rejects missing title with 400 + validation error', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/scenarios')
        .send({ scenarioId: 's1' })
        .expect(400);
    });

    it('rejects blank title with 400 + validation error', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/scenarios')
        .send({ scenarioId: 's1', title: '   ' })
        .expect(400);
    });

    it('rejects over-limit product name on create with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/scenarios')
        .send({
          scenarioId: 's1',
          title: 'Valid Scenario',
          unitId: 'u1',
          requiresProductSetup: true,
          productSetup: { title: 'a'.repeat(101) },
        })
        .expect(400);
    });

    it('rejects empty product name when product setup is required on create', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue(null);
      mockJsonDataService.getScenarios.mockReturnValue([]);
      mockJsonDataService.getUnitById.mockReturnValue({ id: 'u1', Status: 'Paid' });

      await request(app.getHttpServer())
        .post('/api/admin/scenarios')
        .send({
          scenarioId: 's1',
          title: 'Valid Scenario',
          unitId: 'u1',
          requiresProductSetup: true,
          productSetup: { title: '   ' },
        })
        .expect(400);
    });
  });

  describe('PUT /api/admin/scenarios/:id', () => {
    it('rejects updates that null out required fields (title) with 400', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue({
        id: 's1',
        unitId: 'u1',
        title: 'Old',
      });
      mockJsonDataService.getUnitById.mockReturnValue({
        id: 'u1',
        Status: 'Paid',
      });
      mockJsonDataService.getScenarios.mockReturnValue([{ id: 's1', unitId: 'u1', title: 'Old' }]);

      await request(app.getHttpServer())
        .put('/api/admin/scenarios/s1')
        .send({ title: null })
        .expect(400);
    });

    it('rejects over-limit product name on update with 400', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue({
        id: 's1',
        unitId: 'u1',
        title: 'Old',
        requiresProductSetup: true,
        productSetup: { title: 'Valid Name' },
      });
      mockJsonDataService.getUnitById.mockReturnValue({
        id: 'u1',
        Status: 'Paid',
      });
      mockJsonDataService.getScenarios.mockReturnValue([{ id: 's1', unitId: 'u1', title: 'Old' }]);

      await request(app.getHttpServer())
        .put('/api/admin/scenarios/s1')
        .send({
          productSetup: { title: 'a'.repeat(101) },
        })
        .expect(400);
    });

    it('rejects enabling required product setup without a product name on update', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue({
        id: 's1',
        unitId: 'u1',
        title: 'Old',
        requiresProductSetup: false,
        productSetup: {},
      });
      mockJsonDataService.getUnitById.mockReturnValue({
        id: 'u1',
        Status: 'Paid',
      });
      mockJsonDataService.getScenarios.mockReturnValue([{ id: 's1', unitId: 'u1', title: 'Old' }]);

      await request(app.getHttpServer())
        .put('/api/admin/scenarios/s1')
        .send({
          requiresProductSetup: true,
          productSetup: { title: '   ' },
        })
        .expect(400);
    });
  });

  describe('DELETE /api/admin/scenarios/:id', () => {
    it('deletes valid scenarios successfully', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue({ id: 's1' });

      await request(app.getHttpServer()).delete('/api/admin/scenarios/s1').expect(200);

      expect(mockJsonDataService.deleteScenario).toHaveBeenCalledWith('s1');
    });

    it('returns 404 for nonexistent scenario', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue(null);

      await request(app.getHttpServer()).delete('/api/admin/scenarios/does-not-exist').expect(404);
    });
  });
});
