import { type HttpService } from '@nestjs/axios';
import { ServiceUnavailableException } from '@nestjs/common';
import type { StudentsService } from 'src/students/students.service';

import { ScenarioAssignmentService } from '@/modules/scenarios/scenario-assignment.service';

describe('ScenarioAssignmentService', () => {
  let httpService: jest.Mocked<HttpService>;
  let studentService: jest.Mocked<StudentsService>;
  let service: ScenarioAssignmentService;

  beforeEach(() => {
    httpService = { get: jest.fn() } as unknown as jest.Mocked<HttpService>;
    studentService = {
      getSimulationsByCode: jest.fn(),
    } as unknown as jest.Mocked<StudentsService>;
    service = new ScenarioAssignmentService(httpService, studentService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getAssignedSimulationIds', () => {
    it('normalizes ids from the wrapped `data` payload', async () => {
      studentService.getSimulationsByCode.mockResolvedValue({
        success: true,
        data: {
          simulations: [{ id: 'sim-1' }, { id: 'sim-2' }],
          classSimulations: [{ simulation_id: 'sim-3' }],
        },
      } as never);

      const ids = await service.getAssignedSimulationIds('student-1', 'token-abc');

      expect(ids).toEqual(new Set(['sim-1', 'sim-2', 'sim-3']));
      expect(studentService.getSimulationsByCode).toHaveBeenCalledWith('student-1');
    });

    it('accepts the flat top-level shape (no `data` wrapper)', async () => {
      studentService.getSimulationsByCode.mockResolvedValue({
        simulations: [{ id: 'sim-42' }],
      } as never);

      const ids = await service.getAssignedSimulationIds('student-9', 'tok');

      expect(ids.has('sim-42')).toBe(true);
    });

    it('throws ServiceUnavailableException when the student lookup returns a falsy payload', async () => {
      studentService.getSimulationsByCode.mockResolvedValue(undefined as never);

      await expect(service.getAssignedSimulationIds('s1', 't')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('isScenarioAssigned', () => {
    it('returns true when the scenario id is in the assignment set', async () => {
      studentService.getSimulationsByCode.mockResolvedValue({
        data: { simulations: [{ id: 'sim-1' }] },
      } as never);

      await expect(service.isScenarioAssigned('s1', 'sim-1', 't')).resolves.toBe(true);
    });

    it('returns false when the scenario id is NOT in the assignment set', async () => {
      studentService.getSimulationsByCode.mockResolvedValue({
        data: { simulations: [{ id: 'sim-1' }] },
      } as never);

      await expect(service.isScenarioAssigned('s1', 'sim-999', 't')).resolves.toBe(false);
    });

    it('coerces numeric ids to strings before comparing', async () => {
      studentService.getSimulationsByCode.mockResolvedValue({
        data: { simulations: [{ id: 42 }] },
      } as never);

      await expect(service.isScenarioAssigned('s1', '42', 't')).resolves.toBe(true);
    });
  });
});
