/**
 * scenario-id-validation.spec.ts
 *
 * Regression tests for the bug:
 *   "Scenarios are created successfully even when the required Scenario ID
 *    is missing from the request payload."
 *
 * Coverage matrix
 * ──────────────────────────────────────────────────────────────────────────
 *  Layer                  | Tool
 *  ─────────────────────────────────────────────────────────────────────────
 *  AdminService unit      | Jest + mocked repositories
 *  AdminController unit   | Jest + mocked AdminService
 *  HTTP integration (e2e) | Supertest against the full NestJS app
 * ──────────────────────────────────────────────────────────────────────────
 */

import { BadRequestException, Global, Module, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as supertestLib from 'supertest';
const request = supertestLib.default;

import { AdminModule } from '@/modules/admin/admin.module';
import { AdminService } from '@/modules/admin/admin.service';
import { AdminController } from '@/modules/admin/admin.controller';
import type { CreateScenarioDto } from '@/modules/admin/dto/create-scenario.dto';
import { LoggerService } from 'src/common/services';
import { RedisService } from 'src/redis/redis.service';
import { ClassSimulationService } from 'src/class-simulations/class-simulation.service';
import { VoiceProfilesService } from 'src/voice-profiles/voice-profiles.service';
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

// UNIT_REPOSITORY is normally provided app-wide by the @Global() DatabaseModule in
// the real app; that module isn't part of this isolated AdminModule test tree,
// so a stand-in @Global() module supplies the mock the same way.
const mockUnitRepository = createMockUnitRepository();
mockUnitRepository.findByBusinessId.mockResolvedValue({ id: 'unit-1', name: 'Nursing' } as never);

@Global()
@Module({
  providers: [{ provide: UNIT_REPOSITORY, useValue: mockUnitRepository }],
  exports: [UNIT_REPOSITORY],
})
class MockUnitRepositoryModule {}

// SIMULATION_V2_REPOSITORY and its child-table repositories are normally provided
// app-wide by the @Global() DatabaseModule in the real app; that module isn't
// part of this isolated AdminModule test tree, so stand-in mocks supply them
// the same way MockUnitRepositoryModule does for UNIT_REPOSITORY.
function buildSimulationRepositoryMocks() {
  return {
    simulationRepository: createStatefulMockSimulationRepository(),
    simulationActionRepository: createMockSimulationChildRepository(),
    simulationOrderRepository: createMockSimulationChildRepository(),
    simulationOrderLinkedActionRepository: createMockSimulationOrderLinkedActionRepository(),
    simulationGradingRubricItemRepository: createMockSimulationChildRepository(),
  };
}

// Module-scoped instance for the e2e describe block below (section 3), which
// builds one real NestJS app in beforeAll rather than a fresh testing module
// per test.
const e2eSimulationMocks = buildSimulationRepositoryMocks();

@Global()
@Module({
  providers: [
    { provide: SIMULATION_V2_REPOSITORY, useValue: e2eSimulationMocks.simulationRepository },
    {
      provide: SIMULATION_ACTION_REPOSITORY,
      useValue: e2eSimulationMocks.simulationActionRepository,
    },
    {
      provide: SIMULATION_ORDER_REPOSITORY,
      useValue: e2eSimulationMocks.simulationOrderRepository,
    },
    {
      provide: SIMULATION_ORDER_LINKED_ACTION_REPOSITORY,
      useValue: e2eSimulationMocks.simulationOrderLinkedActionRepository,
    },
    {
      provide: SIMULATION_GRADING_RUBRIC_ITEM_REPOSITORY,
      useValue: e2eSimulationMocks.simulationGradingRubricItemRepository,
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

// DataSource is normally provided app-wide by TypeORM's root module in the
// real app; that module isn't part of this isolated AdminModule test tree,
// so a stand-in @Global() module supplies the mock the same way.
const mockDataSource = createMockDataSource({
  simulationRepository: e2eSimulationMocks.simulationRepository,
});

@Global()
@Module({
  providers: [{ provide: DataSource, useValue: mockDataSource }],
  exports: [DataSource],
})
class MockDataSourceModule {}

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

// VOICE_PROFILE_REPOSITORY + ConfigService: AdminModule now imports VoiceProfilesModule
// (voiceProfileId scenario read/write), which isn't otherwise wired into this isolated tree.
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

@Global()
@Module({
  providers: [{ provide: ConfigService, useValue: { get: jest.fn() } }],
  exports: [ConfigService],
})
class MockConfigModule {}

// ─────────────────────────────────────────────────────────────────────────────
// Shared mock factory
// ─────────────────────────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════
// 1. AdminService — unit tests
// ═════════════════════════════════════════════════════════════════════════════
describe('AdminService – createScenario Scenario ID validation', () => {
  let service: AdminService;
  let simulationMocks: ReturnType<typeof buildSimulationRepositoryMocks>;
  let dataSource: ReturnType<typeof createMockDataSource>;

  beforeEach(async () => {
    simulationMocks = buildSimulationRepositoryMocks();
    dataSource = createMockDataSource({
      simulationRepository: simulationMocks.simulationRepository,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: VoiceProfilesService,
          useValue: {
            resolveForScenario: jest.fn().mockResolvedValue(null),
            assertValidForScenarioWrite: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: DataSource, useValue: dataSource },
        { provide: UNIT_REPOSITORY, useValue: mockUnitRepository },
        { provide: ClassSimulationService, useValue: mockClassSimulationService },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationMocks.simulationRepository },
        {
          provide: SIMULATION_ACTION_REPOSITORY,
          useValue: simulationMocks.simulationActionRepository,
        },
        {
          provide: SIMULATION_ORDER_REPOSITORY,
          useValue: simulationMocks.simulationOrderRepository,
        },
        {
          provide: SIMULATION_ORDER_LINKED_ACTION_REPOSITORY,
          useValue: simulationMocks.simulationOrderLinkedActionRepository,
        },
        {
          provide: SIMULATION_GRADING_RUBRIC_ITEM_REPOSITORY,
          useValue: simulationMocks.simulationGradingRubricItemRepository,
        },
        { provide: TRANSCRIPT_REPOSITORY, useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: { findDetailRowByReportId: jest.fn() } },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── Missing / falsy ID ────────────────────────────────────────────────────

  it('throws BadRequestException when id is undefined', async () => {
    await expect(service.createScenario({ title: 'My Scenario' })).rejects.toThrow(
      BadRequestException,
    );

    expect(simulationMocks.simulationRepository.create).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when id is null', async () => {
    await expect(
      service.createScenario({ id: null as unknown as string, title: 'My Scenario' }),
    ).rejects.toThrow(BadRequestException);

    expect(simulationMocks.simulationRepository.create).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when id is an empty string', async () => {
    await expect(service.createScenario({ id: '', title: 'My Scenario' })).rejects.toThrow(
      BadRequestException,
    );

    expect(simulationMocks.simulationRepository.create).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when id contains only whitespace', async () => {
    await expect(service.createScenario({ id: '   ', title: 'My Scenario' })).rejects.toThrow(
      BadRequestException,
    );

    expect(simulationMocks.simulationRepository.create).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when id is a non-string value (number)', async () => {
    await expect(
      service.createScenario({ id: 123 as unknown as string, title: 'My Scenario' }),
    ).rejects.toThrow(BadRequestException);

    expect(simulationMocks.simulationRepository.create).not.toHaveBeenCalled();
  });

  // ── Error message content ─────────────────────────────────────────────────

  it("includes 'Scenario ID is required' in the error message when id is missing", async () => {
    let thrown: unknown;
    try {
      await service.createScenario({ title: 'My Scenario' });
      throw new Error('Expected BadRequestException to be thrown');
    } catch (err: unknown) {
      thrown = err;
    }
    {
      const err = thrown as BadRequestException;
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toMatch(/scenario id is required/i);
    }
    expect(thrown).toBeInstanceOf(BadRequestException);
  });

  // ── Duplicate ID ──────────────────────────────────────────────────────────

  it('throws BadRequestException when id already exists in the data store', async () => {
    simulationMocks.simulationRepository.__seed({ id: 'dup-001', title: 'Existing' });

    await expect(service.createScenario({ id: 'dup-001', title: 'New Scenario' })).rejects.toThrow(
      BadRequestException,
    );

    expect(simulationMocks.simulationRepository.create).not.toHaveBeenCalled();
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('creates the scenario and returns it when a valid id is supplied', async () => {
    const result = await service.createScenario({
      id: 'scenario-new-001',
      title: 'Valid Scenario',
      unitId: 'unit-1',
    });

    expect(result.id).toBe('scenario-new-001');
    expect(simulationMocks.simulationRepository.create).toHaveBeenCalledTimes(1);
    expect(simulationMocks.simulationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'scenario-new-001' }),
      { lockVoiceProfileId: null },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. AdminController — unit tests (controller layer only, service is mocked)
// ═════════════════════════════════════════════════════════════════════════════
describe('AdminController – createScenario Scenario ID validation', () => {
  let controller: AdminController;
  const mockAdminService = {
    createScenario: jest.fn(),
    getAllScenarios: jest.fn(),
    getScenarioById: jest.fn(),
    updateScenario: jest.fn(),
    deleteScenario: jest.fn(),
    getAllUnitsWithStats: jest.fn(),
    createUnit: jest.fn(),
    updateUnit: jest.fn(),
    deleteUnit: jest.fn(),
    deleteReport: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: mockAdminService }],
    }).compile();

    controller = module.get<AdminController>(AdminController);
    jest.clearAllMocks();
  });

  it('throws BadRequestException when neither scenarioId nor id is provided', async () => {
    await expect(
      controller.createScenario({ title: 'T' } as unknown as CreateScenarioDto),
    ).rejects.toThrow(BadRequestException);

    expect(mockAdminService.createScenario).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when scenarioId is an empty string', async () => {
    await expect(
      controller.createScenario({ scenarioId: '', title: 'T' } as unknown as CreateScenarioDto),
    ).rejects.toThrow(BadRequestException);

    expect(mockAdminService.createScenario).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when scenarioId is only whitespace', async () => {
    await expect(
      controller.createScenario({ scenarioId: '   ', title: 'T' } as unknown as CreateScenarioDto),
    ).rejects.toThrow(BadRequestException);

    expect(mockAdminService.createScenario).not.toHaveBeenCalled();
  });

  it('delegates to AdminService with the trimmed id when scenarioId is valid', async () => {
    mockAdminService.createScenario.mockResolvedValue({
      id: 'sc-001',
      title: 'T',
    });

    await controller.createScenario({
      scenarioId: '  sc-001  ',
      title: 'T',
    } as unknown as CreateScenarioDto);

    expect(mockAdminService.createScenario).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sc-001' }),
    );
  });

  it("uses legacy 'id' field when 'scenarioId' is absent", async () => {
    mockAdminService.createScenario.mockResolvedValue({
      id: 'sc-legacy',
      title: 'T',
    });

    await controller.createScenario({
      id: 'sc-legacy',
      title: 'T',
    } as unknown as CreateScenarioDto);

    expect(mockAdminService.createScenario).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sc-legacy' }),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. HTTP integration (e2e) — full NestJS app with ValidationPipe
// ═════════════════════════════════════════════════════════════════════════════
describe('POST /api/admin/scenarios – Scenario ID validation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
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
      ],
    })
      .overrideProvider(LoggerService)
      .useValue(mockLoggerService)
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
    e2eSimulationMocks.simulationRepository.__reset();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Rejection cases ───────────────────────────────────────────────────────

  it('returns 400 when the payload has no id and no scenarioId field', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/scenarios')
      .send({ title: 'My Scenario', unitId: 'unit-1' })
      .expect(400);

    expect(res.body.message).toBeDefined();
    expect(e2eSimulationMocks.simulationRepository.create).not.toHaveBeenCalled();
  });

  it('returns 400 when scenarioId is an empty string', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/scenarios')
      .send({ scenarioId: '', title: 'My Scenario' })
      .expect(400);

    expect(e2eSimulationMocks.simulationRepository.create).not.toHaveBeenCalled();
  });

  it('returns 400 when scenarioId is only whitespace', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/scenarios')
      .send({ scenarioId: '   ', title: 'My Scenario' })
      .expect(400);

    expect(e2eSimulationMocks.simulationRepository.create).not.toHaveBeenCalled();
  });

  it('returns 400 when id (legacy field) is an empty string', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/scenarios')
      .send({ id: '', title: 'My Scenario' })
      .expect(400);

    expect(e2eSimulationMocks.simulationRepository.create).not.toHaveBeenCalled();
  });

  it('returns 400 when both scenarioId and id are omitted entirely', async () => {
    await request(app.getHttpServer()).post('/api/admin/scenarios').send({}).expect(400);

    expect(e2eSimulationMocks.simulationRepository.create).not.toHaveBeenCalled();
  });

  it('returns 400 when title is also missing (multiple required fields absent)', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/scenarios')
      .send({ scenarioId: 's-001' })
      .expect(400);

    expect(e2eSimulationMocks.simulationRepository.create).not.toHaveBeenCalled();
  });

  // ── Response body confirms the validation error ────────────────────────────

  it("returns an error body that references 'Scenario ID' when id is missing", async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/scenarios')
      .send({ title: 'My Scenario' })
      .expect(400);

    const body = res.body as { message: string | string[] };
    const messages = Array.isArray(body.message) ? body.message.join(' ') : (body.message ?? '');

    expect(messages.toLowerCase()).toMatch(/scenario.?id|required/i);
  });

  // ── Acceptance case ───────────────────────────────────────────────────────

  it('returns 201 and stores the scenario when scenarioId and title are valid', async () => {
    const payload = {
      scenarioId: 'sc-valid-001',
      title: 'Valid Scenario',
      unitId: 'unit-1',
      estimatedDuration: '20 minutes',
    };

    const res = await request(app.getHttpServer())
      .post('/api/admin/scenarios')
      .send(payload)
      .expect(201);

    expect(res.body.id).toBe('sc-valid-001');
    expect(e2eSimulationMocks.simulationRepository.create).toHaveBeenCalledTimes(1);
    expect(e2eSimulationMocks.simulationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sc-valid-001' }),
      { lockVoiceProfileId: null },
    );
  });

  it("returns 201 when the legacy 'id' field is used instead of 'scenarioId'", async () => {
    const payload = {
      id: 'sc-legacy-001',
      title: 'Legacy ID Scenario',
      unitId: 'unit-1',
      estimatedDuration: '20 minutes',
    };

    const res = await request(app.getHttpServer())
      .post('/api/admin/scenarios')
      .send(payload)
      .expect(201);

    expect(res.body.id).toBe('sc-legacy-001');
    expect(e2eSimulationMocks.simulationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sc-legacy-001' }),
      { lockVoiceProfileId: null },
    );
  });
});
