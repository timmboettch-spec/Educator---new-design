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

describe('Unit ID Validation — AdminService', () => {
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

  describe('createUnit ID validation', () => {
    it("throws BadRequestException for ID with '@'", async () => {
      unitRepository.findByBusinessId.mockResolvedValue(null);
      unitRepository.find.mockResolvedValue([]);

      await expect(async () =>
        service.createUnit({ id: '@unit-123', name: 'Nursing' }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException for ID with '#'", async () => {
      unitRepository.findByBusinessId.mockResolvedValue(null);
      unitRepository.find.mockResolvedValue([]);

      await expect(async () => service.createUnit({ id: 'unit#1', name: 'ICU' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('allows valid ID with letters, numbers, hyphens, underscores and spaces', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(null);
      unitRepository.find.mockResolvedValue([]);

      const result = await service.createUnit({
        id: 'unit-123_test ABC',
        name: 'Valid Name',
      });
      expect(result.id).toBe('unit-123_test ABC');
    });

    it('throws BadRequestException for ID with other special characters', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(null);
      unitRepository.find.mockResolvedValue([]);

      await expect(async () =>
        service.createUnit({ id: 'unit%20', name: 'Nursing' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
