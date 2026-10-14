import { Test } from '@nestjs/testing';
import { ScenariosService } from 'src/student-backend/modules/scenarios/scenarios.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AutomationAccessService } from 'src/common/services/automation-access.service';
import {
  LMS_ASSIGNMENT_MAPPING_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  TRANSCRIPT_REPOSITORY,
  UNIT_REPOSITORY,
} from 'src/database/tokens';
import { SimulationService } from 'src/simulation/simulation.service';
import { RoleSlug, UserTokenType } from 'src/common/constants';
import type { ICurrentUser } from 'src/common/interfaces';
import { LoggerService } from 'src/common/services';
import { VoiceProfilesService } from 'src/voice-profiles/voice-profiles.service';
import {
  createMockUnitRepository,
  createMockSimulationRepository,
} from '../../common/utils/mock-factory';

describe('ScenariosService', () => {
  let service: ScenariosService;
  let unitRepository: ReturnType<typeof createMockUnitRepository>;
  let simulationV2Repository: ReturnType<typeof createMockSimulationRepository>;
  let transcriptRepository: { findByUserId: jest.Mock };
  let assignmentService: { getAssignedSimulationIds: jest.Mock };
  let assignmentMappingRepository: { findOne: jest.Mock };

  beforeEach(async () => {
    unitRepository = createMockUnitRepository();
    simulationV2Repository = createMockSimulationRepository();
    transcriptRepository = { findByUserId: jest.fn().mockResolvedValue([]) };
    assignmentService = {
      getAssignedSimulationIds: jest.fn().mockResolvedValue(new Set<string>()),
    };
    assignmentMappingRepository = { findOne: jest.fn().mockResolvedValue(null) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ScenariosService,
        {
          provide: VoiceProfilesService,
          useValue: { resolveForScenario: jest.fn().mockResolvedValue(null) },
        },
        { provide: UNIT_REPOSITORY, useValue: unitRepository },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationV2Repository },
        { provide: TRANSCRIPT_REPOSITORY, useValue: transcriptRepository },
        { provide: SimulationService, useValue: assignmentService },
        { provide: LMS_ASSIGNMENT_MAPPING_REPOSITORY, useValue: assignmentMappingRepository },
        { provide: LoggerService, useValue: { warn: jest.fn(), log: jest.fn(), error: jest.fn() } },
        {
          provide: AutomationAccessService,
          useValue: {
            filterRecords: jest.fn((records) => records),
            canAccessRecord: jest.fn(() => true),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(ScenariosService);
  });

  describe('findAll', () => {
    it('should return scenarios with unit mapped', async () => {
      simulationV2Repository.findAllWithChildrenJoined.mockResolvedValue([
        { id: 's1', unitId: 'u1' },
      ] as never);
      unitRepository.find.mockResolvedValue([{ id: 'u1' }] as never);

      const result = await service.findAll();

      expect(result[0].unit).toEqual({ id: 'u1', imageUrl: '' });
    });
  });

  const educator: ICurrentUser = {
    userId: 'user1',
    roles: [RoleSlug.EDUCATOR],
    type: UserTokenType.EDUCATOR,
  };
  const anyUser = educator;
  const student = (overrides: Partial<ICurrentUser> = {}): ICurrentUser => ({
    userId: 'REP-PH9N',
    student_id: 'REP-PH9N',
    roles: [RoleSlug.STUDENT],
    type: UserTokenType.STUDENT,
    ...overrides,
  });

  describe('findOne', () => {
    it('should return scenario with unit', async () => {
      simulationV2Repository.findByBusinessIdWithChildrenJoined.mockResolvedValue({
        id: 's1',
        unitId: 'u1',
      } as never);
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);

      const result = await service.findOne(anyUser, 's1');

      expect(result.unit).toEqual({ id: 'u1', imageUrl: '' });
    });

    it('should throw when scenario not found', async () => {
      simulationV2Repository.findByBusinessIdWithChildrenJoined.mockResolvedValue(null);

      await expect(service.findOne(anyUser, 'missing')).rejects.toThrow(NotFoundException);
    });

    it('should add completed and progress when user transcript exists', async () => {
      simulationV2Repository.findByBusinessIdWithChildrenJoined.mockResolvedValue({
        id: 's1',
        unitId: 'u1',
      } as never);
      unitRepository.findByBusinessId.mockResolvedValue({ id: 'u1' } as never);
      transcriptRepository.findByUserId.mockResolvedValue([
        { scenarioId: 's1', userId: 'user1', endedAt: '2024-01-01' },
      ]);

      const result = await service.findOne(educator, 's1');

      expect(result.completed).toBe(true);
      expect(result.progress).toBe(100);
    });

    it('returns 403 to a student when the loaded scenario is not assigned', async () => {
      simulationV2Repository.findByBusinessIdWithChildrenJoined.mockResolvedValue({
        id: 's1',
      } as never);

      await expect(service.findOne(student(), 's1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns the scenario to a student when it is assigned', async () => {
      simulationV2Repository.findByBusinessIdWithChildrenJoined.mockResolvedValue({
        id: 's1',
      } as never);
      assignmentService.getAssignedSimulationIds.mockResolvedValue(new Set(['s1']));
      transcriptRepository.findByUserId.mockResolvedValue([]);

      await expect(service.findOne(student(), 's1')).resolves.toMatchObject({ id: 's1' });
    });
  });

  describe('assertScenarioAssigned', () => {
    it('allows a non-student without looking up assignments', async () => {
      await expect(service.assertScenarioAssigned(educator, 's1')).resolves.toBeUndefined();
      expect(assignmentService.getAssignedSimulationIds).not.toHaveBeenCalled();
    });

    it('allows a student whose scenario is in the assigned set', async () => {
      assignmentService.getAssignedSimulationIds.mockResolvedValue(new Set(['s1', 's2']));

      await expect(service.assertScenarioAssigned(student(), 's1')).resolves.toBeUndefined();
      expect(assignmentService.getAssignedSimulationIds).toHaveBeenCalledWith('REP-PH9N');
    });

    it('returns 403 for a student whose scenario is not assigned', async () => {
      assignmentService.getAssignedSimulationIds.mockResolvedValue(new Set(['s2']));

      await expect(service.assertScenarioAssigned(student(), 's1')).rejects.toThrow(
        new ForbiddenException('Scenario not assigned to this student'),
      );
    });

    it('returns 403 for a student token with no student code', async () => {
      await expect(
        service.assertScenarioAssigned(student({ userId: '', student_id: null }), 's1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    describe('LTI simulationId lock', () => {
      const locked = student({ ltiLaunch: { simulationId: 's1' } });

      it('allows the locked scenario without consulting assignments', async () => {
        await expect(service.assertScenarioAssigned(locked, 's1')).resolves.toBeUndefined();
        expect(assignmentService.getAssignedSimulationIds).not.toHaveBeenCalled();
      });

      it('returns 403 for any other scenario, even an assigned one', async () => {
        assignmentService.getAssignedSimulationIds.mockResolvedValue(new Set(['s2']));

        await expect(service.assertScenarioAssigned(locked, 's2')).rejects.toThrow(
          new ForbiddenException('You can only launch the simulation linked to your LMS activity'),
        );
      });
    });

    describe('LTI resourceLinkId mapping', () => {
      const launched = student({ ltiLaunch: { resourceLinkId: 'rl-1', classId: 'c-1' } });

      it('allows the mapped scenario', async () => {
        assignmentMappingRepository.findOne.mockResolvedValue({ simulationId: 's1' });

        await expect(service.assertScenarioAssigned(launched, 's1')).resolves.toBeUndefined();
        expect(assignmentMappingRepository.findOne).toHaveBeenCalledWith({
          where: { classId: 'c-1', lmsResourceLinkId: 'rl-1' },
        });
        expect(assignmentService.getAssignedSimulationIds).not.toHaveBeenCalled();
      });

      it('returns 403 for a scenario other than the mapped one', async () => {
        assignmentMappingRepository.findOne.mockResolvedValue({ simulationId: 's1' });
        assignmentService.getAssignedSimulationIds.mockResolvedValue(new Set(['s2']));

        await expect(service.assertScenarioAssigned(launched, 's2')).rejects.toThrow(
          new ForbiddenException('You can only launch the simulation linked to your LMS activity'),
        );
      });

      it('falls back to the assigned set when no mapping exists', async () => {
        assignmentService.getAssignedSimulationIds.mockResolvedValue(new Set(['s2']));

        await expect(service.assertScenarioAssigned(launched, 's2')).resolves.toBeUndefined();
        await expect(service.assertScenarioAssigned(launched, 's3')).rejects.toBeInstanceOf(
          ForbiddenException,
        );
      });
    });
  });
});
