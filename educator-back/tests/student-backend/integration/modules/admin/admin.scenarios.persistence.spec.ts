import { ValidationPipe } from '@nestjs/common';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminModule } from '@/modules/admin/admin.module';
import { JsonDataService, JsonDataModule } from '@/data/json-data.service';
import { ScenarioAuthGuard } from '@/guards/scenario-auth.guard';

describe('Admin Scenarios Persistence (e2e)', () => {
  let app: INestApplication;

  const mockJsonDataService = {
    getScenarioById: jest.fn(),
    getScenarios: jest.fn(),
    addScenario: jest.fn(),
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

  describe('POST /api/admin/scenarios - Persistence', () => {
    it('saves language and voice when provided', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue(null);
      mockJsonDataService.getScenarios.mockReturnValue([]);
      mockJsonDataService.getUnitById.mockReturnValue({ id: 'u1' });

      const scenarioData = {
        scenarioId: 's1',
        title: 'New Scenario',
        unitId: 'u1',
        language: 'es-MX',
        voice: 'Jorge',
        estimatedDuration: '20 minutes',
      };

      await request(app.getHttpServer())
        .post('/api/admin/scenarios')
        .send(scenarioData)
        .expect(201);

      expect(mockJsonDataService.addScenario).toHaveBeenCalledWith(
        expect.objectContaining({
          language: 'es-MX',
          voice: 'Jorge',
        }),
      );
    });
  });
});
