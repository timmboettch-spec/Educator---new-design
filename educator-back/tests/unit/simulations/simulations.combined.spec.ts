import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SimulationsController } from '../../../src/simulations/simulations.controller';
import { SimulationsService } from '../../../src/simulations/simulations.service';
import { Simulation } from '../../../src/simulations/entity/simulation.entity';
import { TutorPatientService } from 'src/common/utils/tutor-patient.service';
import type { Response } from 'express';
import { BlobScenario } from '../../../src/common/types';

const mockSim: Simulation = {
  id: 'sim-1',
  title: 'Cardiac Arrest',
  unit_id: 'unit-1',
  unitId: 'unit-1',
  disabled: false,
  created_at: new Date(),
  updated_at: new Date(),
} as unknown as Simulation;

const tutorPatientMock = {
  getScenarios: jest.fn(),
  getUnits: jest.fn(),
  getReports: jest.fn(),
  getAllSimulationData: jest.fn(),
  getFreshAllSimulationData: jest.fn(),
};

describe('Simulations (Controller + Service)', () => {
  let controller: SimulationsController;
  let service: SimulationsService;

  const simRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
    manager: { query: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SimulationsController],
      providers: [
        SimulationsService,
        { provide: getRepositoryToken(Simulation), useValue: simRepo },
        { provide: TutorPatientService, useValue: tutorPatientMock },
      ],
    }).compile();

    controller = module.get(SimulationsController);
    service = module.get(SimulationsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAllWithDetails', () => {
    it('UNIT: returns full simulation data', async () => {
      tutorPatientMock.getAllSimulationData.mockResolvedValue([{ id: 'sim-1' }]);
      const result = await service.findAllWithDetails();
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('INTEGRATION: GET /simulations/all-details — returns list', async () => {
      jest
        .spyOn(service, 'findAllWithDetails')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [mockSim as unknown as BlobScenario] });
      const result = await controller.findAllWithDetails();
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('findAll', () => {
    it('UNIT: returns all simulations', async () => {
      tutorPatientMock.getScenarios.mockResolvedValue([mockSim]);
      const result = await service.findAll();
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('INTEGRATION: GET /simulations — returns list', async () => {
      jest
        .spyOn(service, 'findAll')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [mockSim] });
      const result = await controller.findAll();
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('findById', () => {
    it('UNIT: returns simulation by id', async () => {
      tutorPatientMock.getScenarios.mockResolvedValue([mockSim]);
      const result = await service.findById('sim-1');
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('sim-1');
    });

    it('INTEGRATION: GET /simulations/:id — returns item', async () => {
      jest
        .spyOn(service, 'findById')
        .mockResolvedValue({ success: true, message: 'Fetched', data: mockSim });
      const result = await controller.findById('sim-1');
      expect((result.data as Simulation).id).toBe('sim-1');
    });
  });

  describe('findByUnitId', () => {
    it('UNIT: returns simulations by unit', async () => {
      tutorPatientMock.getFreshAllSimulationData.mockResolvedValue([{ ...mockSim, unitId: 'unit-1' }]);
      const result = await service.findByUnitId('unit-1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('INTEGRATION: GET /simulations/unit/:unit_id — returns list', async () => {
      jest
        .spyOn(service, 'findByUnitId')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [mockSim] });
      const jsonMock = jest.fn();
      const mockRes = { setHeader: jest.fn(), json: jsonMock } as unknown as Response;
      await controller.findByUnitId('unit-1', undefined, mockRes);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUCCESS' }));
    });
  });
});
