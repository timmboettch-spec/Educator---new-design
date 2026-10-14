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
import { LoggerService } from 'src/common/services';
import { RedisService } from 'src/redis/redis.service';
import { ClassSimulationService } from 'src/class-simulations/class-simulation.service';
import { VOICE_PROFILE_REPOSITORY } from 'src/database/tokens';
import { AzureBlobService } from 'src/common/services/azure-blob.service';
import { AudioNormalizerService } from 'src/common/services/audio-normalizer.service';
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

describe('Admin Scenarios API (e2e)', () => {
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
        forbidNonWhitelisted: true,
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
      mockSimulationRepository.__seed({ id: 's1', unitId: 'u1', title: 'Old' });

      await request(app.getHttpServer())
        .put('/api/admin/scenarios/s1')
        .send({ title: null })
        .expect(400);
    });

    it('rejects over-limit product name on update with 400', async () => {
      mockSimulationRepository.__seed({
        id: 's1',
        unitId: 'u1',
        title: 'Old',
        requiresProductSetup: true,
        productSetup: { title: 'Valid Name' },
      });

      await request(app.getHttpServer())
        .put('/api/admin/scenarios/s1')
        .send({
          productSetup: { title: 'a'.repeat(101) },
        })
        .expect(400);
    });

    it('rejects enabling required product setup without a product name on update', async () => {
      mockSimulationRepository.__seed({
        id: 's1',
        unitId: 'u1',
        title: 'Old',
        requiresProductSetup: false,
        productSetup: {},
      });

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
      const seeded = mockSimulationRepository.__seed({ id: 's1' });

      await request(app.getHttpServer()).delete('/api/admin/scenarios/s1').expect(200);

      expect(mockSimulationRepository.delete).toHaveBeenCalledWith(seeded.simulationId);
    });

    it('returns 404 for nonexistent scenario', async () => {
      await request(app.getHttpServer()).delete('/api/admin/scenarios/does-not-exist').expect(404);
    });
  });
});
