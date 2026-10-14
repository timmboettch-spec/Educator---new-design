import { LmsAssignmentService } from '../../../src/lms/services/lms-assignment.service';

describe('LmsAssignmentService.resolveLaunchSimulation', () => {
  const classSimulationRepo = {
    findActiveByClassIdsAndSimulationIds: jest.fn(),
    find: jest.fn(),
  };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const service = new LmsAssignmentService(
    {} as never,
    classSimulationRepo as never,
    logger as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    classSimulationRepo.find.mockResolvedValue([{ id: 'cs-only', simulation_id: 'sim-only' }]);
  });

  it('uses the custom simulation id when it is assigned to the class', async () => {
    classSimulationRepo.findActiveByClassIdsAndSimulationIds.mockResolvedValue([
      { id: 'cs-1', simulation_id: 'sim-1' },
    ]);

    await expect(service.resolveLaunchSimulation('class-1', 'sim-1')).resolves.toEqual({
      simulationId: 'sim-1',
      classSimulationId: 'cs-1',
    });
    expect(classSimulationRepo.findActiveByClassIdsAndSimulationIds).toHaveBeenCalledWith(
      ['class-1'],
      ['sim-1'],
    );
    expect(classSimulationRepo.find).not.toHaveBeenCalled();
  });

  it('ignores a custom simulation id that is not assigned to the class and falls back to inference', async () => {
    classSimulationRepo.findActiveByClassIdsAndSimulationIds.mockResolvedValue([]);

    await expect(service.resolveLaunchSimulation('class-1', 'sim-other')).resolves.toEqual({
      simulationId: 'sim-only',
      classSimulationId: 'cs-only',
    });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('links no simulation when the custom id is unassigned and inference is ambiguous', async () => {
    classSimulationRepo.findActiveByClassIdsAndSimulationIds.mockResolvedValue([]);
    classSimulationRepo.find.mockResolvedValue([
      { id: 'cs-a', simulation_id: 'sim-a' },
      { id: 'cs-b', simulation_id: 'sim-b' },
    ]);

    await expect(service.resolveLaunchSimulation('class-1', 'sim-other')).resolves.toBeNull();
  });

  it('infers from the class when the launch has no custom simulation id', async () => {
    await expect(service.resolveLaunchSimulation('class-1', null)).resolves.toEqual({
      simulationId: 'sim-only',
      classSimulationId: 'cs-only',
    });
    expect(classSimulationRepo.findActiveByClassIdsAndSimulationIds).not.toHaveBeenCalled();
  });
});
