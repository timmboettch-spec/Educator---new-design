import { Global, Module, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { envConfig } from '../../../../../src/common/config';
import { AdminModule } from 'src/student-backend/modules/admin/admin.module';
import { createMockSimulationReportRepository } from '../../../unit/common/utils/mock-factory';
import {
  SIMULATION_ACTION_REPOSITORY,
  SIMULATION_GRADING_RUBRIC_ITEM_REPOSITORY,
  SIMULATION_ORDER_LINKED_ACTION_REPOSITORY,
  SIMULATION_ORDER_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  TRANSCRIPT_REPOSITORY,
  UNIT_REPOSITORY,
} from '../../../../../src/database/tokens';
import { LoggerService } from '../../../../../src/common/services';
import { RedisService } from '../../../../../src/redis/redis.service';
import { ClassSimulationService } from '../../../../../src/class-simulations/class-simulation.service';
import { VOICE_PROFILE_REPOSITORY } from '../../../../../src/database/tokens';
import { AzureBlobService } from '../../../../../src/common/services/azure-blob.service';
import { AudioNormalizerService } from '../../../../../src/common/services/audio-normalizer.service';
import {
  createMockClassSimulationService,
  createMockSimulationChildRepository,
  createMockSimulationOrderLinkedActionRepository,
  createStatefulMockSimulationRepository,
} from '../../common/utils/simulation-mock-factory';

const mockLoggerService = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  fatal: jest.fn(),
};

// LoggerService is normally provided app-wide by the @Global() ServiceModule in
// the real app, but this test builds AdminModule directly without that module,
// so a stand-in @Global() module supplies the mock the same way.
@Global()
@Module({
  providers: [{ provide: LoggerService, useValue: mockLoggerService }],
  exports: [LoggerService],
})
class MockLoggerModule {}

// TokenService (pulled in via ServicesModule) needs RedisService, normally provided by the
// @Global() RedisModule, which isn't part of this isolated test tree.
@Global()
@Module({
  providers: [{ provide: RedisService, useValue: { get: jest.fn(), set: jest.fn() } }],
  exports: [RedisService],
})
class MockRedisModule {}

const mockUnitRepository = {
  findByBusinessId: jest.fn(async (id: string) => ({ id, name: 'Unit' })),
  find: jest.fn(async () => []),
};

@Global()
@Module({
  providers: [{ provide: UNIT_REPOSITORY, useValue: mockUnitRepository }],
  exports: [UNIT_REPOSITORY],
})
class MockUnitRepositoryModule {}

// SIMULATION_V2_REPOSITORY and its child-table repositories are normally
// provided app-wide by the @Global() DatabaseModule in the real app; that
// module isn't part of this isolated AdminModule test tree, so a stand-in
// module supplies mocks the same way MockUnitRepositoryModule does.
const mockSimulationRepository = createStatefulMockSimulationRepository();
const mockSimulationActionRepository = createMockSimulationChildRepository();
const mockSimulationOrderRepository = createMockSimulationChildRepository();
const mockSimulationOrderLinkedActionRepository = createMockSimulationOrderLinkedActionRepository();
const mockSimulationGradingRubricItemRepository = createMockSimulationChildRepository();

@Global()
@Module({
  providers: [
    { provide: SIMULATION_V2_REPOSITORY, useValue: mockSimulationRepository },
    { provide: SIMULATION_ACTION_REPOSITORY, useValue: mockSimulationActionRepository },
    { provide: SIMULATION_ORDER_REPOSITORY, useValue: mockSimulationOrderRepository },
    {
      provide: SIMULATION_ORDER_LINKED_ACTION_REPOSITORY,
      useValue: mockSimulationOrderLinkedActionRepository,
    },
    {
      provide: SIMULATION_GRADING_RUBRIC_ITEM_REPOSITORY,
      useValue: mockSimulationGradingRubricItemRepository,
    },
    { provide: TRANSCRIPT_REPOSITORY, useValue: { find: jest.fn().mockResolvedValue([]) } },
    { provide: SIMULATION_REPORT_REPOSITORY, useValue: createMockSimulationReportRepository() },
  ],
  exports: [
    SIMULATION_V2_REPOSITORY,
    SIMULATION_ACTION_REPOSITORY,
    SIMULATION_ORDER_REPOSITORY,
    SIMULATION_ORDER_LINKED_ACTION_REPOSITORY,
    SIMULATION_GRADING_RUBRIC_ITEM_REPOSITORY,
    TRANSCRIPT_REPOSITORY,
    SIMULATION_REPORT_REPOSITORY,
  ],
})
class MockSimulationRepositoryModule {}

// ClassSimulationService is normally provided app-wide via ClassSimulationModule in
// the real app, but this test builds AdminModule directly without that module, so
// a stand-in @Global() module supplies a mock the same way MockUnitRepositoryModule
// does for UNIT_REPOSITORY.
const mockClassSimulationService = createMockClassSimulationService();

@Global()
@Module({
  providers: [{ provide: ClassSimulationService, useValue: mockClassSimulationService }],
  exports: [ClassSimulationService],
})
class MockClassSimulationModule {}

// VOICE_PROFILE_REPOSITORY: AdminModule now imports VoiceProfilesModule (voiceProfileId
// scenario read/write), which isn't otherwise wired into this isolated test tree.
@Global()
@Module({
  providers: [
    {
      provide: VOICE_PROFILE_REPOSITORY,
      useValue: { findActiveById: jest.fn().mockResolvedValue(null) },
    },
    // ServicesModule (Azure blob + audio normalizer) is not part of this isolated tree either.
    { provide: AzureBlobService, useValue: {} },
    { provide: AudioNormalizerService, useValue: {} },
  ],
  exports: [VOICE_PROFILE_REPOSITORY, AzureBlobService, AudioNormalizerService],
})
class MockVoiceProfileRepositoryModule {}

describe('Admin Action Prompt CRUD', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: envConfig }),
        AdminModule,
        MockLoggerModule,
        MockRedisModule,
        MockUnitRepositoryModule,
        MockSimulationRepositoryModule,
        MockClassSimulationModule,
        MockVoiceProfileRepositoryModule,
      ],
    })
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

  beforeEach(() => {
    jest.clearAllMocks();
    mockSimulationRepository.__reset();
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

    expect(mockSimulationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({
            prompt: 'This is a test prompt',
          }),
        ]),
      }),
      { lockVoiceProfileId: null },
    );
  });

  it('successfully updates a scenario action with a new prompt', async () => {
    mockSimulationRepository.__seed({
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

    expect(mockSimulationRepository.updateById).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({
            prompt: 'New Prompt',
          }),
        ]),
      }),
      { lockVoiceProfileId: undefined },
    );
  });
});
