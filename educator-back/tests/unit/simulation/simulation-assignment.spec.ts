import { ServiceUnavailableException } from '@nestjs/common';
import type { StudentsService } from 'src/students/students.service';

import { SimulationService } from 'src/simulation/simulation.service';

/** Student scenario-assignment lookups (moved here from the former ScenarioAssignmentService). */
describe('SimulationService — scenario assignment', () => {
  let studentService: jest.Mocked<StudentsService>;
  let service: SimulationService;

  beforeEach(() => {
    studentService = {
      getSimulationsByCode: jest.fn(),
    } as unknown as jest.Mocked<StudentsService>;
    service = new SimulationService(
      {} as never, // simulationRepo
      {} as never, // educatorSimRepo
      {} as never, // unitRepository
      {} as never, // simulationV2Repository
      studentService,
    );
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

      const ids = await service.getAssignedSimulationIds('student-1');

      expect(ids).toEqual(new Set(['sim-1', 'sim-2', 'sim-3']));
      expect(studentService.getSimulationsByCode).toHaveBeenCalledWith('student-1');
    });

    it('accepts the flat top-level shape (no `data` wrapper)', async () => {
      studentService.getSimulationsByCode.mockResolvedValue({
        simulations: [{ id: 'sim-42' }],
      } as never);

      const ids = await service.getAssignedSimulationIds('student-9');

      expect(ids.has('sim-42')).toBe(true);
    });

    it('throws ServiceUnavailableException when the student lookup returns a falsy payload', async () => {
      studentService.getSimulationsByCode.mockResolvedValue(undefined as never);

      await expect(service.getAssignedSimulationIds('s1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('isScenarioAssigned', () => {
    it('returns true when the scenario id is in the assignment set', async () => {
      studentService.getSimulationsByCode.mockResolvedValue({
        data: { simulations: [{ id: 'sim-1' }] },
      } as never);

      await expect(service.isScenarioAssigned('s1', 'sim-1')).resolves.toBe(true);
    });

    it('returns false when the scenario id is NOT in the assignment set', async () => {
      studentService.getSimulationsByCode.mockResolvedValue({
        data: { simulations: [{ id: 'sim-1' }] },
      } as never);

      await expect(service.isScenarioAssigned('s1', 'sim-999')).resolves.toBe(false);
    });

    it('coerces numeric ids to strings before comparing', async () => {
      studentService.getSimulationsByCode.mockResolvedValue({
        data: { simulations: [{ id: 42 }] },
      } as never);

      await expect(service.isScenarioAssigned('s1', '42')).resolves.toBe(true);
    });
  });
});
