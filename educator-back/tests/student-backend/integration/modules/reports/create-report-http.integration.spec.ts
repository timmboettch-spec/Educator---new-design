import { AiGateway } from 'src/common/interfaces';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { QueryFailedError } from 'typeorm';
import { ReportsController } from '@/modules/reports/reports.controller';
import { ReportsService } from '@/modules/reports/reports.service';
import { ActionsInterventionsService } from '@/modules/reports/actions-interventions.service';
import { PpePrivacyService } from '@/modules/reports/ppe-privacy.service';
import { ClinicalDocumentationService } from '@/modules/reports/clinical-documentation.service';
import { CommunicationService } from '@/modules/reports/communication.service';
import { TimelineTimingService } from '@/modules/reports/timeline-timing.service';
import { SequencingService } from '@/modules/reports/sequencing.service';
import { LifecycleTelemetryService } from '@/modules/telemetry/lifecycle-telemetry.service';
import { ScenariosService } from '@/modules/scenarios/scenarios.service';
import { MailService } from 'src/mail/mail.service';
import { MailRetryService } from 'src/mail/mail-retry.service';
import { SimulationProgressStatus } from 'src/common/constants';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { SIMULATION_PROGRESS_MSG } from 'src/common/messages/simulation-progress.message';
import { ConflictException } from '@nestjs/common';
import {
  SIMULATION_REPORT_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  STUDENT_REPOSITORY,
  STUDENT_SIMULATION_PROGRESS_REPOSITORY,
  TRANSCRIPT_REPOSITORY,
  UNIT_REPOSITORY,
} from 'src/database/tokens';
import { buildTestApp } from '../../../../integration/setup/test-app.factory';
import { loggerServiceTestProvider } from '../../common/setup/logger.mock';
import {
  createMockSimulationReportRepository,
  createMockStudentRepository,
  createMockStudentSimulationProgressRepository,
  createMockUnitRepository,
} from '../../../unit/common/utils/mock-factory';

/**
 * `POST /reports/create` through the real controller, guards and exception filter. Every
 * repository is mocked and AI grading is stubbed at `analyzeWithOpenAI`, so these tests assert the
 * HTTP contract of the Simulation Progress pre-check and of the 409 mappings.
 */
const STUDENT_CODE = 'BIO_0001';
const STUDENT_UUID = '550e8400-e29b-41d4-a716-446655440601';

const body = (mode: 'Assessment' | 'Practice' = 'Assessment'): Record<string, unknown> => ({
  userId: STUDENT_CODE,
  studentName: 'Ada',
  studentClass: 'Biology',
  scenarioId: 'sim-1',
  scenarioTitle: 'Acute Coronary Syndrome',
  transcriptId: 'transcript-4',
  mode,
  summaryByCategory: { vitals: {}, history: [], actions: [] },
});

const progress = (
  status: SimulationProgressStatus,
  assessmentAttemptsCount: number,
): Record<string, unknown> => ({ status, assessmentAttemptsCount });

const latestAttempt = {
  id: 'row-3',
  reportId: 'report-3',
  transcriptId: 'transcript-3',
  scenarioId: 'sim-1',
  score: 77,
};

describe('POST /reports/create — Simulation Progress (Integration, mocked repositories)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let analyze: jest.Mock;
  let reportRepo: ReturnType<typeof createMockSimulationReportRepository>;
  let progressRepo: ReturnType<typeof createMockStudentSimulationProgressRepository>;

  const httpServer = (): Parameters<typeof request>[0] =>
    app.getHttpServer() as Parameters<typeof request>[0];

  const create = (mode: 'Assessment' | 'Practice' = 'Assessment'): request.Test =>
    request(httpServer())
      .post('/api/reports/create')
      .set(
        'Authorization',
        `Bearer ${jwtService.sign({
          sub: STUDENT_CODE,
          user_id: STUDENT_UUID,
          student_id: STUDENT_CODE,
          type: 'student',
          roles: ['Student'],
        })}`,
      )
      .send(body(mode));

  beforeAll(async () => {
    reportRepo = createMockSimulationReportRepository();
    progressRepo = createMockStudentSimulationProgressRepository();
    ({ app } = await buildTestApp({
      controllers: [ReportsController],
      providers: [
        ReportsService,
        { provide: ScenariosService, useValue: { assertScenarioAssigned: jest.fn() } },
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: reportRepo },
        { provide: STUDENT_SIMULATION_PROGRESS_REPOSITORY, useValue: progressRepo },
        { provide: UNIT_REPOSITORY, useValue: createMockUnitRepository() },
        {
          provide: TRANSCRIPT_REPOSITORY,
          useValue: { findByBusinessId: jest.fn().mockResolvedValue({ messages: [] }) },
        },
        {
          provide: SIMULATION_V2_REPOSITORY,
          useValue: {
            findByBusinessIdWithChildrenJoined: jest
              .fn()
              .mockResolvedValue({ title: 'Acute Coronary Syndrome', grading: { maxScore: 100 } }),
          },
        },
        {
          provide: MailRetryService,
          useValue: { enqueue: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: MailService, useValue: { sendMail: jest.fn().mockResolvedValue(undefined) } },
        ActionsInterventionsService,
        PpePrivacyService,
        ClinicalDocumentationService,
        CommunicationService,
        TimelineTimingService,
        {
          provide: SequencingService,
          useValue: {
            evaluateSequencingPrioritization: jest
              .fn()
              .mockResolvedValue({ passed: true, parentResults: [], violations: [] }),
          },
        },
        {
          provide: AiGateway,
          useValue: {
            complete: jest.fn(),
            completeJson: jest.fn(),
            isConfigured: jest.fn().mockReturnValue(false),
          },
        },
        { provide: LifecycleTelemetryService, useValue: {} },
        loggerServiceTestProvider,
      ],
    }));
    jwtService = app.get(JwtService);
    analyze = jest
      .spyOn(
        app.get(ReportsService) as unknown as Record<string, (...args: unknown[]) => unknown>,
        'analyzeWithOpenAI',
      )
      .mockResolvedValue({
        softSkills: { totalScore: 15, totalWeight: 20 },
        technicalSkills: { totalScore: 70, totalWeight: 80 },
        overall: { summary: 'Analysis complete', feedback: 'Good work' },
      }) as unknown as jest.Mock;
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    reportRepo.findByTranscriptId.mockResolvedValue(null);
    reportRepo.findLatestAttemptByStudentAndScenario.mockResolvedValue(null);
    progressRepo.findByStudentAndScenarioId.mockResolvedValue(null);
  });

  describe('pre-check', () => {
    it.each([
      [
        'an Assessment after Max Attempts (4th submission)',
        SimulationProgressStatus.IN_PROGRESS,
        3,
      ],
      ['a Completed Simulation', SimulationProgressStatus.COMPLETED, 3],
    ])(
      'returns the latest Attempt for %s without grading or writing',
      async (_label, status, used) => {
        progressRepo.findByStudentAndScenarioId.mockResolvedValue(progress(status, used));
        reportRepo.findLatestAttemptByStudentAndScenario.mockResolvedValue(latestAttempt);

        // Create Report answers with the route's default POST status, as before Simulation Progress.
        const response = await create().expect(201);

        expect(response.body).toMatchObject({ id: 'report-3', transcriptId: 'transcript-3' });
        expect(analyze).not.toHaveBeenCalled();
        expect(progressRepo.recordSubmittedAttempt).not.toHaveBeenCalled();
      },
    );

    it('returns the latest Attempt for a Forfeited Simulation in Practice mode too', async () => {
      progressRepo.findByStudentAndScenarioId.mockResolvedValue(
        progress(SimulationProgressStatus.FORFEITED, 1),
      );
      reportRepo.findLatestAttemptByStudentAndScenario.mockResolvedValue(latestAttempt);

      const response = await create('Practice').expect(201);

      expect(response.body).toMatchObject({ id: 'report-3' });
      expect(analyze).not.toHaveBeenCalled();
    });

    it('grades and records while attempts remain', async () => {
      progressRepo.findByStudentAndScenarioId.mockResolvedValue(
        progress(SimulationProgressStatus.IN_PROGRESS, 2),
      );

      await create().expect(201);

      expect(analyze).toHaveBeenCalledTimes(1);
      expect(progressRepo.recordSubmittedAttempt).toHaveBeenCalledTimes(1);
    });
  });

  describe('409 mappings', () => {
    it.each([
      SIMULATION_PROGRESS_MSG.ASSESSMENT_ATTEMPT_LIMIT_REACHED,
      SIMULATION_PROGRESS_MSG.ASSESSMENT_FORFEITED,
      SIMULATION_PROGRESS_MSG.SIMULATION_COMPLETED,
    ])('answers 409 %s when the transaction rejects the submission (lost race)', async (key) => {
      progressRepo.recordSubmittedAttempt.mockRejectedValue(new ConflictException(key));

      const response = await create().expect(409);

      expect(response.body.message).toBe(key);
    });

    it.each([
      [
        '23505',
        'UQ_simulation_reports_student_scenario_mode_attempt',
        409,
        'error.DB.DUPLICATE_ENTRY',
      ],
      [
        '23514',
        'CHK_student_simulation_progress_assessment_attempts_range',
        400,
        ERROR_MSG.DB.INVALID_REQUEST,
      ],
    ])(
      'maps Postgres %s on %s to the generic DB error (%i)',
      async (code, constraint, status, message) => {
        progressRepo.recordSubmittedAttempt.mockRejectedValue(
          new QueryFailedError(
            'INSERT',
            [],
            Object.assign(new Error('violation'), { code, constraint }),
          ),
        );

        const response = await create().expect(status);

        expect(response.body.message).toBe(message);
      },
    );
  });
});
