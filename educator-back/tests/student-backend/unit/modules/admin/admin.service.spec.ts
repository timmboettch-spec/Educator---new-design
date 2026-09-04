import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AdminService } from '@/modules/admin/admin.service';
import { JsonDataService } from '@/data/json-data.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('AdminService', () => {
  let service: AdminService;

  const mockGetScenarioById = jest.fn();
  const mockGetReportById = jest.fn();
  const mockJsonDataService = {
    getUsers: jest.fn(),
    getPermissionsData: jest.fn(),
    getTranscripts: jest.fn(),
    getScenarios: jest.fn(),
    getScenarioById: mockGetScenarioById,
    getScenarioByIdFresh: mockGetScenarioById,
    getScenarioByIdEnOnly: mockGetScenarioById,
    addScenario: jest.fn(),
    updateScenario: jest.fn(),
    deleteScenario: jest.fn(),
    getUnits: jest.fn(),
    getUnitById: jest.fn(),
    addUnit: jest.fn(),
    updateUnit: jest.fn(),
    deleteUnit: jest.fn(),
    getScenariosByUnitId: jest.fn(),
    updatePermissions: jest.fn(),
    getReports: jest.fn(),
    getReportsFresh: jest.fn().mockResolvedValue([]),
    getReportById: mockGetReportById,
    getReportByIdFresh: mockGetReportById,
    deleteReport: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: JsonDataService,
          useValue: mockJsonDataService,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);

    jest.clearAllMocks();
  });

  /* ------------------------------ Students ------------------------------ */

  describe('getAllStudentsWithStats', () => {
    it('should merge permissions, users, transcripts and scenarios correctly', async () => {
      mockJsonDataService.getUsers.mockReturnValue([
        { id: 'u1', name: 'John Doe', email: 'john@test.com', role: 'student' },
      ]);
      mockJsonDataService.getPermissionsData.mockReturnValue({
        permissions: [
          {
            key: 'john',
            name: 'John Doe',
            units: ['unit1'],
            scenarios: [],
            avatars: [],
          },
        ],
      });
      mockJsonDataService.getTranscripts.mockReturnValue([
        { userId: 'u1', scenarioId: 's1' },
        { userId: 'u1', scenarioId: 's2' },
      ]);
      mockJsonDataService.getScenarios.mockReturnValue([
        { id: 's1', unitId: 'unit1' },
        { id: 's2', unitId: 'unit1' },
      ]);

      const result = service.getAllStudentsWithStats();

      expect(result.length).toBe(1);
      expect(result[0].scenariosEnrolledCount).toBe(2);
      expect(result[0].unitsCount).toBe(1);
    });
  });

  describe('getAllPermissions', () => {
    it('should return permissions data', async () => {
      mockJsonDataService.getPermissionsData.mockReturnValue({
        permissions: [],
      });

      const result = service.getAllPermissions();

      expect(result).toEqual({ permissions: [] });
    });
  });

  describe('createOrUpdatePermission', () => {
    it('should update existing permission', async () => {
      mockJsonDataService.getPermissionsData.mockReturnValue({
        permissions: [{ key: 'k1', units: ['u1'], scenarios: [], avatars: [] }],
      });
      mockJsonDataService.getUnits.mockReturnValue([{ id: 'u1' }]);

      const result = service.createOrUpdatePermission({
        key: 'k1',
        units: ['u1'],
      });

      expect(result.key).toBe('k1');
      expect(mockJsonDataService.updatePermissions).toHaveBeenCalled();
    });

    it('should create new permission if not exists', async () => {
      mockJsonDataService.getPermissionsData.mockReturnValue({
        permissions: [],
      });
      mockJsonDataService.getUnits.mockReturnValue([{ id: 'u1' }]);

      const result = service.createOrUpdatePermission({
        key: 'k2',
        units: ['u1'],
      });

      expect(result.key).toBe('k2');
      expect(mockJsonDataService.updatePermissions).toHaveBeenCalled();
    });
  });

  describe('assignUnitToPermission', () => {
    it('should throw when key is empty', async () => {
      await expect(async () => service.assignUnitToPermission('', 'u1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw when unit not found', async () => {
      mockJsonDataService.getUnitById.mockReturnValue(null);

      await expect(async () => service.assignUnitToPermission('k1', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should create permission and assign unit', async () => {
      mockJsonDataService.getUnitById.mockReturnValue({ id: 'u1' });
      mockJsonDataService.getPermissionsData.mockReturnValue({
        permissions: [],
      });

      const result = service.assignUnitToPermission('k1', 'u1', 'Name');

      expect(result.units).toContain('u1');
      expect(mockJsonDataService.updatePermissions).toHaveBeenCalled();
    });
  });

  describe('createStudent', () => {
    it('should throw if key already exists', async () => {
      mockJsonDataService.getPermissionsData.mockReturnValue({
        permissions: [{ key: 'k1', units: [], scenarios: [], avatars: [] }],
      });

      await expect(async () =>
        service.createStudent({ key: 'k1', name: 'Test', email: 't@test.com' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create new student', async () => {
      mockJsonDataService.getPermissionsData.mockReturnValue({
        permissions: [],
      });
      mockJsonDataService.getUnits.mockReturnValue([{ id: 'u1' }]);

      const result = service.createStudent({
        key: 'k2',
        name: 'New',
        email: 'n@test.com',
        units: ['u1'],
      });

      expect(result.key).toBe('k2');
      expect(mockJsonDataService.updatePermissions).toHaveBeenCalled();
    });
  });

  /* ------------------------------ Scenarios ------------------------------ */

  describe('getAllScenarios', () => {
    it('should return all scenarios', async () => {
      mockJsonDataService.getScenarios.mockReturnValue([{ id: 's1' }]);

      const result = service.getAllScenarios();

      expect(result.length).toBe(1);
    });
  });

  describe('getScenarioById', () => {
    it('should throw when not found', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue(null);

      await expect(async () => service.getScenarioById('s1')).rejects.toThrow(NotFoundException);
    });

    it('should return scenario when found', async () => {
      mockJsonDataService.getScenarioById.mockResolvedValue({ id: 's1' });

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
      mockJsonDataService.getScenarioById.mockReturnValue(null);
      mockJsonDataService.getScenarios.mockReturnValue([]);
      mockJsonDataService.getUnitById.mockReturnValue({ id: 'u1' });

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
      mockJsonDataService.getScenarioById.mockReturnValue(null);
      mockJsonDataService.getScenarios.mockReturnValue([]);
      mockJsonDataService.getUnitById.mockReturnValue({ id: 'u1' });

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
      mockJsonDataService.getScenarioById.mockReturnValue({ id: 's1' });

      await expect(async () => service.createScenario({ id: 's1', title: 'Test' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should create scenario when valid', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue(null);
      mockJsonDataService.getScenarios.mockReturnValue([]);
      mockJsonDataService.getUnitById.mockReturnValue({ id: 'u1' });

      const result = await service.createScenario({
        id: 's1',
        title: 'Scenario',
        unitId: 'u1',
      });

      expect(result.id).toBe('s1');
      expect(mockJsonDataService.addScenario).toHaveBeenCalled();
    });

    it('should create scenario with action categories', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue(null);
      mockJsonDataService.getScenarios.mockReturnValue([]);
      mockJsonDataService.getUnitById.mockReturnValue({ id: 'u1' });
      const categories = [{ id: 'cat1', name: 'Test Cat', scenarioId: 's1' }];

      const result = await service.createScenario({
        id: 's1',
        title: 'Test',
        unitId: 'u1',
        actionCategories: categories,
      });

      expect(result.actionCategories).toEqual(categories);
      expect(mockJsonDataService.addScenario).toHaveBeenCalled();
    });

    it('should trim and collapse whitespace in product name on create', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue(null);
      mockJsonDataService.getScenarios.mockReturnValue([]);
      mockJsonDataService.getUnitById.mockReturnValue({ id: 'u1' });

      await service.createScenario({
        id: 's1',
        title: 'Scenario',
        unitId: 'u1',
        requiresProductSetup: true,
        productSetup: { title: '  AED   Trainer   Pro  ' },
      });

      expect(mockJsonDataService.addScenario).toHaveBeenCalledWith(
        expect.objectContaining({
          productSetup: expect.objectContaining({ title: 'AED Trainer Pro' }),
        }),
      );
    });

    it('should leave already-clean product name unchanged on create', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue(null);
      mockJsonDataService.getScenarios.mockReturnValue([]);
      mockJsonDataService.getUnitById.mockReturnValue({ id: 'u1' });

      await service.createScenario({
        id: 's1',
        title: 'Scenario',
        unitId: 'u1',
        requiresProductSetup: true,
        productSetup: { title: 'AED Trainer' },
      });

      expect(mockJsonDataService.addScenario).toHaveBeenCalledWith(
        expect.objectContaining({
          productSetup: expect.objectContaining({ title: 'AED Trainer' }),
        }),
      );
    });
  });

  describe('updateScenario', () => {
    it('should throw when scenario not found', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue(null);

      await expect(async () => service.updateScenario('s1', {})).rejects.toThrow(NotFoundException);
    });

    it('should reject updates that null out required fields (title)', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue({
        id: 's1',
        unitId: 'u1',
        title: 'Old',
      });
      mockJsonDataService.getScenarios.mockReturnValue([{ id: 's1', title: 'Old', unitId: 'u1' }]);

      await expect(
        service.updateScenario('s1', { title: null as unknown as string }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when enabling product setup without a product name', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue({
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
      mockJsonDataService.getScenarioById.mockReturnValue({
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
      const existingScenario = {
        id: 's1',
        unitId: 'u1',
        title: 'Old',
        requiresProductSetup: true,
        productSetup: { title: 'a'.repeat(140) },
      };
      mockJsonDataService.getScenarioById
        .mockReturnValueOnce(existingScenario)
        .mockReturnValueOnce(existingScenario);
      mockJsonDataService.updateScenario.mockImplementation(() => {});

      await expect(service.updateScenario('s1', { title: 'Updated Title' })).resolves.toBeDefined();
    });

    it('should update scenario title', async () => {
      const existingScenario = {
        id: 's1',
        title: 'Old',
        unitId: 'u1',
      };

      // scenario exists (first call)
      mockJsonDataService.getScenarioById
        .mockReturnValueOnce(existingScenario)
        // scenario after update (second call)
        .mockReturnValueOnce({ ...existingScenario, title: 'New' });

      // needed for duplicate title check
      mockJsonDataService.getScenarios.mockReturnValue([existingScenario]);

      mockJsonDataService.updateScenario.mockImplementation(() => {});

      const result = await service.updateScenario('s1', { title: 'New' });

      expect(result).toBeDefined();
      expect(result!.title).toBe('New');
      expect(mockJsonDataService.getUnitById).toHaveBeenCalledWith('u1');
      expect(mockJsonDataService.updateScenario).toHaveBeenCalledWith('s1', {
        title: 'New',
      });
    });

    it('should trim and collapse whitespace in product name on update', async () => {
      const existingScenario = {
        id: 's1',
        unitId: 'u1',
        title: 'Old',
        requiresProductSetup: true,
        productSetup: { title: 'AED Trainer' },
      };
      mockJsonDataService.getScenarioById
        .mockReturnValueOnce(existingScenario)
        .mockReturnValueOnce({
          ...existingScenario,
          productSetup: { title: 'AED Trainer Pro' },
        });
      mockJsonDataService.getScenarios.mockReturnValue([existingScenario]);
      mockJsonDataService.updateScenario.mockImplementation(() => {});

      await service.updateScenario('s1', {
        productSetup: { title: '  AED   Trainer   Pro  ' },
      });

      expect(mockJsonDataService.updateScenario).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({
          productSetup: expect.objectContaining({ title: 'AED Trainer Pro' }),
        }),
      );
    });

    it('should leave already-clean product name unchanged on update', async () => {
      const existingScenario = {
        id: 's1',
        unitId: 'u1',
        title: 'Old',
        requiresProductSetup: true,
        productSetup: { title: 'AED Trainer' },
      };
      mockJsonDataService.getScenarioById
        .mockReturnValueOnce(existingScenario)
        .mockReturnValueOnce(existingScenario);
      mockJsonDataService.getScenarios.mockReturnValue([existingScenario]);
      mockJsonDataService.updateScenario.mockImplementation(() => {});

      await service.updateScenario('s1', {
        productSetup: { title: 'AED Trainer' },
      });

      expect(mockJsonDataService.updateScenario).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({
          productSetup: expect.objectContaining({ title: 'AED Trainer' }),
        }),
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
      mockJsonDataService.getScenarioById.mockReturnValue(null);

      await expect(async () => service.deleteScenario('s1')).rejects.toThrow(NotFoundException);
    });

    it('should delete when found', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue({ id: 's1' });

      const result = await service.deleteScenario('s1');

      expect(result.message).toContain('deleted successfully');
      expect(mockJsonDataService.deleteScenario).toHaveBeenCalledWith('s1');
    });
  });

  /* ------------------------------ Units ------------------------------ */

  describe('getAllUnits', () => {
    it('should return units with scenarioCount', async () => {
      mockJsonDataService.getUnits.mockReturnValue([{ id: 'u1', order: 1 }]);
      mockJsonDataService.getScenariosByUnitId.mockReturnValue([{ id: 's1' }]);

      const result = service.getAllUnits();

      expect(result[0].scenarioCount).toBe(1);
    });
  });

  describe('getUnitById', () => {
    it('should throw when not found', async () => {
      mockJsonDataService.getUnitById.mockReturnValue(null);

      await expect(async () => service.getUnitById('u1')).rejects.toThrow(NotFoundException);
    });

    it('should return unit with scenarioCount', async () => {
      mockJsonDataService.getUnitById.mockReturnValue({ id: 'u1' });
      mockJsonDataService.getScenariosByUnitId.mockReturnValue([{ id: 's1' }]);

      const result = service.getUnitById('u1');

      expect(result.scenarioCount).toBe(1);
    });
  });

  describe('createUnit', () => {
    it('should throw when id missing', async () => {
      await expect(async () => service.createUnit({})).rejects.toThrow(BadRequestException);
    });

    it('should throw when duplicate id exists', async () => {
      mockJsonDataService.getUnitById.mockReturnValue({ id: 'u1' });

      await expect(async () => service.createUnit({ id: 'u1' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should create unit when valid', async () => {
      mockJsonDataService.getUnitById.mockReturnValue(null);
      mockJsonDataService.getUnits.mockReturnValue([]);

      const result = service.createUnit({ id: 'u1', name: 'Unit 1' });

      expect(result.id).toBe('u1');
      expect(mockJsonDataService.addUnit).toHaveBeenCalled();
    });
  });

  describe('updateUnit', () => {
    it('should throw when unit not found', async () => {
      mockJsonDataService.getUnitById.mockReturnValue(null);

      await expect(async () => service.updateUnit('u1', {})).rejects.toThrow(NotFoundException);
    });

    it('should update unit when found', async () => {
      mockJsonDataService.getUnitById.mockReturnValue({ id: 'u1' });

      service.updateUnit('u1', { name: 'New' });

      expect(mockJsonDataService.updateUnit).toHaveBeenCalled();
    });
  });

  describe('deleteUnit', () => {
    it('should throw when not found', async () => {
      mockJsonDataService.getUnitById.mockReturnValue(null);

      await expect(async () => service.deleteUnit('u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw when unit has scenarios', async () => {
      mockJsonDataService.getUnitById.mockReturnValue({ id: 'u1' });
      mockJsonDataService.getScenariosByUnitId.mockReturnValue([{ id: 's1' }]);

      await expect(async () => service.deleteUnit('u1')).rejects.toThrow(BadRequestException);
    });

    it('should delete unit when no scenarios', async () => {
      mockJsonDataService.getUnitById.mockReturnValue({ id: 'u1' });
      mockJsonDataService.getScenariosByUnitId.mockReturnValue([]);

      const result = service.deleteUnit('u1');

      expect(result.message).toContain('deleted successfully');
      expect(mockJsonDataService.deleteUnit).toHaveBeenCalledWith('u1');
    });
  });

  /* ------------------------------ Reports ------------------------------ */

  describe('getReportById', () => {
    it('should throw when report not found', async () => {
      mockJsonDataService.getReports.mockReturnValue([]);

      await expect(async () => service.getReportById('r1')).rejects.toThrow(NotFoundException);
    });

    it('should return report when found', async () => {
      mockJsonDataService.getReports.mockReturnValue([{ id: 'r1' }]);
      mockGetReportById.mockResolvedValue({ id: 'r1' });

      const result = await service.getReportById('r1');

      expect(result.id).toBe('r1');
    });
  });

  /* ------------------------------ Timeline Tests ------------------------------ */

  describe('should_create_scenario_with_valid_timeline', () => {
    it('should create scenario with timeline configuration', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue(null);
      mockJsonDataService.getScenarios.mockReturnValue([]);

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
      expect(mockJsonDataService.addScenario).toHaveBeenCalled();
    });
  });

  describe('should_validate_timeline_time_fields', () => {
    it('should accept valid time fields in timeline', async () => {
      mockJsonDataService.getScenarioById.mockReturnValue(null);
      mockJsonDataService.getScenarios.mockReturnValue([]);
      mockJsonDataService.getUnitById.mockReturnValue({ id: 'u1' });

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
      mockJsonDataService.getScenarioById.mockReturnValue(null);
      mockJsonDataService.getScenarios.mockReturnValue([]);
      mockJsonDataService.getUnitById.mockReturnValue({ id: 'u1' });

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
      mockJsonDataService.getScenarioById.mockReturnValue(null);
      mockJsonDataService.getScenarios.mockReturnValue([]);
      mockJsonDataService.getUnitById.mockReturnValue({ id: 'u1' });

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
      mockJsonDataService.getScenarioById.mockReturnValue(null);
      mockJsonDataService.getScenarios.mockReturnValue([]);
      mockJsonDataService.getUnitById.mockReturnValue({ id: 'u1' });

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

      mockJsonDataService.getScenarioById.mockReturnValueOnce(null).mockResolvedValueOnce({
        id: 's6',
        title: 'Integration Test',
        unitId: 'u1',
        timeline: timelineData,
      });
      mockJsonDataService.getScenarios.mockReturnValue([]);
      mockJsonDataService.getUnitById.mockReturnValue({ id: 'u1' });

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
      const existingScenario = {
        id: 's7',
        title: 'Timeline Rules',
        unitId: 'u1',
        timeline: {
          timelineElements: [{ id: 'e1', startTime: 0, endTime: 300 }],
        },
      };

      mockJsonDataService.getScenarioById
        .mockReturnValueOnce(existingScenario)
        .mockReturnValueOnce({
          ...existingScenario,
          timeline: {
            timelineElements: [
              { id: 'e1', startTime: 0, endTime: 300 },
              { id: 'e2', startTime: 300, endTime: 600 },
            ],
            sequenceRules: [{ id: 'r1', prerequisite: 'e1', dependent: 'e2' }],
          },
        });
      mockJsonDataService.getScenarios.mockReturnValue([existingScenario]);

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
