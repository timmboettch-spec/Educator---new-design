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

describe('ReportsService - Multiple Vitals Support', () => {
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
            findByBusinessId: jest.fn().mockResolvedValue({ title: 'Test', grading: {} }),
            findByBusinessIdWithChildrenJoined: jest
              .fn()
              .mockResolvedValue({ title: 'Test', grading: {} }),
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
            get: jest.fn((key: string) => (key.startsWith('azureBlob.') ? undefined : 'key')),
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
    (
      jest.spyOn(
        service as unknown as Record<string, (...args: unknown[]) => unknown>,
        'analyzeWithOpenAI',
      ) as jest.Mock
    ).mockResolvedValue({ overall: {} });
  });

  it('should allow and persist multiple readings for the same vital type', async () => {
    const dto = {
      transcriptId: '123',
      summaryByCategory: {
        vitals: {
          'Heart Rate': [
            { id: 'h1', details: '52 bpm', timestamp: '11:58 AM' },
            { id: 'h2', details: '60 bpm', timestamp: '11:59 AM' },
          ],
        },
      },
    };

    const result = await service.createReportWithAI(reportUser, dto as unknown as CreateReportDto);

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
    ).toBe('60 bpm');
  });
});
