import { AiGateway } from 'src/common/interfaces';
import { ScenariosService } from 'src/student-backend/modules/scenarios/scenarios.service';
import { LoggerService } from 'src/common/services';
import type { ICurrentUser } from 'src/common/interfaces';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ReportsService } from '@/modules/reports/reports.service';
import { ConfigService } from '@nestjs/config';
import { ActionsInterventionsService } from '@/modules/reports/actions-interventions.service';
import { PpePrivacyService } from '@/modules/reports/ppe-privacy.service';
import { ClinicalDocumentationService } from '@/modules/reports/clinical-documentation.service';
import { CommunicationService } from '@/modules/reports/communication.service';
import { TimelineTimingService } from '@/modules/reports/timeline-timing.service';
import { SequencingService } from '@/modules/reports/sequencing.service';
import { LifecycleTelemetryService } from '@/modules/telemetry/lifecycle-telemetry.service';
import { MailService } from 'src/mail/mail.service';
import { MailRetryService } from 'src/mail/mail-retry.service';
import type { CreateReportDto } from '@/modules/reports/dto/create-report.dto';
import type { AttemptRowInput } from 'src/common/interfaces';

import { SimulationProgressStatus } from 'src/common/constants';
import {
  SIMULATION_REPORT_REPOSITORY,
  STUDENT_SIMULATION_PROGRESS_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  STUDENT_REPOSITORY,
  TRANSCRIPT_REPOSITORY,
  UNIT_REPOSITORY,
} from 'src/database/tokens';
import {
  createMockSimulationReportRepository,
  createMockStudentRepository,
  createMockUnitRepository,
  createMockStudentSimulationProgressRepository,
} from '../../common/utils/mock-factory';

const studentUser = { userId: 'REP-PH9N', studentId: 'student-uuid-1' } as ICurrentUser;

function createDto(transcriptId = 'transcript-1'): CreateReportDto {
  return {
    userId: 'REP-PH9N',
    studentName: 'Ada',
    scenarioId: 'scenario-1',
    scenarioTitle: 'Acute Coronary Syndrome',
    transcriptId,
    mode: 'Practice',
    summaryByCategory: { vitals: {}, history: [], actions: [] },
  } as unknown as CreateReportDto;
}

function storedRow(transcriptId: string, reportId: string): Record<string, unknown> {
  return {
    id: 'row-stored',
    transcriptId,
    reportId,
    score: 42,
  };
}

describe('ReportsService.createReportWithAI — Attempt persistence', () => {
  let service: ReportsService;
  let reportRepo: ReturnType<typeof createMockSimulationReportRepository>;
  let studentRepo: ReturnType<typeof createMockStudentRepository>;
  let progressRepo: ReturnType<typeof createMockStudentSimulationProgressRepository>;
  let analyze: jest.Mock;

  beforeEach(async () => {
    reportRepo = createMockSimulationReportRepository();
    studentRepo = createMockStudentRepository();
    progressRepo = createMockStudentSimulationProgressRepository();
    const module = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: ScenariosService, useValue: { assertScenarioAssigned: jest.fn() } },
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: reportRepo },
        {
          provide: STUDENT_SIMULATION_PROGRESS_REPOSITORY,
          useValue: progressRepo,
        },
        { provide: STUDENT_REPOSITORY, useValue: studentRepo },
        {
          provide: TRANSCRIPT_REPOSITORY,
          useValue: { findByBusinessId: jest.fn().mockResolvedValue({ messages: [] }) },
        },
        { provide: UNIT_REPOSITORY, useValue: createMockUnitRepository() },
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
        {
          provide: LoggerService,
          useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
        },
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
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => (key.startsWith('azureBlob.') ? undefined : 'mock-key')),
          },
        },
        { provide: LifecycleTelemetryService, useValue: {} },
      ],
    }).compile();

    service = module.get(ReportsService);
    analyze = jest
      .spyOn(
        service as unknown as Record<string, (...args: unknown[]) => unknown>,
        'analyzeWithOpenAI',
      )
      .mockResolvedValue({
        softSkills: { totalScore: 15, totalWeight: 20 },
        technicalSkills: { totalScore: 70, totalWeight: 80 },
        overall: { summary: 'Analysis complete', feedback: 'Good work' },
      }) as unknown as jest.Mock;
  });

  it('grades a new transcript once and inserts one row built from the typed columns, without setting report_data', async () => {
    const result = await service.createReportWithAI(studentUser, createDto());

    expect(analyze).toHaveBeenCalledTimes(1);
    expect(progressRepo.recordSubmittedAttempt).toHaveBeenCalledTimes(1);
    const row = progressRepo.recordSubmittedAttempt.mock.calls[0][0].attempt as AttemptRowInput;
    expect(row.studentId).toBe('student-uuid-1');
    expect(row.transcriptId).toBe('transcript-1');
    expect(row.reportId).toEqual(expect.any(String));
    expect(row).not.toHaveProperty('reportData');
    expect(row.scenarioId).toBe('scenario-1');
    expect(row.viewedAt).toBeNull();
    expect(result).toEqual(
      expect.objectContaining({
        id: row.reportId,
        transcriptId: 'transcript-1',
        scenarioId: 'scenario-1',
      }),
    );
  });

  it('returns the stored Attempt for an existing transcript with no AI call and no insert', async () => {
    const stored = storedRow('transcript-1', 'report-old');
    reportRepo.findByTranscriptId.mockResolvedValue(stored);

    const result = await service.createReportWithAI(studentUser, createDto());

    expect(reportRepo.findByTranscriptId).toHaveBeenCalledWith('transcript-1');
    expect(result).toEqual(expect.objectContaining({ id: 'report-old', score: 42 }));
    expect(analyze).not.toHaveBeenCalled();
    expect(progressRepo.recordSubmittedAttempt).not.toHaveBeenCalled();
  });

  it('returns the Attempt the transaction reports for a transcript a concurrent request recorded first', async () => {
    const winner = storedRow('transcript-1', 'report-winner');
    progressRepo.recordSubmittedAttempt.mockResolvedValue({ report: winner, recorded: false });

    const result = await service.createReportWithAI(studentUser, createDto());

    expect(result).toEqual(expect.objectContaining({ id: 'report-winner' }));
  });

  it('records a repeat Attempt (new transcript, same student and scenario) as a second call', async () => {
    await service.createReportWithAI(studentUser, createDto('transcript-1'));
    await service.createReportWithAI(studentUser, createDto('transcript-2'));

    expect(progressRepo.recordSubmittedAttempt).toHaveBeenCalledTimes(2);
    const transcripts = progressRepo.recordSubmittedAttempt.mock.calls.map(
      ([input]) => (input.attempt as AttemptRowInput).transcriptId,
    );
    expect(transcripts).toEqual(['transcript-1', 'transcript-2']);
  });

  it('propagates a repository error from the retry lookup', async () => {
    reportRepo.findByTranscriptId.mockRejectedValue(new Error('db down'));

    await expect(service.createReportWithAI(studentUser, createDto())).rejects.toThrow('db down');
    expect(analyze).not.toHaveBeenCalled();
  });

  it('propagates a storage error unchanged, not disguised as an AI failure', async () => {
    const conflict = new ConflictException('limit');
    progressRepo.recordSubmittedAttempt.mockRejectedValue(conflict);

    await expect(service.createReportWithAI(studentUser, createDto())).rejects.toBe(conflict);
  });

  it('fails before grading when the token carries no student identity', async () => {
    await expect(
      service.createReportWithAI({} as ICurrentUser, createDto()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(analyze).not.toHaveBeenCalled();
  });

  describe('Simulation Progress pre-check', () => {
    const assessmentDto = (transcriptId = 'transcript-4'): CreateReportDto =>
      ({ ...createDto(transcriptId), mode: 'Assessment' }) as CreateReportDto;
    const progress = (
      status: SimulationProgressStatus,
      assessmentAttemptsCount: number,
    ): Record<string, unknown> => ({ status, assessmentAttemptsCount });

    it('returns the most recent Attempt with no AI call and no write once the Assessment limit is reached', async () => {
      progressRepo.findByStudentAndScenarioId.mockResolvedValue(
        progress(SimulationProgressStatus.COMPLETED, 3),
      );
      reportRepo.findLatestAttemptByStudentAndScenario.mockResolvedValue(
        storedRow('transcript-3', 'report-3'),
      );

      const result = await service.createReportWithAI(studentUser, assessmentDto());

      expect(progressRepo.findByStudentAndScenarioId).toHaveBeenCalledWith(
        'student-uuid-1',
        'scenario-1',
      );
      expect(result).toEqual(expect.objectContaining({ id: 'report-3' }));
      expect(analyze).not.toHaveBeenCalled();
      expect(progressRepo.recordSubmittedAttempt).not.toHaveBeenCalled();
    });

    it('returns the most recent Attempt for a Forfeited Simulation, in Practice mode too', async () => {
      progressRepo.findByStudentAndScenarioId.mockResolvedValue(
        progress(SimulationProgressStatus.FORFEITED, 1),
      );
      reportRepo.findLatestAttemptByStudentAndScenario.mockResolvedValue(
        storedRow('transcript-1', 'report-1'),
      );

      const result = await service.createReportWithAI(studentUser, createDto());

      expect(result).toEqual(expect.objectContaining({ id: 'report-1' }));
      expect(analyze).not.toHaveBeenCalled();
    });

    it('grades and records while under the limit', async () => {
      progressRepo.findByStudentAndScenarioId.mockResolvedValue(
        progress(SimulationProgressStatus.IN_PROGRESS, 2),
      );

      await service.createReportWithAI(studentUser, assessmentDto());

      expect(analyze).toHaveBeenCalledTimes(1);
      expect(progressRepo.recordSubmittedAttempt).toHaveBeenCalledTimes(1);
    });

    it('lets Practice through when the Assessment limit is reached but the Simulation is still open', async () => {
      progressRepo.findByStudentAndScenarioId.mockResolvedValue(
        progress(SimulationProgressStatus.IN_PROGRESS, 3),
      );

      await service.createReportWithAI(studentUser, createDto());

      expect(progressRepo.recordSubmittedAttempt).toHaveBeenCalledTimes(1);
    });

    it('grades and records when the student has no progress row yet', async () => {
      await service.createReportWithAI(studentUser, assessmentDto());

      expect(progressRepo.recordSubmittedAttempt).toHaveBeenCalledTimes(1);
    });
  });
});
