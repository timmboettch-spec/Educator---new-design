import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EducatorSimulationsController } from '../../../src/educator-simulations/educator-simulations.controller';
import { EducatorSimulationsService } from '../../../src/educator-simulations/educator-simulations.service';
import { EducatorSimulation } from '../../../src/educator-simulations/entity/educator-simulation.entity';
import { TutorPatientService } from 'src/common/utils/tutor-patient.service';
import { EducatorSimulationsConstants } from '../../../src/educator-simulations/educator-simulations.constants';
import type { JwtRequest } from 'src/common/types';
import type { Response } from 'express';

const EDUCATOR_ID = '11111111-1111-1111-1111-111111111111';
const SCENARIO_ID = 'sim-001';

const makeReq = (userId: string | null): JwtRequest =>
  ({ user: userId ? { userId, roles: ['Educator'] } : undefined } as unknown as JwtRequest);

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
    save: jest.fn(),
    find: jest.fn(),
  };

  const tutorPatientService = {
    clearCache: jest.fn(),
    getScenarios: jest.fn(),
    getFreshScenarios: jest.fn(),
    getUnits: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EducatorSimulationsController],
      providers: [
        EducatorSimulationsService,
        { provide: getRepositoryToken(EducatorSimulation), useValue: repo },
        { provide: TutorPatientService, useValue: tutorPatientService },
      ],
    }).compile();

    controller = module.get(EducatorSimulationsController);
    service = module.get(EducatorSimulationsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('addToLibrary', () => {
    it('UNIT: adds new simulation to library', async () => {
      tutorPatientService.getScenarios.mockResolvedValue([scenario]);
      repo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      repo.create.mockReturnValue(mockRow);
      repo.save.mockResolvedValue(mockRow);

      const result = await service.addToLibrary(SCENARIO_ID, EDUCATOR_ID);
      expect(result.success).toBe(true);
      expect(result.message).toBe(EducatorSimulationsConstants.MESSAGES.ADDED);
    });

    it('UNIT: returns not found when scenario does not exist', async () => {
      tutorPatientService.getScenarios.mockResolvedValue([]);

      const result = await service.addToLibrary('missing', EDUCATOR_ID);
      expect(result.success).toBe(false);
      expect(result.message).toBe(EducatorSimulationsConstants.MESSAGES.NOT_FOUND);
    });

    it('UNIT: returns already in library for active record', async () => {
      tutorPatientService.getScenarios.mockResolvedValue([scenario]);
      repo.findOne.mockResolvedValueOnce(mockRow);

      const result = await service.addToLibrary(SCENARIO_ID, EDUCATOR_ID);
      expect(result.success).toBe(false);
      expect(result.message).toBe(EducatorSimulationsConstants.MESSAGES.ALREADY_IN_LIBRARY);
    });

    it('REGRESSION: restores soft-deleted record instead of creating a new row', async () => {
      const deletedRow = { ...mockRow, deleted_at: new Date('2024-01-01') };
      tutorPatientService.getScenarios.mockResolvedValue([scenario]);
      repo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(deletedRow);
      repo.save.mockResolvedValue({ ...deletedRow, deleted_at: null });

      const result = await service.addToLibrary(SCENARIO_ID, EDUCATOR_ID);
      expect(result.success).toBe(true);
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
    });

    it('INTEGRATION: POST /educator-simulations/add-to-library returns SUCCESS', async () => {
      jest.spyOn(service, 'addToLibrary').mockResolvedValue({
        success: true,
        message: EducatorSimulationsConstants.MESSAGES.ADDED,
        data: mockRow,
      });

      const result = await controller.addToLibrary({ scenario_id: SCENARIO_ID }, makeReq(EDUCATOR_ID));
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
      repo.save.mockResolvedValue({ ...mockRow, deleted_at: new Date() });

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
      tutorPatientService.getUnits.mockResolvedValue([{ id: 'unit-1', name: 'Emergency' }]);
      tutorPatientService.getFreshScenarios.mockResolvedValue([scenario]);

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
      await controller.getMyLibrary(makeReq(EDUCATOR_ID), undefined, mockRes);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'SUCCESS' }),
      );
    });

    it('INTEGRATION: throws when user not authenticated', async () => {
      const mockRes = { setHeader: jest.fn(), json: jest.fn() } as unknown as Response;
      await expect(controller.getMyLibrary(makeReq(null), undefined, mockRes)).rejects.toThrow();
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
      repo.find.mockResolvedValue([
        { scenario_id: SCENARIO_ID },
        { scenario_id: 'sim-002' },
      ]);

      const ids = await service.getInLibraryIds(EDUCATOR_ID);
      expect(ids.size).toBe(2);
      expect(ids.has(SCENARIO_ID)).toBe(true);
      expect(ids.has('sim-002')).toBe(true);
    });
  });
});
