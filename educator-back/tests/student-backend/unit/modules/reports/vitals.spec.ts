import { AiGateway } from 'src/common/interfaces';
import { ScenariosService } from 'src/student-backend/modules/scenarios/scenarios.service';
import { LoggerService } from 'src/common/services';
import type { ICurrentUser } from 'src/common/interfaces';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
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

import * as os from 'os';
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

const reportUser = { userId: 'user-1', type: 'educator' } as ICurrentUser;

jest.mock('os', () => ({
  ...jest.requireActual('os'),
  userInfo: jest.fn(() => ({ username: 'tester' })),
}));

describe('ReportsService - Vitals Multi-Reading Feature (Full Suite)', () => {
  let service: ReportsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: ScenariosService, useValue: { assertScenarioAssigned: jest.fn() } },
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: createMockSimulationReportRepository() },
        {
          provide: STUDENT_SIMULATION_PROGRESS_REPOSITORY,
          useValue: createMockStudentSimulationProgressRepository(),
        },
        { provide: STUDENT_REPOSITORY, useValue: createMockStudentRepository() },
        {
          provide: TRANSCRIPT_REPOSITORY,
          useValue: { findByBusinessId: jest.fn().mockResolvedValue({ messages: [] }) },
        },
        { provide: UNIT_REPOSITORY, useValue: createMockUnitRepository() },
        {
          provide: SIMULATION_V2_REPOSITORY,
          useValue: {
            findByBusinessId: jest.fn().mockResolvedValue({
              title: 'Acute Coronary Syndrome',
              grading: { maxScore: 100 },
            }),
            findByBusinessIdWithChildrenJoined: jest.fn().mockResolvedValue({
              title: 'Acute Coronary Syndrome',
              grading: { maxScore: 100 },
            }),
          },
        },
        {
          provide: MailRetryService,
          useValue: { enqueue: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: MailService, useValue: { sendMail: jest.fn() } },
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
            get: jest.fn((key: string) =>
              key.startsWith('azureBlob.') ? undefined : 'mock-api-key',
            ),
          },
        },
        {
          provide: MailRetryService,
          useValue: { enqueue: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: MailService, useValue: { sendMail: jest.fn().mockResolvedValue(undefined) } },
        { provide: LifecycleTelemetryService, useValue: {} },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);

    // Mock internal persistence and AI logic to isolate unit tests
    (
      jest.spyOn(
        service as unknown as Record<string, (...args: unknown[]) => unknown>,
        'analyzeWithOpenAI',
      ) as jest.Mock
    ).mockResolvedValue({
      softSkills: { totalScore: 15, totalWeight: 20 },
      technicalSkills: { totalScore: 70, totalWeight: 80 },
      overall: { summary: 'Analysis complete', feedback: 'Good work' },
    });
    (os.userInfo as jest.Mock).mockReturnValue({ username: 'tester' } as unknown as ReturnType<
      typeof os.userInfo
    >);
  });

  // --- TICKET 1: MULTIPLE READINGS PER VITAL ---
  describe('Multiple Vitals Support', () => {
    it('should allow and persist multiple readings for the same vital type', async () => {
      const dto = createMockDto({
        'Heart Rate': [
          { id: 'h1', details: 'Value: 52 bpm', timestamp: '11:58 AM' },
          { id: 'h2', details: 'Value: 60 bpm', timestamp: '11:59 AM' },
        ],
      });

      const result = await service.createReportWithAI(reportUser, dto);

      expect(
        (
          result.summaryByCategory as unknown as Record<
            string,
            Record<string, Array<Record<string, unknown>>>
          >
        ).vitals['Heart Rate'],
      ).toHaveLength(2);
      expect(
        (
          result.summaryByCategory as unknown as Record<
            string,
            Record<string, Array<Record<string, unknown>>>
          >
        ).vitals['Heart Rate'][1].details,
      ).toBe('Value: 60 bpm');
    });
  });

  // --- TICKET 2: DATA MODEL & SCHEMA ---
  describe('Data Model Update', () => {
    it('should store vitals as a list with timestamped objects', async () => {
      const dto = createMockDto({
        'Blood Pressure': [{ id: 'bp1', details: '120/80', timestamp: '2026-01-20T10:00:00Z' }],
      });

      const result = await service.createReportWithAI(reportUser, dto);
      const reading = (
        result.summaryByCategory as unknown as Record<
          string,
          Record<string, Array<Record<string, unknown>>>
        >
      ).vitals['Blood Pressure'][0];

      expect(
        Array.isArray(
          (
            result.summaryByCategory as unknown as Record<
              string,
              Record<string, Array<Record<string, unknown>>>
            >
          ).vitals['Blood Pressure'],
        ),
      ).toBe(true);
      expect(reading).toHaveProperty('timestamp');
      expect(reading).toHaveProperty('details');
    });
  });

  // --- TICKET 3: BACKWARD COMPATIBILITY ---
  describe('Backward Compatibility', () => {
    it('should preserve legacy behavior by not crashing when vitals is a single object', async () => {
      const legacyDto = createMockDto({
        'Heart Rate': {
          id: 'old-1',
          details: 'Value: 72 bpm',
          timestamp: '11:58 AM',
        },
      });

      // Verify the service handles the object without throwing a 500 error
      const result = await service.createReportWithAI(reportUser, legacyDto);
      expect(result).toBeDefined();
      expect(
        (
          result.summaryByCategory as unknown as Record<
            string,
            Record<string, Array<Record<string, unknown>>>
          >
        ).vitals['Heart Rate'],
      ).toBeDefined();
    });
  });
});

/**
 * Helper to generate valid DTO based on the user's submit payload
 */
function createMockDto(vitals: Record<string, unknown>): CreateReportDto {
  return {
    userId: 'user-001',
    studentName: 'kiruthika',
    studentClass: 'MBBS 2nd Year',
    scenarioId: 'scenario-u2-002',
    scenarioTitle: 'Acute Coronary Syndrome',
    transcriptId: '1768890464832-zu2jpayp6',
    summaryByCategory: {
      vitals: vitals,
      history: [],
      actions: [],
      medications: [],
      assessment: [],
      followup: [],
    },
  };
}
