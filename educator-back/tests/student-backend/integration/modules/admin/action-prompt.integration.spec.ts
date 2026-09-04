import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminModule } from '@/modules/admin/admin.module';
import { JsonDataService, JsonDataModule } from '@/data/json-data.service';
import { ScenarioAuthGuard } from '@/guards/scenario-auth.guard';

describe('Admin Action Prompt CRUD', () => {
  let app: INestApplication;

  const mockJsonDataService = {
    getScenarioById: jest.fn(),
    getScenarios: jest.fn().mockReturnValue([]),
    addScenario: jest.fn(),
    updateScenario: jest.fn(),
    getUnitById: jest.fn().mockReturnValue({ id: 'unit-1', Status: 'Paid' }),
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
        transform: true,
      }),
    );
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('successfully creates a scenario with action prompts', async () => {
    const scenarioData = {
      scenarioId: 'test-scn-1',
      title: 'Action Prompt Test',
      unitId: 'unit-1',
      estimatedDuration: '20 minutes',
      actions: [
        {
          order: 1,
          title: 'Action with Prompt',
          prompt: 'This is a test prompt',
          items: ['Item 1'],
          correct: 'Item 1',
        },
      ],
    };

    await request(app.getHttpServer()).post('/api/admin/scenarios').send(scenarioData).expect(201);

    expect(mockJsonDataService.addScenario).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({
            prompt: 'This is a test prompt',
          }),
        ]),
      }),
    );
  });

  it('successfully updates a scenario action with a new prompt', async () => {
    mockJsonDataService.getScenarioById.mockReturnValue({
      id: 'test-scn-1',
      unitId: 'unit-1',
      title: 'Action Prompt Test',
      actions: [
        {
          order: 1,
          title: 'Action with Prompt',
          prompt: 'Old Prompt',
          items: ['Item 1'],
          correct: 'Item 1',
        },
      ],
    });

    const updateData = {
      actions: [
        {
          order: 1,
          title: 'Action with Prompt',
          prompt: 'New Prompt',
          items: ['Item 1'],
          correct: 'Item 1',
        },
      ],
    };

    await request(app.getHttpServer())
      .put('/api/admin/scenarios/test-scn-1')
      .send(updateData)
      .expect(200);

    expect(mockJsonDataService.updateScenario).toHaveBeenCalledWith(
      'test-scn-1',
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({
            prompt: 'New Prompt',
          }),
        ]),
      }),
    );
  });
});
