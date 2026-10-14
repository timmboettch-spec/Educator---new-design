import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ClassSimulationService } from 'src/class-simulations/class-simulation.service';
import { CommonStatus } from 'src/common/enums/status.enum';
import { SimulationAttemptConstants, SimulationProgressStatus } from 'src/common/constants';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { SIMULATION_PROGRESS_MSG } from 'src/common/messages/simulation-progress.message';
import { AzureBlobService } from 'src/common/services';
import {
  CLASS_REPOSITORY,
  CLASS_SIMULATION_REPOSITORY,
  EDUCATOR_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  STUDENT_REPOSITORY,
  STUDENT_SIMULATION_PROGRESS_REPOSITORY,
  USER_REPOSITORY,
} from 'src/database/tokens';
import { MailService } from 'src/mail/mail.service';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { StudentsController } from 'src/students/students.controller';
import { StudentsService } from 'src/students/students.service';
import { AutomationAccessService } from 'src/common/services/automation-access.service';
import { buildTestApp } from '../setup/test-app.factory';

/**
 * Student-facing routes that read Simulation Progress. Every repository is mocked: these tests
 * assert status codes, message keys and response shape, not SQL.
 */
const STUDENT_CODE = 'BIO_0001';
const REPEAT_ALLOWED_CODE = '85170719';
const STUDENT_UUID = '550e8400-e29b-41d4-a716-446655440601';
const CLASS_ID = '550e8400-e29b-41d4-a716-446655440602';
const MAX = SimulationAttemptConstants.MAX_ASSESSMENT_ATTEMPTS;

const activeStudent = (code: string): Record<string, unknown> => ({
  id: STUDENT_UUID,
  student_id: code,
  student_name: 'Alice',
  status: CommonStatus.ACTIVE,
  is_active: true,
  deleted_at: null,
  class: { id: CLASS_ID, is_active: true, deleted_at: null, status: CommonStatus.ACTIVE },
  educator: { id: 'educator-1', tokens: 5, is_active: true, deleted_at: null },
});

const progressRow = (
  scenarioId: string,
  status: SimulationProgressStatus,
  assessmentAttemptsCount: number,
): Record<string, unknown> => ({ status, assessmentAttemptsCount, simulation: { id: scenarioId } });

describe('Simulation Progress student routes (Integration, mocked repositories)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  // The student the signed token belongs to; `startAssessment` looks them up by uuid.
  let currentCode = STUDENT_CODE;
  const studentRepo = { findOne: jest.fn() };
  const classSimulationRepo = { find: jest.fn() };
  const simulationV2Repo = { find: jest.fn() };
  const simulationReportRepo = { findAttemptRowsByStudentId: jest.fn() };
  const progressRepo = {
    findByStudentAndScenarioId: jest.fn(),
    findByStudentAndScenarioIds: jest.fn(),
  };

  const httpServer = (): Parameters<typeof request>[0] =>
    app.getHttpServer() as Parameters<typeof request>[0];

  const tokenFor = (code: string): string => {
    currentCode = code;
    return jwtService.sign({
      sub: code,
      user_id: STUDENT_UUID,
      student_id: code,
      type: 'student',
      roles: ['Student'],
    });
  };

  const assign = (...scenarioIds: string[]): void => {
    classSimulationRepo.find.mockResolvedValue(
      scenarioIds.map((id) => ({
        simulation_id: id,
        class_id: CLASS_ID,
        is_active: true,
        start_date: null,
        due_date: null,
        end_date: null,
      })),
    );
    simulationV2Repo.find.mockResolvedValue(
      scenarioIds.map((id) => ({ id, title: id, description: '', avatarEnabled: false })),
    );
  };

  beforeAll(async () => {
    ({ app } = await buildTestApp({
      controllers: [StudentsController],
      providers: [
        StudentsService,
        { provide: STUDENT_REPOSITORY, useValue: studentRepo },
        { provide: CLASS_REPOSITORY, useValue: { findOne: jest.fn() } },
        { provide: USER_REPOSITORY, useValue: { findOne: jest.fn() } },
        { provide: EDUCATOR_REPOSITORY, useValue: { findOne: jest.fn() } },
        { provide: CLASS_SIMULATION_REPOSITORY, useValue: classSimulationRepo },
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: simulationReportRepo },
        { provide: STUDENT_SIMULATION_PROGRESS_REPOSITORY, useValue: progressRepo },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationV2Repo },
        { provide: AzureBlobService, useValue: { uploadFile: jest.fn() } },
        { provide: MailService, useValue: { sendMail: jest.fn().mockResolvedValue({}) } },
        { provide: DataSource, useValue: { query: jest.fn() } },
        {
          provide: AutomationAccessService,
          useValue: { isAutomationStudentCode: jest.fn().mockReturnValue(false) },
        },
        { provide: NotificationsGateway, useValue: { notifyAccountDeleted: jest.fn() } },
        { provide: ClassSimulationService, useValue: {} },
      ],
    }));
    jwtService = app.get(JwtService);
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    studentRepo.findOne.mockImplementation(({ where }: { where?: { student_id?: string } }) =>
      Promise.resolve(activeStudent(where?.student_id ?? currentCode)),
    );
    simulationReportRepo.findAttemptRowsByStudentId.mockResolvedValue([]);
    progressRepo.findByStudentAndScenarioId.mockResolvedValue(null);
    progressRepo.findByStudentAndScenarioIds.mockResolvedValue([]);
  });

  describe('GET /api/students/simulations/:studentCode', () => {
    const getSimulations = (): request.Test =>
      request(httpServer())
        .get(`/api/students/simulations/${STUDENT_CODE}`)
        .set('Authorization', `Bearer ${tokenFor(STUDENT_CODE)}`);

    it.each([0, 1, 2, 3])(
      'with %i attempts reports attemptCount 0, maxAttempts and canForfeit=false (progress not loaded)',
      async (used) => {
        assign('sim-1');
        if (used > 0) {
          progressRepo.findByStudentAndScenarioIds.mockResolvedValue([
            progressRow('sim-1', SimulationProgressStatus.IN_PROGRESS, used),
          ]);
        }

        const response = await getSimulations().expect(200);

        expect(response.body.data.simulations).toHaveLength(1);
        expect(response.body.data.simulations[0]).toMatchObject({
          id: 'sim-1',
          attemptCount: 0,
          maxAttempts: MAX,
          canForfeit: false,
        });
      },
    );

    it.each([SimulationProgressStatus.COMPLETED, SimulationProgressStatus.FORFEITED])(
      'keeps a %s Simulation in the list (hiding closed Simulations is a separate ticket)',
      async (status) => {
        assign('sim-1', 'sim-2');
        progressRepo.findByStudentAndScenarioIds.mockResolvedValue([
          progressRow('sim-1', status, status === SimulationProgressStatus.COMPLETED ? MAX : 1),
        ]);

        const response = await getSimulations().expect(200);

        expect(
          (response.body.data.simulations as Array<{ id: string }>).map((sim) => sim.id),
        ).toEqual(['sim-1', 'sim-2']);
      },
    );

    it('does not query Simulation Progress for the listing', async () => {
      assign('sim-1', 'sim-2');

      await getSimulations().expect(200);

      expect(progressRepo.findByStudentAndScenarioIds).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/students/:studentId/start-assessment', () => {
    const start = (mode: 'Assessment' | 'Practice' = 'Assessment', code = STUDENT_CODE) =>
      request(httpServer())
        .post(`/api/students/${STUDENT_UUID}/start-assessment`)
        .set('Authorization', `Bearer ${tokenFor(code)}`)
        .send({ scenario_id: 'sim-1', mode });

    it('allows a first start when there is no progress row', async () => {
      await start().expect(201);
    });

    it.each([1, 2])('allows the Assessment start after %i used attempts', async (used) => {
      progressRepo.findByStudentAndScenarioId.mockResolvedValue(
        progressRow('sim-1', SimulationProgressStatus.IN_PROGRESS, used),
      );

      await start().expect(201);
    });

    it.each(['Assessment', 'Practice'] as const)('rejects %s when Completed', async (mode) => {
      progressRepo.findByStudentAndScenarioId.mockResolvedValue(
        progressRow('sim-1', SimulationProgressStatus.COMPLETED, MAX),
      );

      const response = await start(mode).expect(400);

      expect(response.body.message).toBe(SIMULATION_PROGRESS_MSG.SIMULATION_COMPLETED);
    });

    it.each(['Assessment', 'Practice'] as const)('rejects %s when Forfeited', async (mode) => {
      progressRepo.findByStudentAndScenarioId.mockResolvedValue(
        progressRow('sim-1', SimulationProgressStatus.FORFEITED, 1),
      );

      const response = await start(mode).expect(400);

      expect(response.body.message).toBe(SIMULATION_PROGRESS_MSG.ASSESSMENT_FORFEITED);
    });

    it('allows the repeat-allowed student even when Completed', async () => {
      progressRepo.findByStudentAndScenarioId.mockResolvedValue(
        progressRow('sim-1', SimulationProgressStatus.COMPLETED, MAX),
      );

      await start('Assessment', REPEAT_ALLOWED_CODE).expect(201);
    });
  });
});
