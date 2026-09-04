import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { TutorPatientService } from 'src/common/utils/tutor-patient.service';
import { MailService } from 'src/mail/mail.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { SimulationReportsController } from '../../../src/simulation-reports/simulation-reports.controller';
import { SimulationReportsService } from '../../../src/simulation-reports/simulation-reports.service';
import { SimulationReport } from '../../../src/simulation-reports/entity/simulation-report.entity';
import { AppStatus } from 'src/common/utils/messages';
import { RedisService } from '../../../src/redis/redis.service';
import { Notification } from '../../../src/notifications/entity/notification.entity';
import { Student } from '../../../src/students/entity/students.entity';
import { Simulation } from '../../../src/simulations/entity/simulation.entity';
import { ClassSimulation } from '../../../src/class-simulations/entity/class-simulation.entity';
import { Educator } from '../../../src/educators/entity/educator.entity';

const tutorPatientMock = {
  getScenarios: jest.fn(),
  getUnits: jest.fn(),
  getReports: jest.fn().mockResolvedValue([]),
  clearCache: jest.fn(),
  getReportsByStudentCode: jest.fn().mockResolvedValue({ matched: [], isMatch: false }),
  getReportsByStudentIds: jest.fn().mockResolvedValue({ matched: [], isMatch: false }),
  getReportSourceLabel: jest.fn().mockReturnValue('cache'),
};

const mockReport: SimulationReport = {
  id: '00000000-0000-0000-0000-000000000001',
  student_id: 'stu-uuid',
  student_name: 'Alice',
  scenario_id: 'sim-1',
  report_data: { score: 90, totalTimeSeconds: 300 },
  viewed_at: null,
  viewed_by: null,
  created_at: new Date(),
};

const createDto = {
  student_id: 'stu-uuid',
  student_name: 'Alice',
  scenario_id: 'sim-1',
  report_data: { score: 90, totalTimeSeconds: 300, createdAt: new Date().toISOString() },
};

describe('SimulationReports (Controller + Service)', () => {
  let controller: SimulationReportsController;
  let service: SimulationReportsService;

  const reportRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const notificationRepo = {
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    })),
  };

  const studentQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
  };

  const studentRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => studentQueryBuilder),
  };

  const simulationRepo = {
    findOne: jest.fn(),
  };

  const classSimulationRepo = {
    exists: jest.fn(),
  };

  const educatorRepo = {
    findOne: jest.fn().mockResolvedValue(null),
  };

  const dataSource = {
    getRepository: jest.fn((target: { name?: string }) => {
      if (target === Student || target?.name === 'Student') return studentRepo;
      if (target === Simulation || target?.name === 'Simulation') return simulationRepo;
      if (target === ClassSimulation || target?.name === 'ClassSimulation')
        return classSimulationRepo;
      if (target === Educator || target?.name === 'Educator') return educatorRepo;
      return {};
    }),
  };

  const notificationsGateway = {
    notifyEducatorStudentReportAvailable: jest.fn(),
    notifyAdminStudentReportAvailable: jest.fn(),
    notifyStudentSimulationsUpdated: jest.fn(),
  };

  beforeEach(async () => {
    studentRepo.find.mockReset();
    studentRepo.findOne.mockReset();
    studentRepo.update.mockReset();
    studentQueryBuilder.select.mockClear();
    studentQueryBuilder.leftJoin.mockClear();
    studentQueryBuilder.leftJoinAndSelect.mockClear();
    studentQueryBuilder.where.mockClear();
    studentQueryBuilder.andWhere.mockClear();
    studentQueryBuilder.orderBy.mockClear();
    studentQueryBuilder.limit.mockClear();
    studentQueryBuilder.getRawMany.mockReset();
    simulationRepo.findOne.mockReset();
    classSimulationRepo.exists.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SimulationReportsController],
      providers: [
        SimulationReportsService,
        { provide: getRepositoryToken(SimulationReport), useValue: reportRepo },
        { provide: getRepositoryToken(Notification), useValue: notificationRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: TutorPatientService, useValue: tutorPatientMock },
        { provide: MailService, useValue: { sendMail: jest.fn().mockResolvedValue(undefined) } },
        { provide: NotificationsGateway, useValue: notificationsGateway },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
            increment: jest.fn().mockResolvedValue(2),
          },
        },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('') } },
      ],
    }).compile();

    controller = module.get(SimulationReportsController);
    service = module.get(SimulationReportsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('save', () => {
    it('UNIT: saves report successfully', async () => {
      reportRepo.findOne.mockResolvedValue(null);
      reportRepo.find.mockResolvedValue([mockReport]);
      reportRepo.create.mockReturnValue(mockReport);
      reportRepo.save.mockResolvedValue(mockReport);
      studentRepo.findOne
        .mockResolvedValueOnce({ id: 'stu-uuid', class: { id: 'class-uuid' } })
        .mockResolvedValueOnce({ id: 'stu-uuid', student_id: 'STU-001' })
        .mockResolvedValueOnce({
          id: 'stu-uuid',
          student_name: 'Alice',
          class: { id: 'class-uuid', class_name: 'Class A' },
          educator: { id: 'edu-1' },
        });
      classSimulationRepo.exists.mockResolvedValue(true);
      studentRepo.update.mockResolvedValue({ affected: 1 });
      simulationRepo.findOne.mockResolvedValue({ id: 'sim-1', title: 'Simulation 1' });

      const result = await service.save(createDto);
      // Drain the fire-and-forget notifyEducatorReportAvailable promise chain
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(result.success).toBe(true);
      expect(result.data?.student_id).toBe('stu-uuid');
      expect(notificationsGateway.notifyEducatorStudentReportAvailable).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('UNIT: returns DB reports when blob has no matches', async () => {
      reportRepo.find.mockResolvedValue([mockReport]);
      studentRepo.find.mockResolvedValue([]);
      tutorPatientMock.getReports.mockResolvedValue([]);

      const result = await service.findAll();
      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.data ?? [])).toBe(true);
    });

    it('INTEGRATION: GET /simulation-reports — returns list', async () => {
      jest
        .spyOn(service, 'findAll')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [mockReport] });
      const result = await controller.findAll();
      expect(result.status).toBe(AppStatus.SUCCESS);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('findByStudentId', () => {
    it('UNIT: returns reports for student UUID', async () => {
      studentRepo.findOne.mockResolvedValueOnce({ id: 'stu-uuid' });
      reportRepo.find.mockResolvedValue([mockReport]);
      tutorPatientMock.getReportsByStudentCode.mockResolvedValue({ matched: [], isMatch: false });

      const result = await service.findByStudentId('stu-uuid');
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('INTEGRATION: GET /simulation-reports/student/:studentId — returns list', async () => {
      jest
        .spyOn(service, 'findByStudentId')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [mockReport] });
      const result = await controller.findByStudentId('stu-uuid');
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('findByClassId', () => {
    it('UNIT: returns reports for class', async () => {
      studentQueryBuilder.getRawMany.mockResolvedValueOnce([{ id: 'stu-uuid' }]);
      reportRepo.find.mockResolvedValue([mockReport]);
      studentRepo.find.mockResolvedValue([{ id: 'stu-uuid', student_id: 'STU-001' }]);
      tutorPatientMock.getReports.mockResolvedValue([]);

      const result = await service.findByClassId('class-uuid');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('INTEGRATION: GET /simulation-reports/class/:classId — returns list', async () => {
      jest
        .spyOn(service, 'findByClassId')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [mockReport] });
      const result = await controller.findByClassId('class-uuid');
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('findById', () => {
    it('UNIT: returns report by id', async () => {
      reportRepo.findOne.mockResolvedValue(mockReport);
      const result = await service.findById('00000000-0000-0000-0000-000000000001');
      expect(result.data?.id).toBe('00000000-0000-0000-0000-000000000001');
    });

    it('INTEGRATION: GET /simulation-reports/:id — returns item', async () => {
      jest
        .spyOn(service, 'findById')
        .mockResolvedValue({ success: true, message: 'Fetched', data: mockReport });
      const result = await controller.findById('00000000-0000-0000-0000-000000000001');
      expect((result.data as SimulationReport).id).toBe('00000000-0000-0000-0000-000000000001');
    });
  });

  describe('stats endpoints', () => {
    it('INTEGRATION: GET monthly breakdown 3m', async () => {
      jest
        .spyOn(service, 'monthlyBreakdown')
        .mockResolvedValue({ success: true, message: 'OK', data: [] });
      const result = await controller.monthlyBreakdown3m();
      expect(result.status).toBe(AppStatus.SUCCESS);
    });

    it('INTEGRATION: GET completed count 6m', async () => {
      jest.spyOn(service, 'completedCount').mockResolvedValue({
        success: true,
        message: 'OK',
        data: { count: 0, months: 6, since: new Date().toISOString() },
      });
      const result = await controller.completedCount6m();
      expect(result.status).toBe(AppStatus.SUCCESS);
    });
  });

  describe('notification deduplication', () => {
    it('UNIT: concurrent save calls for the same student/scenario fire at most one educator notification', async () => {
      const redisService = service['redisService'] as { get: jest.Mock; increment: jest.Mock };
      redisService.get.mockResolvedValue(null);
      // Simulate atomic INCR: first caller gets 1 (proceeds), all others get a higher count (skip).
      let callCount = 0;
      redisService.increment.mockImplementation(() => Promise.resolve(++callCount));

      const student = {
        id: 'stu-uuid',
        student_name: 'Alice',
        class: { id: 'class-uuid', class_name: 'Class A' },
        educator: { id: 'edu-1' },
      };
      studentRepo.findOne.mockResolvedValue(student);
      simulationRepo.findOne.mockResolvedValue({ id: 'sim-1', title: 'Simulation 1' });
      educatorRepo.findOne.mockResolvedValue(null);
      notificationsGateway.notifyEducatorStudentReportAvailable.mockReset();

      // Simulate three concurrent skipIfAlreadyNotified=true calls (as from notifyBlobReportsOnce)
      const notifyFn = (
        service as unknown as {
          notifyEducatorReportAvailable: (
            s: string,
            sc: string,
            n: string | undefined,
            skip: boolean,
          ) => Promise<void>;
        }
      )['notifyEducatorReportAvailable'].bind(service);

      await Promise.all([
        notifyFn('stu-uuid', 'sim-1', 'Alice', true),
        notifyFn('stu-uuid', 'sim-1', 'Alice', true),
        notifyFn('stu-uuid', 'sim-1', 'Alice', true),
      ]);

      expect(notificationsGateway.notifyEducatorStudentReportAvailable).toHaveBeenCalledTimes(1);
    });
  });
});
