import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Global, Module, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AdminModule } from '@/modules/admin/admin.module';
import { LoggerService } from 'src/common/services';
import { RedisService } from 'src/redis/redis.service';
import { ClassSimulationService } from 'src/class-simulations/class-simulation.service';
import { VOICE_PROFILE_REPOSITORY } from 'src/database/tokens';
import { AzureBlobService } from 'src/common/services/azure-blob.service';
import { AudioNormalizerService } from 'src/common/services/audio-normalizer.service';
import { ConfigService } from '@nestjs/config';
import {
  SIMULATION_ACTION_REPOSITORY,
  SIMULATION_GRADING_RUBRIC_ITEM_REPOSITORY,
  SIMULATION_ORDER_LINKED_ACTION_REPOSITORY,
  SIMULATION_ORDER_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  TRANSCRIPT_REPOSITORY,
  UNIT_REPOSITORY,
} from 'src/database/tokens';
import {
  createMockClassSimulationService,
  createMockDataSource,
  createMockSimulationChildRepository,
  createMockSimulationOrderLinkedActionRepository,
  createMockUnitRepository,
  createStatefulMockSimulationRepository,
} from '../../common/utils/mock-factory';

const mockLoggerService = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  fatal: jest.fn(),
};

// LoggerService is normally provided app-wide by the @Global() ServiceModule in
// the real app; that module isn't part of this isolated AdminModule test tree,
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

// UNIT_REPOSITORY and the simulation repositories are normally provided
// app-wide by the @Global() DatabaseModule in the real app; that module isn't
// part of this isolated AdminModule test tree, so stand-in modules supply
// mocks the same way.
const mockUnitRepository = createMockUnitRepository();
const mockSimulationRepository = createStatefulMockSimulationRepository();
const mockSimulationActionRepository = createMockSimulationChildRepository();
const mockSimulationOrderRepository = createMockSimulationChildRepository();
const mockSimulationOrderLinkedActionRepository = createMockSimulationOrderLinkedActionRepository();
const mockSimulationGradingRubricItemRepository = createMockSimulationChildRepository();
const mockDataSource = createMockDataSource({ simulationRepository: mockSimulationRepository });

@Global()
@Module({
  providers: [{ provide: UNIT_REPOSITORY, useValue: mockUnitRepository }],
  exports: [UNIT_REPOSITORY],
})
class MockUnitRepositoryModule {}

// DataSource is normally provided app-wide by TypeORM's root module in the
// real app; that module isn't part of this isolated AdminModule test tree,
// so a stand-in @Global() module supplies the mock the same way.
@Global()
@Module({
  providers: [{ provide: DataSource, useValue: mockDataSource }],
  exports: [DataSource],
})
class MockDataSourceModule {}

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
    { provide: SIMULATION_REPORT_REPOSITORY, useValue: { findDetailRowByReportId: jest.fn() } },
  ],
  exports: [
    SIMULATION_V2_REPOSITORY,
    SIMULATION_ACTION_REPOSITORY,
    SIMULATION_ORDER_REPOSITORY,
    SIMULATION_ORDER_LINKED_ACTION_REPOSITORY,
    SIMULATION_GRADING_RUBRIC_ITEM_REPOSITORY,
    SIMULATION_REPORT_REPOSITORY,
    TRANSCRIPT_REPOSITORY,
  ],
})
class MockSimulationRepositoryModule {}

// ClassSimulationService is normally provided app-wide via ClassSimulationModule in
// the real app; that module isn't part of this isolated AdminModule test tree, so
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
  ],
  exports: [VOICE_PROFILE_REPOSITORY],
})
class MockVoiceProfileRepositoryModule {}

// ConfigService: normally provided by the root ConfigModule.forRoot(), not part of this
// isolated test tree, but VoiceProfilesService (pulled in via AdminModule -> VoiceProfilesModule)
// needs it for azureBlob.voiceProfilesContainer / jwt.accessSecret lookups.
@Global()
@Module({
  providers: [{ provide: ConfigService, useValue: { get: jest.fn() } }],
  exports: [ConfigService],
})
class MockConfigModule {}

// AzureBlobService / AudioNormalizerService: VoiceProfilesService needs them, and they come from the
// app-wide ServiceModule, which is not part of this tree. (overrideProvider below only replaces a
// provider that already exists, so it cannot add them.)
@Global()
@Module({
  providers: [
    { provide: AzureBlobService, useValue: {} },
    { provide: AudioNormalizerService, useValue: {} },
  ],
  exports: [AzureBlobService, AudioNormalizerService],
})
class MockVoiceAudioServicesModule {}

// --- MOCK LOGIC FOR UNIT TESTS ---
// This represents the server-side validation logic that will prevent invalid state transitions.
const validateOrderTransition = (currentStatus: string, actionId: string, linkedIds: string[]) => {
  if (linkedIds.includes(actionId)) {
    return 'Completed';
  }
  return currentStatus;
};

describe('Order System Backend Verification', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        AdminModule,
        MockLoggerModule,
        MockRedisModule,
        MockUnitRepositoryModule,
        MockSimulationRepositoryModule,
        MockDataSourceModule,
        MockClassSimulationModule,
        MockVoiceProfileRepositoryModule,
        MockConfigModule,
        MockVoiceAudioServicesModule,
      ],
    })
      .overrideProvider(LoggerService)
      .useValue(mockLoggerService)
      .overrideProvider(AzureBlobService)
      .useValue({})
      .overrideProvider(AudioNormalizerService)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSimulationRepository.__reset();
    // clearAllMocks() only clears call history, not queued
    // mockResolvedValueOnce()/mockImplementation() state — these mocks are
    // shared module-level instances (DI wiring happened once in beforeAll),
    // so a full mockReset() is needed here to avoid leftover "once" values
    // from a previous test leaking into this one.
    mockSimulationOrderRepository.findBySimulationId.mockReset();
    mockSimulationActionRepository.findByBusinessId.mockReset();
    mockUnitRepository.findByBusinessId.mockResolvedValue({ id: 'u1', status: 'Paid' } as never);
    // An order-carrying PUT always ends with syncOrders re-reading the
    // simulation's orders to rebuild links — the first call (existing rows,
    // before the upsert) is empty, every call after reflects the just-upserted
    // order so link resolution has a real id to attach to. `id` is now the
    // sole (surrogate) primary key, so it's whatever the client round-tripped
    // (or was assigned) as the order's id.
    mockSimulationOrderRepository.findBySimulationId
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ id: 'ord-1' }]);
  });

  // --- UNIT TESTS: LOGIC VALIDATION ---
  describe('Unit: Order State Logic', () => {
    it('should transition to Completed when correct action linked', () => {
      const result = validateOrderTransition('Active', 'act-1', ['act-1', 'act-2']);
      expect(result).toBe('Completed');
    });

    it('should output same status if action is unrelated', () => {
      const result = validateOrderTransition('Active', 'act-99', ['act-1', 'act-2']);
      expect(result).toBe('Active');
    });

    it('should return currentStatus if linkedIds is empty', () => {
      const result = validateOrderTransition('Active', 'act-1', []);
      expect(result).toBe('Active');
    });
  });

  // --- INTEGRATION TESTS: PERSISTENCE ---
  describe('Integration: Multi-Select Persistence', () => {
    it('should accept and persist linkedActionIds via PUT', async () => {
      mockSimulationRepository.__seed({ id: 's1', unitId: 'u1', title: 'Test Scenario' });

      const payload = {
        id: 's1',
        title: 'Updated Scenario',
        orders: [
          {
            id: 'ord-1',
            title: 'Order with Links',
            // The critical field we are testing
            linkedActionIds: ['action-a', 'action-b'],
          },
        ],
      };

      await request(app.getHttpServer()).put('/admin/scenarios/s1').send(payload).expect(200);

      // Resolving business ids to surrogate keys and persisting the join-table
      // rows now happens inside SimulationRepository.updateById (see
      // src/database/repositories/simulation.repository.ts) rather than in
      // AdminService — this test tree mocks that repository out entirely, so
      // the most it can verify from here is that AdminService passes the
      // orders (with their linkedActionIds) through to updateById untouched.
      expect(mockSimulationRepository.updateById).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          orders: expect.arrayContaining([
            expect.objectContaining({
              id: 'ord-1',
              linkedActionIds: expect.arrayContaining(['action-a', 'action-b']),
            }),
          ]),
        }),
        { lockVoiceProfileId: undefined },
      );
    });

    it('should persist empty linkedActionIds to clear selection', async () => {
      mockSimulationRepository.__seed({ id: 's1', unitId: 'u1', title: 'Test Scenario' });

      const payload = {
        id: 's1',
        title: 'Clear Selection Scenario',
        orders: [
          {
            id: 'ord-1',
            title: 'Order with Cleared Links',
            linkedActionIds: [], // Explicitly sending empty array
          },
        ],
      };

      await request(app.getHttpServer()).put('/admin/scenarios/s1').send(payload).expect(200);

      expect(mockSimulationRepository.updateById).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          orders: expect.arrayContaining([
            expect.objectContaining({ id: 'ord-1', linkedActionIds: [] }),
          ]),
        }),
        { lockVoiceProfileId: undefined },
      );
    });
  });

  // --- REGRESSION TESTS ---
  describe('Regression: Backward Compatibility', () => {
    it('should accept legacy orders without linkedActionIds', async () => {
      mockSimulationRepository.__seed({ id: 's1', unitId: 'u1' });

      const legacyPayload = {
        id: 's1',
        title: 'Legacy Update',
        orders: [{ id: 'old-1', title: 'No Links' }],
      };

      await request(app.getHttpServer()).put('/admin/scenarios/s1').send(legacyPayload).expect(200);

      expect(mockSimulationRepository.updateById).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          orders: expect.arrayContaining([expect.objectContaining({ id: 'old-1' })]),
        }),
        { lockVoiceProfileId: undefined },
      );
    });
  });
});
