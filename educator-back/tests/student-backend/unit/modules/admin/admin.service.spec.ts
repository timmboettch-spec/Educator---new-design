import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AdminService } from '@/modules/admin/admin.service';
import { ClassSimulationService } from 'src/class-simulations/class-simulation.service';
import { VoiceProfilesService } from 'src/voice-profiles/voice-profiles.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LoggerService } from 'src/common/services';
import {
  SIMULATION_ACTION_REPOSITORY,
  SIMULATION_GRADING_RUBRIC_ITEM_REPOSITORY,
  SIMULATION_ORDER_LINKED_ACTION_REPOSITORY,
  SIMULATION_ORDER_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  TRANSCRIPT_REPOSITORY,
  UNIT_REPOSITORY,
} from 'src/database/tokens';
import {
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

const mockClassSimulationService = {
  recalculateSeatsForUnitCategoryChange: jest.fn().mockResolvedValue(undefined),
  recalculateSeatsForSimulationChange: jest.fn().mockResolvedValue(undefined),
};

describe('AdminService', () => {
  let service: AdminService;
  let unitRepository: ReturnType<typeof createMockUnitRepository>;
  let simulationRepository: ReturnType<typeof createStatefulMockSimulationRepository>;
  let simulationActionRepository: ReturnType<typeof createMockSimulationChildRepository>;
  let simulationOrderRepository: ReturnType<typeof createMockSimulationChildRepository>;
  let simulationOrderLinkedActionRepository: ReturnType<
    typeof createMockSimulationOrderLinkedActionRepository
  >;
  let simulationGradingRubricItemRepository: ReturnType<typeof createMockSimulationChildRepository>;
  let dataSource: ReturnType<typeof createMockDataSource>;

  const mockGetReportById = jest.fn();

  const mockSimulationReportRepository = {
    findDetailRowByReportId: jest.fn(),
  };

  const mockTranscriptRepository = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    unitRepository = createMockUnitRepository();
    simulationRepository = createStatefulMockSimulationRepository();
    simulationActionRepository = createMockSimulationChildRepository();
    simulationOrderRepository = createMockSimulationChildRepository();
    simulationOrderLinkedActionRepository = createMockSimulationOrderLinkedActionRepository();
    simulationGradingRubricItemRepository = createMockSimulationChildRepository();
    dataSource = createMockDataSource({ simulationRepository });

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
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: UNIT_REPOSITORY,
          useValue: unitRepository,
        },
        {
          provide: ClassSimulationService,
          useValue: mockClassSimulationService,
        },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationRepository },
        { provide: SIMULATION_ACTION_REPOSITORY, useValue: simulationActionRepository },
        { provide: SIMULATION_ORDER_REPOSITORY, useValue: simulationOrderRepository },
        {
          provide: SIMULATION_ORDER_LINKED_ACTION_REPOSITORY,
          useValue: simulationOrderLinkedActionRepository,
        },
        {
          provide: SIMULATION_GRADING_RUBRIC_ITEM_REPOSITORY,
          useValue: simulationGradingRubricItemRepository,
        },
        { provide: TRANSCRIPT_REPOSITORY, useValue: mockTranscriptRepository },
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: mockSimulationReportRepository },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);

    jest.clearAllMocks();
    simulationRepository.__reset();
  });

  /* ------------------------------ Scenarios ------------------------------ */

  describe('getAllScenarios', () => {
    it('should return all scenarios', async () => {
      simulationRepository.__seed({ id: 's1', title: 'S1' });

      const result = await service.getAllScenarios();

      expect(result.length).toBe(1);
    });
  });

  describe('getScenarioById', () => {
    it('should throw when not found', async () => {
      await expect(async () => service.getScenarioById('s1')).rejects.toThrow(NotFoundException);
    });

    it('should return scenario when found', async () => {
      simulationRepository.__seed({ id: 's1', title: 'S1' });

      const result = await service.getScenarioById('s1');

      expect(result.id).toBe('s1');
    });
  });

  describe('createScenario', () => {
    it('should throw when id missing', async () => {
      await expect(async () => service.createScenario({ title: 'Test' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw when id is blank', async () => {
      await expect(async () =>
        service.createScenario({ id: '   ', title: 'Test' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when title missing', async () => {
      await expect(async () => service.createScenario({ id: 's1' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw when title is blank', async () => {
      await expect(async () => service.createScenario({ id: 's1', title: '   ' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw when product setup is required but product name is missing', async () => {
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);

      await expect(
        service.createScenario({
          id: 's1',
          title: 'Scenario',
          unitId: 'u1',
          requiresProductSetup: true,
          productSetup: { title: '   ' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when product name exceeds 100 characters', async () => {
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);

      await expect(
        service.createScenario({
          id: 's1',
          title: 'Scenario',
          unitId: 'u1',
          requiresProductSetup: true,
          productSetup: { title: 'a'.repeat(101) },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when duplicate id exists', async () => {
      simulationRepository.__seed({ id: 's1', title: 'S1' });

      await expect(async () => service.createScenario({ id: 's1', title: 'Test' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should create scenario when valid', async () => {
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);

      const result = await service.createScenario({
        id: 's1',
        title: 'Scenario',
        unitId: 'u1',
      });

      expect(result.id).toBe('s1');
      expect(simulationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ id: 's1' }),
        { lockVoiceProfileId: null },
      );
    });

    // Action categories (Scenario.actionCategories) are intentionally not part
    // of the Postgres-backed scenario shape — they still live entirely on blob
    // storage via getScenarioCategories/createCategory/updateCategory/
    // deleteCategory (see admin.category.spec.ts), decoupled from
    // createScenario's payload.

    it('should trim and collapse whitespace in product name on create', async () => {
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);

      const result = await service.createScenario({
        id: 's1',
        title: 'Scenario',
        unitId: 'u1',
        requiresProductSetup: true,
        productSetup: { title: '  AED   Trainer   Pro  ' },
      });

      expect(result.productSetup?.title).toBe('AED Trainer Pro');
    });

    it('should leave already-clean product name unchanged on create', async () => {
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);

      const result = await service.createScenario({
        id: 's1',
        title: 'Scenario',
        unitId: 'u1',
        requiresProductSetup: true,
        productSetup: { title: 'AED Trainer' },
      });

      expect(result.productSetup?.title).toBe('AED Trainer');
    });
  });

  describe('updateScenario', () => {
    it('should throw when scenario not found', async () => {
      await expect(async () => service.updateScenario('s1', {})).rejects.toThrow(NotFoundException);
    });

    it('should reject updates that null out required fields (title)', async () => {
      simulationRepository.__seed({ id: 's1', unitId: 'u1', title: 'Old' });

      await expect(
        service.updateScenario('s1', { title: null as unknown as string }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when enabling product setup without a product name', async () => {
      simulationRepository.__seed({
        id: 's1',
        unitId: 'u1',
        title: 'Old',
        requiresProductSetup: false,
        productSetup: {},
      });

      await expect(
        service.updateScenario('s1', {
          requiresProductSetup: true,
          productSetup: { title: '  ' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when updated product name exceeds 100 characters', async () => {
      simulationRepository.__seed({
        id: 's1',
        unitId: 'u1',
        title: 'Old',
        requiresProductSetup: true,
        productSetup: { title: 'Valid Name' },
      });

      await expect(
        service.updateScenario('s1', {
          productSetup: { title: 'a'.repeat(101) },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow updates when legacy long product name is unchanged', async () => {
      simulationRepository.__seed({
        id: 's1',
        unitId: 'u1',
        title: 'Old',
        requiresProductSetup: true,
        productSetup: { title: 'a'.repeat(140) },
      });
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);

      await expect(service.updateScenario('s1', { title: 'Updated Title' })).resolves.toBeDefined();
    });

    it('should update scenario title', async () => {
      simulationRepository.__seed({ id: 's1', title: 'Old', unitId: 'u1' });
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);

      const result = await service.updateScenario('s1', { title: 'New' });

      expect(result).toBeDefined();
      expect(result!.title).toBe('New');
      expect(unitRepository.findByBusinessId).toHaveBeenCalledWith('u1');
      expect(simulationRepository.updateById).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ title: 'New' }),
        { lockVoiceProfileId: undefined },
      );
    });

    it('does not trigger seat recalc when only unrelated fields change', async () => {
      simulationRepository.__seed({ id: 's1', title: 'Old', unitId: 'u1', avatarEnabled: false });
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);

      await service.updateScenario('s1', { title: 'New' });

      expect(mockClassSimulationService.recalculateSeatsForSimulationChange).not.toHaveBeenCalled();
    });

    it('triggers seat recalc when avatarEnabled flips (Manikin → AI Only)', async () => {
      simulationRepository.__seed({ id: 's1', title: 'Old', unitId: 'u1', avatarEnabled: false });
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);

      await service.updateScenario('s1', { avatarEnabled: true });

      expect(mockClassSimulationService.recalculateSeatsForSimulationChange).toHaveBeenCalledWith(
        's1',
      );
    });

    it('triggers seat recalc when department changes', async () => {
      simulationRepository.__seed({ id: 's1', title: 'Old', unitId: 'u1', department: 'Nursing' });
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);

      await service.updateScenario('s1', { department: 'AI Simulations' });

      expect(mockClassSimulationService.recalculateSeatsForSimulationChange).toHaveBeenCalledWith(
        's1',
      );
    });

    it('logs and does not throw when scenario seat recalc fails', async () => {
      simulationRepository.__seed({ id: 's1', title: 'Old', unitId: 'u1', avatarEnabled: false });
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);
      mockClassSimulationService.recalculateSeatsForSimulationChange.mockRejectedValueOnce(
        new Error('db down'),
      );

      await expect(service.updateScenario('s1', { avatarEnabled: true })).resolves.toBeDefined();
      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    it('should trim and collapse whitespace in product name on update', async () => {
      simulationRepository.__seed({
        id: 's1',
        unitId: 'u1',
        title: 'Old',
        requiresProductSetup: true,
        productSetup: { title: 'AED Trainer' },
      });
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);

      await service.updateScenario('s1', {
        productSetup: { title: '  AED   Trainer   Pro  ' },
      });

      expect(simulationRepository.updateById).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          productSetup: expect.objectContaining({ title: 'AED Trainer Pro' }),
        }),
        { lockVoiceProfileId: undefined },
      );
    });

    it('should leave already-clean product name unchanged on update', async () => {
      simulationRepository.__seed({
        id: 's1',
        unitId: 'u1',
        title: 'Old',
        requiresProductSetup: true,
        productSetup: { title: 'AED Trainer' },
      });
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);

      await service.updateScenario('s1', {
        productSetup: { title: 'AED Trainer' },
      });

      expect(simulationRepository.updateById).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          productSetup: expect.objectContaining({ title: 'AED Trainer' }),
        }),
        { lockVoiceProfileId: undefined },
      );
    });
  });

  describe('deleteScenario', () => {
    it('should throw 400 when scenario id missing/blank', async () => {
      // @ts-expect-error - intentional bad input for test
      await expect(async () => service.deleteScenario(undefined)).rejects.toThrow(
        BadRequestException,
      );
      await expect(async () => service.deleteScenario('   ')).rejects.toThrow(BadRequestException);
    });

    it('should throw when not found', async () => {
      await expect(async () => service.deleteScenario('s1')).rejects.toThrow(NotFoundException);
    });

    it('should delete when found', async () => {
      simulationRepository.__seed({ id: 's1', title: 'S1' });

      const result = await service.deleteScenario('s1');

      expect(result.message).toContain('deleted successfully');
      expect(simulationRepository.delete).toHaveBeenCalled();
    });
  });

  /* ------------------------------ Units ------------------------------ */

  describe('getAllUnits', () => {
    it('should return units with scenarioCount', async () => {
      unitRepository.find.mockResolvedValue([{ id: 'u1', order: 1 }] as never);
      simulationRepository.findByUnitId.mockResolvedValue([{ id: 's1' }] as never);

      const result = await service.getAllUnits();

      expect(result[0].scenarioCount).toBe(1);
    });
  });

  describe('getUnitById', () => {
    it('should throw when not found', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(null);

      await expect(async () => service.getUnitById('u1')).rejects.toThrow(NotFoundException);
    });

    it('should return unit with scenarioCount', async () => {
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1', name: 'Unit 1' } as never);
      simulationRepository.findByUnitId.mockResolvedValue([{ id: 's1' }] as never);

      const result = await service.getUnitById('u1');

      expect(result.scenarioCount).toBe(1);
    });
  });

  describe('createUnit', () => {
    it('should throw when id missing', async () => {
      await expect(async () => service.createUnit({})).rejects.toThrow(BadRequestException);
    });

    it('should throw when duplicate id exists', async () => {
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);

      await expect(async () => service.createUnit({ id: 'u1' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should create unit when valid', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(null);
      unitRepository.find.mockResolvedValue([]);

      const result = await service.createUnit({ id: 'u1', name: 'Unit 1' });

      expect(result.id).toBe('u1');
      expect(unitRepository.create).toHaveBeenCalled();
    });
  });

  describe('updateUnit', () => {
    it('should throw when unit not found', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(null);

      await expect(async () => service.updateUnit('u1', {})).rejects.toThrow(NotFoundException);
    });

    it('should update unit when found', async () => {
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1', name: 'Unit 1' } as never);

      await service.updateUnit('u1', { name: 'New' });

      expect(unitRepository.update).toHaveBeenCalled();
    });

    it('does not trigger seat recalc when the category is unchanged', async () => {
      unitRepository.findByBusinessId
        .mockResolvedValueOnce({ id: 'u1', name: 'Unit 1', category: 'Manikin' } as never)
        .mockResolvedValueOnce({ id: 'u1', name: 'Unit 1', category: 'Manikin' } as never);

      await service.updateUnit('u1', { name: 'New' });

      expect(
        mockClassSimulationService.recalculateSeatsForUnitCategoryChange,
      ).not.toHaveBeenCalled();
    });

    it('triggers seat recalc when the unit category changes (Manikin → AI Only)', async () => {
      unitRepository.findByBusinessId
        .mockResolvedValueOnce({ id: 'u1', name: 'Unit 1', category: 'Manikin' } as never)
        .mockResolvedValueOnce({ id: 'u1', name: 'Unit 1', category: 'AI Only' } as never);

      await service.updateUnit('u1', { category: 'AI Only' as never });

      expect(mockClassSimulationService.recalculateSeatsForUnitCategoryChange).toHaveBeenCalledWith(
        'u1',
      );
    });

    it('logs and does not throw when unit seat recalc fails', async () => {
      unitRepository.findByBusinessId
        .mockResolvedValueOnce({ id: 'u1', name: 'Unit 1', category: 'Manikin' } as never)
        .mockResolvedValueOnce({ id: 'u1', name: 'Unit 1', category: 'AI Only' } as never);
      mockClassSimulationService.recalculateSeatsForUnitCategoryChange.mockRejectedValueOnce(
        new Error('db down'),
      );

      await expect(
        service.updateUnit('u1', { category: 'AI Only' as never }),
      ).resolves.toBeDefined();
      expect(mockLoggerService.error).toHaveBeenCalled();
    });
  });

  describe('deleteUnit', () => {
    it('should throw when not found', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(null);

      await expect(async () => service.deleteUnit('u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw when unit has scenarios', async () => {
      unitRepository.findByBusinessId.mockResolvedValue({ unitId: 'uuid-u1', id: 'u1' } as never);
      simulationRepository.findByUnitId.mockResolvedValue([{ id: 's1' }] as never);

      await expect(async () => service.deleteUnit('u1')).rejects.toThrow(BadRequestException);
    });

    it('should delete unit when no scenarios', async () => {
      unitRepository.findByBusinessId.mockResolvedValue({ unitId: 'uuid-u1', id: 'u1' } as never);
      simulationRepository.findByUnitId.mockResolvedValue([]);

      const result = await service.deleteUnit('u1');

      expect(result.message).toContain('deleted successfully');
      expect(unitRepository.softDelete).toHaveBeenCalledWith('uuid-u1');
    });
  });

  /* ------------------------------ Reports ------------------------------ */

  describe('getReportById', () => {
    it('should throw when report not found', async () => {
      mockSimulationReportRepository.findDetailRowByReportId.mockResolvedValue(null);

      await expect(service.getReportById('r1')).rejects.toThrow(NotFoundException);
    });

    it('should return the mapped report from the database without reading Blob', async () => {
      mockSimulationReportRepository.findDetailRowByReportId.mockResolvedValue({
        id: 'uuid-1',
        reportId: 'r1',
        mode: 'Practice',
      });

      const result = await service.getReportById('r1');

      expect(result.id).toBe('r1');
      expect(mockSimulationReportRepository.findDetailRowByReportId).toHaveBeenCalledWith('r1');
      expect(mockGetReportById).not.toHaveBeenCalled();
    });
  });

  /* ------------------------------ Timeline Tests ------------------------------ */

  describe('should_create_scenario_with_valid_timeline', () => {
    it('should create scenario with timeline configuration', async () => {
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);

      const result = await service.createScenario({
        id: 's1',
        title: 'Timeline Scenario',
        unitId: 'u1',
        timeline: {
          timelineElements: [{ id: 'e1', startTime: 0, endTime: 300 }],
          settings: { totalScenarioDurationSeconds: 600 },
        },
      });

      expect(result.timeline).toBeDefined();
      expect(result.timeline?.settings?.totalScenarioDurationSeconds).toBe(600);
      expect(simulationRepository.create).toHaveBeenCalled();
    });
  });

  describe('should_validate_timeline_time_fields', () => {
    it('should accept valid time fields in timeline', async () => {
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);

      const result = await service.createScenario({
        id: 's2',
        title: 'Time Validation',
        unitId: 'u1',
        timeline: {
          timelineElements: [{ id: 'e1', startTime: 0, endTime: 120 }],
          settings: {
            totalScenarioDurationSeconds: 300,
            enforceStrictTiming: true,
          },
        },
      });

      expect(
        (result.timeline?.timelineElements?.[0] as { startTime: number; endTime: number })
          .startTime,
      ).toBe(0);
      expect(
        (result.timeline?.timelineElements?.[0] as { startTime: number; endTime: number }).endTime,
      ).toBe(120);
    });
  });

  describe('should_validate_assessment_flags', () => {
    it('should validate assessment configuration flags', async () => {
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);

      const result = await service.createScenario({
        id: 's3',
        title: 'Assessment Flags',
        unitId: 'u1',
        timeline: {
          assessmentConfigs: [{ id: 'a1', required: true, autoAssessable: false }],
        },
      });

      expect(result.timeline?.assessmentConfigs).toBeDefined();
      expect((result.timeline?.assessmentConfigs?.[0] as { required: boolean }).required).toBe(
        true,
      );
    });
  });

  describe('should_validate_time_window', () => {
    it('should validate time window constraints', async () => {
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);

      const result = await service.createScenario({
        id: 's4',
        title: 'Time Window',
        unitId: 'u1',
        timeline: {
          timelineElements: [{ id: 'e1', startTime: 60, endTime: 180 }],
          settings: { totalScenarioDurationSeconds: 300 },
        },
      });

      const element = result.timeline?.timelineElements?.[0] as
        { startTime: number; endTime: number } | undefined;
      expect(element?.startTime).toBeLessThan(element?.endTime || 0);
    });
  });

  describe('should_validate_sequence_rules', () => {
    it('should validate sequence rules in timeline', async () => {
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);

      const result = await service.createScenario({
        id: 's5',
        title: 'Sequence Rules',
        unitId: 'u1',
        timeline: {
          sequenceRules: [{ id: 'r1', prerequisite: 'e1', dependent: 'e2' }],
        },
      });

      expect(result.timeline?.sequenceRules).toBeDefined();
      expect(result.timeline?.sequenceRules?.length).toBe(1);
    });
  });

  /* ------------------------------ Integration Tests ------------------------------ */

  describe('should_save_and_load_scenario_with_timeline', () => {
    it('should save and retrieve scenario with timeline', async () => {
      const timelineData = {
        timelineElements: [{ id: 'e1', startTime: 0, endTime: 300 }],
        settings: {
          totalScenarioDurationSeconds: 600,
          allowEarlyCompletion: true,
        },
      };

      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);

      await service.createScenario({
        id: 's6',
        title: 'Integration Test',
        unitId: 'u1',
        timeline: timelineData,
      });

      const loaded = await service.getScenarioById('s6');

      expect(loaded.timeline).toEqual(timelineData);
      expect(loaded.timeline?.settings?.allowEarlyCompletion).toBe(true);
    });
  });

  describe('should_update_scenario_with_timeline_rules', () => {
    it('should apply timeline rules when updating scenario', async () => {
      simulationRepository.__seed({
        id: 's7',
        title: 'Timeline Rules',
        unitId: 'u1',
        timeline: {
          timelineElements: [{ id: 'e1', startTime: 0, endTime: 300 }],
        },
      });
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);

      const result = await service.updateScenario('s7', {
        timeline: {
          timelineElements: [
            { id: 'e1', startTime: 0, endTime: 300 },
            { id: 'e2', startTime: 300, endTime: 600 },
          ],
          sequenceRules: [{ id: 'r1', prerequisite: 'e1', dependent: 'e2' }],
        },
      });

      expect(result?.timeline?.sequenceRules).toBeDefined();
      expect(result?.timeline?.timelineElements?.length).toBe(2);
    });
  });
});
