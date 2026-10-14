import { Test, TestingModule } from '@nestjs/testing';
import { EducatorSimulationsController } from '../../../src/educator-simulations/educator-simulations.controller';
import { EducatorSimulationsService } from '../../../src/educator-simulations/educator-simulations.service';

import { EducatorSimulationsConstants } from '../../../src/educator-simulations/educator-simulations.constants';
import type { JwtRequest } from 'src/common/types';
import type { Response } from 'express';
import { EducatorSimulation } from 'src/database/entities';
import { LoggerService } from 'src/common/services';
import {
  EDUCATOR_SIMULATION_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  UNIT_REPOSITORY,
} from 'src/database/tokens';

const EDUCATOR_ID = '11111111-1111-1111-1111-111111111111';
const SCENARIO_ID = 'sim-001';

const makeReq = (userId: string | null): JwtRequest =>
  ({
    user: userId ? { userId, educatorId: userId, roles: ['Educator'] } : undefined,
  }) as unknown as JwtRequest;

const mockRow: EducatorSimulation = {
  id: '22222222-2222-2222-2222-222222222222',
  educator_id: EDUCATOR_ID,
  unit_id: 'unit-1',
  scenario_id: SCENARIO_ID,
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
};

const scenario = {
  id: SCENARIO_ID,
  unitId: 'unit-1',
  title: 'Stroke Evaluation',
};

describe('EducatorSimulations (Controller + Service)', () => {
  let controller: EducatorSimulationsController;
  let service: EducatorSimulationsService;

  const repo = {
    findOne: jest.fn(),
    create: jest.fn(),
    saveMany: jest.fn(),
    find: jest.fn(),
  };

  // Units are read via UnitRepository (src/database/repositories/unit.repository.ts),
  // not a blob store.
  const unitRepository = {
    find: jest.fn().mockResolvedValue([]),
  };

  const simulationV2Repository = {
    find: jest.fn().mockResolvedValue([]),
    findByBusinessId: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EducatorSimulationsController],
      providers: [
        EducatorSimulationsService,
        { provide: EDUCATOR_SIMULATION_REPOSITORY, useValue: repo },
        { provide: UNIT_REPOSITORY, useValue: unitRepository },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationV2Repository },
        {
          provide: LoggerService,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            verbose: jest.fn(),
            fatal: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(EducatorSimulationsController);
    service = module.get(EducatorSimulationsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('addToLibrary', () => {
    it('UNIT: adds new simulation to library', async () => {
      simulationV2Repository.findByBusinessId.mockResolvedValue(scenario as never);
      repo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      repo.create.mockResolvedValue(mockRow);

      const result = await service.addToLibrary(SCENARIO_ID, EDUCATOR_ID);
      expect(result.success).toBe(true);
      expect(result.message).toBe(EducatorSimulationsConstants.MESSAGES.ADDED);
    });

    it('UNIT: returns not found when scenario does not exist', async () => {
      simulationV2Repository.findByBusinessId.mockResolvedValue(null);

      const result = await service.addToLibrary('missing', EDUCATOR_ID);
      expect(result.success).toBe(false);
      expect(result.message).toBe(EducatorSimulationsConstants.MESSAGES.NOT_FOUND);
    });

    it('UNIT: returns already in library for active record', async () => {
      simulationV2Repository.findByBusinessId.mockResolvedValue(scenario as never);
      repo.findOne.mockResolvedValueOnce(mockRow);

      const result = await service.addToLibrary(SCENARIO_ID, EDUCATOR_ID);
      expect(result.success).toBe(false);
      expect(result.message).toBe(EducatorSimulationsConstants.MESSAGES.ALREADY_IN_LIBRARY);
    });

    it('REGRESSION: restores soft-deleted record instead of creating a new row', async () => {
      const deletedRow = { ...mockRow, deleted_at: new Date('2024-01-01') };
      simulationV2Repository.findByBusinessId.mockResolvedValue(scenario as never);
      repo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(deletedRow);
      repo.create.mockResolvedValue({ ...deletedRow, deleted_at: null });

      const result = await service.addToLibrary(SCENARIO_ID, EDUCATOR_ID);
      expect(result.success).toBe(true);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ id: deletedRow.id, deleted_at: null }),
      );
    });

    it('INTEGRATION: POST /educator-simulations/add-to-library returns SUCCESS', async () => {
      jest.spyOn(service, 'addToLibrary').mockResolvedValue({
        success: true,
        message: EducatorSimulationsConstants.MESSAGES.ADDED,
        data: mockRow,
      });

      const result = await controller.addToLibrary(
        { scenario_id: SCENARIO_ID },
        makeReq(EDUCATOR_ID),
      );
      expect(result.status).toBe('SUCCESS');
    });

    it('INTEGRATION: throws when user not authenticated', async () => {
      await expect(
        controller.addToLibrary({ scenario_id: SCENARIO_ID }, makeReq(null)),
      ).rejects.toThrow();
    });

    it('INTEGRATION: throws when scenario id missing', async () => {
      await expect(controller.addToLibrary({}, makeReq(EDUCATOR_ID))).rejects.toThrow();
    });
  });

  describe('removeFromLibrary', () => {
    it('UNIT: soft-deletes active row', async () => {
      repo.findOne.mockResolvedValue(mockRow);
      repo.create.mockResolvedValue({ ...mockRow, deleted_at: new Date() });

      const result = await service.removeFromLibrary(SCENARIO_ID, EDUCATOR_ID);
      expect(result.success).toBe(true);
      expect(result.message).toBe(EducatorSimulationsConstants.MESSAGES.REMOVED);
    });

    it('UNIT: returns not found when active row does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.removeFromLibrary(SCENARIO_ID, EDUCATOR_ID);
      expect(result.success).toBe(false);
      expect(result.message).toBe(EducatorSimulationsConstants.MESSAGES.NOT_FOUND);
    });

    it('INTEGRATION: DELETE /educator-simulations/remove-from-library/:scenario_id returns SUCCESS', async () => {
      jest.spyOn(service, 'removeFromLibrary').mockResolvedValue({
        success: true,
        message: EducatorSimulationsConstants.MESSAGES.REMOVED,
        data: null,
      });

      const result = await controller.removeFromLibrary(SCENARIO_ID, makeReq(EDUCATOR_ID));
      expect(result.status).toBe('SUCCESS');
    });
  });

  describe('getMyLibrary', () => {
    it('UNIT: returns merged unit + scenario payload', async () => {
      repo.find.mockResolvedValue([mockRow]);
      unitRepository.find.mockResolvedValue([{ id: 'unit-1', name: 'Emergency' }]);
      simulationV2Repository.find.mockResolvedValue([scenario] as never);

      const result = await service.getMyLibrary(EDUCATOR_ID);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect((result.data?.[0] as { scenario_id: string }).scenario_id).toBe(SCENARIO_ID);
    });

    it('INTEGRATION: GET /educator-simulations/my-library returns SUCCESS', async () => {
      jest.spyOn(service, 'getMyLibrary').mockResolvedValue({
        success: true,
        message: EducatorSimulationsConstants.MESSAGES.MY_LIBRARY_FETCHED,
        data: [],
      });

      const jsonMock = jest.fn();
      const mockRes = { setHeader: jest.fn(), json: jsonMock } as unknown as Response;
      await controller.getMyLibrary(makeReq(EDUCATOR_ID), mockRes);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUCCESS' }));
    });

    it('INTEGRATION: throws when user not authenticated', async () => {
      const mockRes = { setHeader: jest.fn(), json: jest.fn() } as unknown as Response;
      await expect(controller.getMyLibrary(makeReq(null), mockRes)).rejects.toThrow();
    });
  });

  describe('getInLibraryIds', () => {
    it('REGRESSION: returns set of active scenario IDs', async () => {
      repo.find.mockResolvedValue([{ scenario_id: 'sim-1' }, { scenario_id: 'sim-2' }]);
      const ids = await service.getInLibraryIds(EDUCATOR_ID);
      expect(ids.has('sim-1')).toBe(true);
      expect(ids.has('sim-2')).toBe(true);
      expect(ids.size).toBe(2);
    });
  });

  describe('getInLibraryIds — single scenario check', () => {
    it('UNIT: returns Set containing the scenario when active row exists', async () => {
      repo.find.mockResolvedValue([{ scenario_id: SCENARIO_ID }]);

      const ids = await service.getInLibraryIds(EDUCATOR_ID);
      expect(ids.has(SCENARIO_ID)).toBe(true);
    });

    it('UNIT: returns empty Set when no active rows exist', async () => {
      repo.find.mockResolvedValue([]);

      const ids = await service.getInLibraryIds(EDUCATOR_ID);
      expect(ids.has(SCENARIO_ID)).toBe(false);
      expect(ids.size).toBe(0);
    });

    it('UNIT: Set does not contain unrelated scenario ids', async () => {
      repo.find.mockResolvedValue([{ scenario_id: 'other-sim' }]);

      const ids = await service.getInLibraryIds(EDUCATOR_ID);
      expect(ids.has(SCENARIO_ID)).toBe(false);
      expect(ids.has('other-sim')).toBe(true);
    });

    it('UNIT: returns Set with all library scenario ids for educator', async () => {
      repo.find.mockResolvedValue([{ scenario_id: SCENARIO_ID }, { scenario_id: 'sim-002' }]);

      const ids = await service.getInLibraryIds(EDUCATOR_ID);
      expect(ids.size).toBe(2);
      expect(ids.has(SCENARIO_ID)).toBe(true);
      expect(ids.has('sim-002')).toBe(true);
    });
  });
});
