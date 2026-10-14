import { AiGateway } from 'src/common/interfaces';
import { ScenariosService } from 'src/student-backend/modules/scenarios/scenarios.service';
import { LoggerService } from 'src/common/services';
import { Test } from '@nestjs/testing';
import {
  ReportsService,
  normalize,
  recomputeCommunicationScore,
} from '@/modules/reports/reports.service';
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
import {
  SIMULATION_V2_REPOSITORY,
  TRANSCRIPT_REPOSITORY,
  UNIT_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  STUDENT_SIMULATION_PROGRESS_REPOSITORY,
  STUDENT_REPOSITORY,
} from 'src/database/tokens';
import {
  createMockUnitRepository,
  createMockSimulationReportRepository,
  createMockStudentRepository,
  createMockStudentSimulationProgressRepository,
} from '../../common/utils/mock-factory';

describe('ReportsService - Communication Scoring', () => {
  let service: ReportsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: ScenariosService, useValue: { assertScenarioAssigned: jest.fn() } },
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: createMockSimulationReportRepository() },
        {
          provide: STUDENT_SIMULATION_PROGRESS_REPOSITORY,
          useValue: createMockStudentSimulationProgressRepository(),
        },
        { provide: STUDENT_REPOSITORY, useValue: createMockStudentRepository() },
        { provide: TRANSCRIPT_REPOSITORY, useValue: { findByBusinessId: jest.fn() } },
        { provide: UNIT_REPOSITORY, useValue: createMockUnitRepository() },
        { provide: SIMULATION_V2_REPOSITORY, useValue: { findByBusinessId: jest.fn() } },
        {
          provide: MailRetryService,
          useValue: { enqueue: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: MailService, useValue: { sendMail: jest.fn() } },
        ActionsInterventionsService,
        PpePrivacyService,
        ClinicalDocumentationService,
        CommunicationService,
        TimelineTimingService,
        {
          provide: SequencingService,
          useValue: {
            evaluateSequencingPrioritization: jest.fn().mockResolvedValue({
              passed: true,
              parentResults: [],
              violations: [],
            }),
          },
        },
        { provide: ConfigService, useValue: { get: jest.fn(() => undefined) } },
        {
          provide: AiGateway,
          useValue: {
            complete: jest.fn(),
            completeJson: jest.fn(),
            isConfigured: jest.fn().mockReturnValue(false),
          },
        },
        {
          provide: MailRetryService,
          useValue: { enqueue: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: MailService, useValue: { sendMail: jest.fn().mockResolvedValue(undefined) } },
        { provide: LifecycleTelemetryService, useValue: {} },
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

    service = moduleRef.get(ReportsService);
  });

  describe('recomputeCommunicationScore', () => {
    const mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      fatal: jest.fn(),
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('computes a deterministic score from valid + complete criteriaResults', () => {
      const item = {
        subCategory: 'communication',
        score: 999,
        criteriaResults: [{ passed: true }, { passed: true }, { passed: false }],
      };

      recomputeCommunicationScore(item, 3, mockLogger as never);

      expect(item.score).toBe(67);
      expect(mockLogger.debug).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('does not retain the AI top-level score when criteriaResults is empty', () => {
      const item = {
        subCategory: 'communication',
        score: 72,
        criteriaResults: [] as Array<{ passed?: boolean }>,
      };

      recomputeCommunicationScore(item, 3, mockLogger as never);

      expect(item.score).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'communication-criteria-results-missing',
          metadata: expect.objectContaining({ aiTopLineScore: 72 }),
        }),
      );
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('does not retain the AI top-level score when criteriaResults is missing', () => {
      const item = { subCategory: 'communication', score: 88 } as {
        subCategory: string;
        score: number | null;
        criteriaResults?: Array<{ passed?: boolean }>;
      };

      recomputeCommunicationScore(item, 3, mockLogger as never);

      expect(item.score).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    });

    it('treats a non-array criteriaResults (partial/truncated AI response) as missing', () => {
      const item = {
        subCategory: 'communication',
        score: 50,
        criteriaResults: 'not-an-array' as unknown as Array<{ passed?: boolean }>,
      };

      recomputeCommunicationScore(item, 3, mockLogger as never);

      expect(item.score).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    });

    it('falls back to criteriaResults.length as denominator when no enabled criteria are configured', () => {
      const item = {
        subCategory: 'communication',
        score: 0,
        criteriaResults: [{ passed: true }, { passed: true }],
      };

      recomputeCommunicationScore(item, 0, mockLogger as never);

      expect(item.score).toBe(100);
    });
  });

  describe('normalize', () => {
    it('should convert text to lowercase', () => {
      expect(normalize('HELLO World')).toBe('hello world');
    });

    it('should handle empty string', () => {
      expect(normalize('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(normalize(null as unknown as string)).toBe('');
      expect(normalize(undefined as unknown as string)).toBe('');
    });
  });
});
