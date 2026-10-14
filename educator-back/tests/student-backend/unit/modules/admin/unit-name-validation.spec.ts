import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AdminService } from '@/modules/admin/admin.service';
import { ClassSimulationService } from 'src/class-simulations/class-simulation.service';
import { VoiceProfilesService } from 'src/voice-profiles/voice-profiles.service';
import { BadRequestException } from '@nestjs/common';
import { LoggerService } from 'src/common/services';
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
  createMockDataSource,
  createMockSimulationChildRepository,
  createMockSimulationOrderLinkedActionRepository,
  createMockSimulationRepository,
  createMockClassSimulationService,
  createMockUnitRepository,
} from '../../common/utils/mock-factory';

const mockLoggerService = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  fatal: jest.fn(),
};

describe('Unit Name Validation — AdminService', () => {
  let service: AdminService;
  let unitRepository: ReturnType<typeof createMockUnitRepository>;

  beforeEach(async () => {
    unitRepository = createMockUnitRepository();

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
        { provide: DataSource, useValue: createMockDataSource() },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: UNIT_REPOSITORY, useValue: unitRepository },
        { provide: SIMULATION_V2_REPOSITORY, useValue: createMockSimulationRepository() },
        { provide: TRANSCRIPT_REPOSITORY, useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: { findDetailRowByReportId: jest.fn() } },
        { provide: SIMULATION_ACTION_REPOSITORY, useValue: createMockSimulationChildRepository() },
        { provide: SIMULATION_ORDER_REPOSITORY, useValue: createMockSimulationChildRepository() },
        {
          provide: SIMULATION_ORDER_LINKED_ACTION_REPOSITORY,
          useValue: createMockSimulationOrderLinkedActionRepository(),
        },
        {
          provide: SIMULATION_GRADING_RUBRIC_ITEM_REPOSITORY,
          useValue: createMockSimulationChildRepository(),
        },
        { provide: ClassSimulationService, useValue: createMockClassSimulationService() },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    jest.clearAllMocks();
  });

  describe('createUnit name validation', () => {
    it("throws BadRequestException for name with '@'", async () => {
      unitRepository.findByBusinessId.mockResolvedValue(null);
      unitRepository.find.mockResolvedValue([]);

      await expect(async () =>
        service.createUnit({ id: 'unit-new', name: 'Nursing@123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException for name with '#'", async () => {
      unitRepository.findByBusinessId.mockResolvedValue(null);
      unitRepository.find.mockResolvedValue([]);

      await expect(async () =>
        service.createUnit({ id: 'unit-new', name: 'ICU#1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows valid name with letters, numbers and spaces', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(null);
      unitRepository.find.mockResolvedValue([]);

      const result = await service.createUnit({
        id: 'unit-new',
        name: 'Valid Unit 123',
      });
      expect(result.name).toBe('Valid Unit 123');
    });
  });

  describe('updateUnit name validation', () => {
    const UNIT_ALPHA = { unitId: 'uuid-1', id: 'unit-001', name: 'Alpha Unit' };

    it("throws BadRequestException for name with '$' during update", async () => {
      unitRepository.findByBusinessId.mockResolvedValue(UNIT_ALPHA as never);

      await expect(async () =>
        service.updateUnit('unit-001', { name: 'Invalid$Name' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
