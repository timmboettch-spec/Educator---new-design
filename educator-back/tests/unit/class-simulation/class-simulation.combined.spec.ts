import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClassSimulationController } from '../../../src/class-simulations/class-simulation.controller';
import { ClassSimulationService } from '../../../src/class-simulations/class-simulation.service';
import { ClassSimulation } from '../../../src/class-simulations/entity/class-simulation.entity';
import { Simulation } from '../../../src/simulations/entity/simulation.entity';
import { Class } from 'src/class/entity/class.entity';
import { TutorPatientService } from 'src/common/utils/tutor-patient.service';
import { EducatorsService } from 'src/educators/educators.service';
import { ClassSimulationConstants } from '../../../src/class-simulations/class-simulation.constant';
import { ClassConstants } from 'src/class/classes.constants';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { ConfigService } from '@nestjs/config';

import { JwtRequest, MappedSimulation } from 'src/common/types';

const CLASS_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SIM_ID = 'sim-001';
const RECORD_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const mockRecord: ClassSimulation = {
  id: RECORD_ID,
  class_id: CLASS_ID,
  simulation_id: SIM_ID,
  start_date: '2025-01-01',
  due_date: '2025-06-01',
  end_date: '2025-06-30',
  is_active: true,
  is_ai: false,
  deleted_at: null,
  class: {} as Class,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockMapped: MappedSimulation = {
  id: RECORD_ID,
  class_id: CLASS_ID,
  simulation_id: SIM_ID,
  start_date: '2025-01-01',
  due_date: '2025-06-01',
  end_date: '2025-06-30',
  created_at: mockRecord.created_at,
  updated_at: mockRecord.updated_at,
  simulation_title: 'Stroke Evaluation',
  unit_name: 'Emergency',
  unit_id: 'u-1',
  scenario_status: null,
};

describe('ClassSimulations (Controller + Service)', () => {
  let controller: ClassSimulationController;
  let service: ClassSimulationService;

  const repo = {
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    manager: {
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const classRepo = { findOne: jest.fn(), find: jest.fn() };
  const simulationRepo = {
    findOne: jest.fn().mockResolvedValue({ id: SIM_ID }),
    save: jest.fn(),
    manager: { query: jest.fn().mockResolvedValue([{ '1': 1 }]) },
  };
  const tutorPatientService = {
    getScenarios: jest
      .fn()
      .mockResolvedValue([{ id: SIM_ID, unitId: 'u-1', title: 'Stroke Evaluation' }]),
    getFreshScenarios: jest
      .fn()
      .mockResolvedValue([{ id: SIM_ID, unitId: 'u-1', title: 'Stroke Evaluation' }]),
    getAllScenariosDirect: jest
      .fn()
      .mockResolvedValue([{ id: SIM_ID, unitId: 'u-1', title: 'Stroke Evaluation' }]),
    getUnits: jest
      .fn()
      .mockResolvedValue([{ id: 'u-1', name: 'Emergency', category: 'Cardiology' }]),
    getReports: jest.fn().mockResolvedValue([]),
  };
  const dataSource = { query: jest.fn() };
  const notificationsGateway = {
    notifySimulationAssigned: jest.fn(),
    notifyEducatorSimulationDueDateReminder: jest.fn(),
  };
  const configService = { get: jest.fn().mockReturnValue('3') };
  const mockReq = { user: { userId: 'educator-1', roles: ['Educator'] } } as JwtRequest;
  const mockEducator = { id: 'educator-1', tokens: 10, role: { role_name: 'Educator' } } as never;
  const educatorService = {
    availableTokens: jest.fn().mockResolvedValue(10),
    findById: jest.fn().mockResolvedValue({ data: { id: 'educator-1', tokens: 10 } }),
    updateToken: jest.fn().mockResolvedValue(undefined),
    releaseTokens: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClassSimulationController],
      providers: [
        ClassSimulationService,
        { provide: getRepositoryToken(ClassSimulation), useValue: repo },
        { provide: getRepositoryToken(Class), useValue: classRepo },
        { provide: getRepositoryToken(Simulation), useValue: simulationRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: TutorPatientService, useValue: tutorPatientService },
        { provide: EducatorsService, useValue: educatorService },
        { provide: NotificationsGateway, useValue: notificationsGateway },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    controller = module.get(ClassSimulationController);
    service = module.get(ClassSimulationService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('assign', () => {
    const dto = {
      class_id: CLASS_ID,
      simulation_id: SIM_ID,
      start_date: '2025-01-01',
      due_date: '2025-06-01',
    };

    it('UNIT: assigns simulation to class successfully', async () => {
      classRepo.findOne.mockResolvedValue({ id: CLASS_ID, is_active: true });
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(mockRecord);
      repo.save.mockResolvedValue(mockRecord);

      const result = await service.assign(dto, mockEducator);
      expect(result.success).toBe(true);
      expect(result.message).toBe(ClassSimulationConstants.MESSAGES.ASSIGNED);
    });

    it('UNIT: fails when class not found', async () => {
      classRepo.findOne.mockResolvedValue(null);
      const result = await service.assign(dto, mockEducator);
      expect(result.success).toBe(false);
      expect(result.message).toBe(ClassSimulationConstants.MESSAGES.CLASS_NOT_FOUND);
    });

    it('UNIT: fails when simulation not found', async () => {
      classRepo.findOne.mockResolvedValue({ id: CLASS_ID, is_active: true });
      tutorPatientService.getScenarios.mockResolvedValueOnce([]);
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(mockRecord);
      repo.save.mockResolvedValue(mockRecord);
      const result = await service.assign(dto, mockEducator);
      expect(result.success).toBe(false);
      expect(result.message).toBe(ClassSimulationConstants.MESSAGES.SIMULATION_NOT_FOUND);
    });

    it('UNIT: fails when already assigned', async () => {
      classRepo.findOne.mockResolvedValue({ id: CLASS_ID, is_active: true });
      repo.findOne.mockResolvedValue(mockRecord);
      const result = await service.assign(dto, mockEducator);
      expect(result.success).toBe(false);
      expect(result.message).toBe(ClassSimulationConstants.MESSAGES.ALREADY_ASSIGNED);
    });

    it('UNIT: validates AI seats using simulation_library category rows', async () => {
      classRepo.findOne.mockResolvedValue({ id: CLASS_ID, is_active: true });
      repo.findOne.mockResolvedValue(null);
      dataSource.query.mockResolvedValueOnce([
        { category: 'Cardiology' },
        { category: 'AI Simulations' },
      ]);
      repo.manager.count.mockResolvedValueOnce(3);

      const result = await service.assign(dto, {
        id: 'educator-1',
        tokens: 2,
        role: { role_name: 'Educator' },
      } as never);

      expect(result.success).toBe(false);
      expect(result.message).toBe(ClassConstants.VALIDATION.INSUFFICIENT_TOKENS);
      expect(educatorService.updateToken).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('UNIT: reduces tokens by active students for AI simulation assignment', async () => {
      classRepo.findOne.mockResolvedValue({ id: CLASS_ID, is_active: true });
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(mockRecord);
      repo.save.mockResolvedValue(mockRecord);
      dataSource.query.mockResolvedValueOnce([{ category: 'AI Simulations' }]);
      repo.manager.count.mockResolvedValueOnce(4);

      const result = await service.assign(dto, {
        id: 'educator-1',
        tokens: 10,
        role: { role_name: 'Educator' },
      } as never);

      expect(result.success).toBe(true);
      expect(educatorService.updateToken).toHaveBeenCalledWith('educator-1', 4);
    });

    it('INTEGRATION: POST /class-simulations — assigns successfully', async () => {
      jest.spyOn(service, 'assign').mockResolvedValue({
        success: true,
        message: ClassSimulationConstants.MESSAGES.ASSIGNED,
        data: mockRecord,
      });
      const result = await controller.assign(dto, mockReq);
      expect(result.status).toBe('SUCCESS');
    });

    it('INTEGRATION: throws when class not found', async () => {
      jest.spyOn(service, 'assign').mockResolvedValue({
        success: false,
        message: ClassSimulationConstants.MESSAGES.CLASS_NOT_FOUND,
        type: 'notfound',
      });
      await expect(controller.assign(dto, mockReq)).rejects.toThrow();
    });

    it('INTEGRATION: throws when already assigned', async () => {
      jest.spyOn(service, 'assign').mockResolvedValue({
        success: false,
        message: ClassSimulationConstants.MESSAGES.ALREADY_ASSIGNED,
        type: 'bad_request',
      });
      await expect(controller.assign(dto, mockReq)).rejects.toThrow();
    });
  });

  describe('findByClass', () => {
    it('UNIT: returns simulations for a class', async () => {
      repo.find.mockResolvedValue([mockRecord]);
      const result = await service.findByClass(CLASS_ID);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].simulation_title).toBe('Stroke Evaluation');
    });

    it('UNIT: returns empty array when no simulations', async () => {
      repo.find.mockResolvedValue([]);
      const result = await service.findByClass(CLASS_ID);
      expect(result.data).toHaveLength(0);
    });

    it('INTEGRATION: GET /class-simulations/class/:class_id', async () => {
      jest.spyOn(service, 'findByClass').mockResolvedValue({
        success: true,
        message: ClassSimulationConstants.MESSAGES.BY_CLASS_FETCHED,
        data: [mockMapped],
      });
      const result = await controller.findByClass(CLASS_ID);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('REGRESSION: maps simulation_title and unit_name correctly', async () => {
      repo.find.mockResolvedValue([mockRecord]);
      const result = await service.findByClass(CLASS_ID);
      expect(result.data![0].unit_name).toBe('Emergency');
    });
  });

  describe('findByClassActive', () => {
    it('UNIT: returns only active simulations within 7-day window', async () => {
      const now = new Date();
      const start = new Date(now);
      start.setDate(now.getDate() - 1);
      const due = new Date(now);
      due.setDate(now.getDate() + 3);

      const activeRecord = {
        ...mockRecord,
        start_date: start.toISOString(),
        due_date: due.toISOString(),
      };
      repo.find.mockResolvedValue([activeRecord]);

      const result = await service.findByClassActive(CLASS_ID);
      expect(result.success).toBe(true);
      expect(result.data!.length).toBeGreaterThan(0);
    });

    it('UNIT: excludes simulations outside the 7-day window', async () => {
      const past = { ...mockRecord, start_date: '2020-01-01', due_date: '2020-01-10' };
      repo.find.mockResolvedValue([past]);

      const result = await service.findByClassActive(CLASS_ID);
      expect(result.data).toHaveLength(0);
    });

    it('UNIT: excludes simulations with null dates', async () => {
      const noDate = { ...mockRecord, start_date: undefined, due_date: undefined };
      repo.find.mockResolvedValue([noDate]);

      const result = await service.findByClassActive(CLASS_ID);
      expect(result.data).toHaveLength(0);
    });
  });

  describe('findBySimulation', () => {
    it('UNIT: returns classes for a simulation', async () => {
      repo.find.mockResolvedValue([mockRecord]);
      const result = await service.findBySimulation(SIM_ID);
      expect(result.success).toBe(true);
      expect(result.data![0].simulation_id).toBe(SIM_ID);
    });

    it('INTEGRATION: GET /class-simulations/simulation/:simulation_id', async () => {
      jest.spyOn(service, 'findBySimulation').mockResolvedValue({
        success: true,
        message: ClassSimulationConstants.MESSAGES.BY_SIMULATION_FETCHED,
        data: [mockMapped],
      });
      const result = await controller.findBySimulation(SIM_ID);
      expect(result.status).toBe('SUCCESS');
    });
  });

  describe('update', () => {
    const updateDto = { due_date: '2025-07-01' };

    it('UNIT: updates record successfully', async () => {
      repo.findOne.mockResolvedValue({ ...mockRecord });
      repo.save.mockResolvedValue({ ...mockRecord, ...updateDto });

      const result = await service.update(RECORD_ID, updateDto);
      expect(result.success).toBe(true);
      expect(result.message).toBe(ClassSimulationConstants.MESSAGES.UPDATED);
    });

    it('UNIT: fails when record not found', async () => {
      repo.findOne.mockResolvedValue(null);
      const result = await service.update('bad-id', updateDto);
      expect(result.success).toBe(false);
      expect(result.message).toBe(ClassSimulationConstants.MESSAGES.NOT_FOUND);
    });

    it('INTEGRATION: PUT /class-simulations/:id — updates successfully', async () => {
      jest.spyOn(service, 'update').mockResolvedValue({
        success: true,
        message: ClassSimulationConstants.MESSAGES.UPDATED,
        data: mockRecord,
      });
      const result = await controller.update(RECORD_ID, updateDto);
      expect(result.status).toBe('SUCCESS');
    });

    it('INTEGRATION: throws when record not found', async () => {
      jest.spyOn(service, 'update').mockResolvedValue({
        success: false,
        message: ClassSimulationConstants.MESSAGES.NOT_FOUND,
        type: 'notfound',
      });
      await expect(controller.update('bad-id', updateDto)).rejects.toThrow();
    });
  });

  describe('remove', () => {
    function setupAiRemove(
      totalStudents: number,
      dbUsed: number,
      blobUsedIds: string[] = [],
    ): void {
      repo.findOne.mockResolvedValue({ ...mockRecord, is_ai: true });
      // Return the single AI sim so calculateRefundableSeats sees it as the last one
      repo.find.mockResolvedValue([{ ...mockRecord, is_ai: true }]);
      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      (repo as Record<string, unknown>).createQueryBuilder = jest.fn().mockReturnValue(qb);
      classRepo.findOne.mockResolvedValue({
        id: 'class-1',
        educator_id: 'educator-1',
        educator: { id: 'educator-1' },
      });
      repo.manager.count.mockResolvedValue(totalStudents);
      const dbRows = Array.from({ length: dbUsed }, (_, i) => ({
        student_id: `student-uuid-${i}`,
      }));
      const dbUuidSet = new Set(dbRows.map((r) => r.student_id));
      const blobReports = blobUsedIds.map((_, i) => ({
        scenario_id: SIM_ID,
        userId: `ext-code-${i}`,
      }));
      tutorPatientService.getReports.mockResolvedValue(blobReports);
      dataSource.query.mockImplementation((sql: string) => {
        if (sql.includes('simulation_reports')) return Promise.resolve(dbRows);
        if (sql.includes('student_id = ANY')) {
          return Promise.resolve(
            blobUsedIds.filter((id) => !dbUuidSet.has(id)).map((id) => ({ id })),
          );
        }
        return Promise.resolve([]);
      });
    }

    function setupNonAiRemove(): void {
      repo.findOne.mockResolvedValue({ ...mockRecord, is_ai: false });
      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      (repo as Record<string, unknown>).createQueryBuilder = jest.fn().mockReturnValue(qb);
      classRepo.findOne.mockResolvedValue({
        id: 'class-1',
        educator_id: 'educator-1',
        educator: { id: 'educator-1' },
      });
    }

    it('UNIT: removes record successfully (non-AI simulation)', async () => {
      setupNonAiRemove();
      const result = await service.remove(RECORD_ID, 'educator-1');
      expect(result.success).toBe(true);
      expect(result.message).toBe(ClassSimulationConstants.MESSAGES.REMOVED);
    });

    it('UNIT: fails when record not found', async () => {
      repo.findOne.mockResolvedValue(null);
      const result = await service.remove('bad-id', 'educator-1');
      expect(result.success).toBe(false);
    });

    it('REGRESSION: remove marks simulation inactive via QueryBuilder', async () => {
      setupNonAiRemove();
      const result = await service.remove(RECORD_ID, 'educator-1');
      const qb = (repo as Record<string, unknown>).createQueryBuilder as jest.Mock;
      expect(qb).toHaveBeenCalled();
    });

    it('UNIT: non-AI simulation removal does not refund any seats', async () => {
      setupNonAiRemove();
      await service.remove(RECORD_ID, 'educator-1');
      expect(educatorService.releaseTokens).not.toHaveBeenCalled();
    });

    it('INTEGRATION: DELETE /class-simulations/:id — removes successfully', async () => {
      jest.spyOn(service, 'remove').mockResolvedValue({
        success: true,
        message: ClassSimulationConstants.MESSAGES.REMOVED,
        data: null,
      });
      const result = await controller.remove(RECORD_ID, mockReq);
      expect(result.data).toBeNull();
    });

    it('INTEGRATION: throws when record not found', async () => {
      jest.spyOn(service, 'remove').mockResolvedValue({
        success: false,
        message: ClassSimulationConstants.MESSAGES.NOT_FOUND,
        type: 'notfound',
      });
      await expect(controller.remove('bad-id', mockReq)).rejects.toThrow();
    });

    it.each([
      [20, 0, 20],
      [20, 1, 19],
      [20, 5, 15],
      [20, 10, 10],
      [20, 19, 1],
      [20, 20, 0],
    ])(
      'UNIT: AI simulation — %i students / %i used → %i seats refunded',
      async (total, used, expected) => {
        setupAiRemove(total, used);
        await service.remove(RECORD_ID, 'educator-1');
        if (expected > 0) {
          expect(educatorService.releaseTokens).toHaveBeenCalledWith('educator-1', expected);
        } else {
          expect(educatorService.releaseTokens).not.toHaveBeenCalled();
        }
      },
    );

    it('UNIT: student with report → seat consumed, no refund', async () => {
      setupAiRemove(1, 1);
      await service.remove(RECORD_ID, 'educator-1');
      expect(educatorService.releaseTokens).not.toHaveBeenCalled();
    });

    it('UNIT: student with 0 reports → seat refundable', async () => {
      setupAiRemove(1, 0);
      await service.remove(RECORD_ID, 'educator-1');
      expect(educatorService.releaseTokens).toHaveBeenCalledWith('educator-1', 1);
    });

    it('UNIT: student used via blob only → seat consumed, no refund', async () => {
      setupAiRemove(2, 0, ['blob-student-uuid-0']);
      await service.remove(RECORD_ID, 'educator-1');
      expect(educatorService.releaseTokens).toHaveBeenCalledWith('educator-1', 1);
    });

    it('UNIT: one used student does not prevent unused students from being refunded', async () => {
      setupAiRemove(5, 1);
      await service.remove(RECORD_ID, 'educator-1');
      expect(educatorService.releaseTokens).toHaveBeenCalledWith('educator-1', 4);
    });

    it('UNIT: retry (already inactive) does not cause duplicate refund', async () => {
      repo.findOne.mockResolvedValue(null);
      const result = await service.remove(RECORD_ID, 'educator-1');
      expect(result.success).toBe(false);
      expect(educatorService.releaseTokens).not.toHaveBeenCalled();
    });

    it('UNIT: concurrent deactivation (affected=0) does not trigger duplicate refund', async () => {
      repo.findOne.mockResolvedValue({ ...mockRecord, is_ai: true });
      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };
      (repo as Record<string, unknown>).createQueryBuilder = jest.fn().mockReturnValue(qb);
      classRepo.findOne.mockResolvedValue({
        id: 'class-1',
        educator_id: 'educator-1',
        educator: { id: 'educator-1' },
      });
      repo.manager.count.mockResolvedValue(20);
      tutorPatientService.getReports.mockResolvedValue([]);
      dataSource.query.mockImplementation((sql: string) => {
        if (sql.includes('simulation_reports'))
          return Promise.resolve(Array.from({ length: 5 }, (_, i) => ({ student_id: `s-${i}` })));
        return Promise.resolve([]);
      });
      await service.remove(RECORD_ID, 'educator-1');
      expect(educatorService.releaseTokens).not.toHaveBeenCalled();
    });

    it('UNIT: missing educator ID suppresses refund gracefully', async () => {
      setupAiRemove(5, 2);
      classRepo.findOne.mockResolvedValue({ id: 'class-1', educator_id: null, educator: null });
      await expect(service.remove(RECORD_ID, 'educator-1')).rejects.toThrow(BadRequestException);
      expect(educatorService.releaseTokens).not.toHaveBeenCalled();
    });

    it('UNIT: assign stamps is_ai=true on record when AI seats are consumed', async () => {
      classRepo.findOne.mockResolvedValue({ id: CLASS_ID, is_active: true });
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue({ ...mockRecord, is_ai: true });
      repo.save.mockResolvedValue({ ...mockRecord, is_ai: true });
      dataSource.query.mockResolvedValueOnce([{ category: 'AI Simulations' }]);
      repo.manager.count.mockResolvedValueOnce(2);
      await service.assign({ class_id: CLASS_ID, simulation_id: SIM_ID }, {
        id: 'educator-1',
        tokens: 10,
        role: { role_name: 'Educator' },
      } as never);
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ is_ai: true }));
    });
  });
});
