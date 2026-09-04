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
 *  AdminService unit      | Jest + mocked JsonDataService
 *  AdminController unit   | Jest + mocked AdminService
 *  HTTP integration (e2e) | Supertest against the full NestJS app
 * ──────────────────────────────────────────────────────────────────────────
 */

import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import * as supertestLib from 'supertest';
const request = supertestLib.default;

import { AdminModule } from '@/modules/admin/admin.module';
import { AdminService } from '@/modules/admin/admin.service';
import { AdminController } from '@/modules/admin/admin.controller';
import { JsonDataService, JsonDataModule } from '@/data/json-data.service';
import { ScenarioAuthGuard } from '@/guards/scenario-auth.guard';
import type { CreateScenarioDto } from '@/modules/admin/dto/create-scenario.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Shared mock factory
// ─────────────────────────────────────────────────────────────────────────────
function buildMockJsonDataService() {
  return {
    getScenarioById: jest.fn().mockReturnValue(null),
    getScenarios: jest.fn().mockReturnValue([]),
    addScenario: jest.fn(),
    updateScenario: jest.fn(),
    deleteScenario: jest.fn(),
    getUnitById: jest.fn().mockReturnValue({ id: 'unit-1', name: 'Nursing' }),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. AdminService — unit tests
// ═════════════════════════════════════════════════════════════════════════════
describe('AdminService – createScenario Scenario ID validation', () => {
  let service: AdminService;
  let mockJsonDataService: ReturnType<typeof buildMockJsonDataService>;

  beforeEach(async () => {
    mockJsonDataService = buildMockJsonDataService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService, { provide: JsonDataService, useValue: mockJsonDataService }],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── Missing / falsy ID ────────────────────────────────────────────────────

  it('throws BadRequestException when id is undefined', async () => {
    await expect(service.createScenario({ title: 'My Scenario' })).rejects.toThrow(
      BadRequestException,
    );

    expect(mockJsonDataService.addScenario).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when id is null', async () => {
    await expect(
      service.createScenario({ id: null as unknown as string, title: 'My Scenario' }),
    ).rejects.toThrow(BadRequestException);

    expect(mockJsonDataService.addScenario).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when id is an empty string', async () => {
    await expect(service.createScenario({ id: '', title: 'My Scenario' })).rejects.toThrow(
      BadRequestException,
    );

    expect(mockJsonDataService.addScenario).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when id contains only whitespace', async () => {
    await expect(service.createScenario({ id: '   ', title: 'My Scenario' })).rejects.toThrow(
      BadRequestException,
    );

    expect(mockJsonDataService.addScenario).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when id is a non-string value (number)', async () => {
    await expect(
      service.createScenario({ id: 123 as unknown as string, title: 'My Scenario' }),
    ).rejects.toThrow(BadRequestException);

    expect(mockJsonDataService.addScenario).not.toHaveBeenCalled();
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
    mockJsonDataService.getScenarioById.mockReturnValue({
      id: 'dup-001',
      title: 'Existing',
    });

    await expect(service.createScenario({ id: 'dup-001', title: 'New Scenario' })).rejects.toThrow(
      BadRequestException,
    );

    expect(mockJsonDataService.addScenario).not.toHaveBeenCalled();
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('creates the scenario and returns it when a valid id is supplied', async () => {
    const result = await service.createScenario({
      id: 'scenario-new-001',
      title: 'Valid Scenario',
      unitId: 'unit-1',
    });

    expect(result.id).toBe('scenario-new-001');
    expect(mockJsonDataService.addScenario).toHaveBeenCalledTimes(1);
    expect(mockJsonDataService.addScenario).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'scenario-new-001' }),
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
    createOrUpdatePermission: jest.fn(),
    getAllStudentsWithStats: jest.fn(),
    getAllUnitsWithStats: jest.fn(),
    createUnit: jest.fn(),
    updateUnit: jest.fn(),
    deleteUnit: jest.fn(),
    getReports: jest.fn(),
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
  let mockJsonDataService: ReturnType<typeof buildMockJsonDataService>;

  beforeAll(async () => {
    mockJsonDataService = buildMockJsonDataService();

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

  beforeEach(() => jest.clearAllMocks());

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
    expect(mockJsonDataService.addScenario).not.toHaveBeenCalled();
  });

  it('returns 400 when scenarioId is an empty string', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/scenarios')
      .send({ scenarioId: '', title: 'My Scenario' })
      .expect(400);

    expect(mockJsonDataService.addScenario).not.toHaveBeenCalled();
  });

  it('returns 400 when scenarioId is only whitespace', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/scenarios')
      .send({ scenarioId: '   ', title: 'My Scenario' })
      .expect(400);

    expect(mockJsonDataService.addScenario).not.toHaveBeenCalled();
  });

  it('returns 400 when id (legacy field) is an empty string', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/scenarios')
      .send({ id: '', title: 'My Scenario' })
      .expect(400);

    expect(mockJsonDataService.addScenario).not.toHaveBeenCalled();
  });

  it('returns 400 when both scenarioId and id are omitted entirely', async () => {
    await request(app.getHttpServer()).post('/api/admin/scenarios').send({}).expect(400);

    expect(mockJsonDataService.addScenario).not.toHaveBeenCalled();
  });

  it('returns 400 when title is also missing (multiple required fields absent)', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/scenarios')
      .send({ scenarioId: 's-001' })
      .expect(400);

    expect(mockJsonDataService.addScenario).not.toHaveBeenCalled();
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
    expect(mockJsonDataService.addScenario).toHaveBeenCalledTimes(1);
    expect(mockJsonDataService.addScenario).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sc-valid-001' }),
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
    expect(mockJsonDataService.addScenario).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sc-legacy-001' }),
    );
  });
});
