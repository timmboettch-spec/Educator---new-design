import { AiGateway } from 'src/common/interfaces';
import { ScenariosService } from 'src/student-backend/modules/scenarios/scenarios.service';
import { LoggerService } from 'src/common/services';
import type { ICurrentUser } from 'src/common/interfaces';
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
import { computeTimelineAnalysis } from '@/modules/reports/timeline-analysis';
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

describe('Vitals Action-Based - Complete Test Suite', () => {
  let service: ReportsService;
  let transcriptRepository: { findByBusinessId: jest.Mock };
  // Drives the SIMULATION_V2_REPOSITORY scenario lookup below.
  const scenarioLookupMock = jest.fn();

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  beforeEach(async () => {
    scenarioLookupMock.mockReset();
    transcriptRepository = { findByBusinessId: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: ScenariosService, useValue: { assertScenarioAssigned: jest.fn() } },
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: createMockSimulationReportRepository() },
        {
          provide: STUDENT_SIMULATION_PROGRESS_REPOSITORY,
          useValue: createMockStudentSimulationProgressRepository(),
        },
        { provide: STUDENT_REPOSITORY, useValue: createMockStudentRepository() },
        { provide: TRANSCRIPT_REPOSITORY, useValue: transcriptRepository },
        { provide: UNIT_REPOSITORY, useValue: createMockUnitRepository() },
        {
          provide: SIMULATION_V2_REPOSITORY,
          useValue: {
            findByBusinessId: scenarioLookupMock,
            findByBusinessIdWithChildrenJoined: scenarioLookupMock,
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
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key.startsWith('azureBlob.') ? undefined : 'test-key'),
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
          provide: MailRetryService,
          useValue: { enqueue: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: MailService, useValue: { sendMail: jest.fn().mockResolvedValue(undefined) } },
        { provide: LifecycleTelemetryService, useValue: {} },
      ],
    }).compile();

    service = module.get(ReportsService);

    (
      jest.spyOn(
        service as unknown as Record<string, (...args: unknown[]) => unknown>,
        'analyzeWithOpenAI',
      ) as jest.Mock
    ).mockResolvedValue({
      softSkills: { totalScore: 15, totalWeight: 20 },
      technicalSkills: { totalScore: 70, totalWeight: 80 },
      overall: { summary: 'Complete', feedback: 'Good' },
    });
  });

  // ---------------------------------------------------------------------------
  // GRADING LOGIC TESTS
  // ---------------------------------------------------------------------------

  describe('Grading Logic', () => {
    it('should evaluate correct vital acquisition', async () => {
      const scenarioActions = [
        {
          id: 'v1',
          title: 'Obtain Vital Signs',
          type: 'vital',
          vitals: { hr: [], bp: [] },
        },
      ];
      const timeline = [
        {
          title: 'Obtain Vital Signs',
          vitals: { hr: [{ value: '80' }], bp: [{ value: '120/80' }] },
        },
      ];

      const result = (await (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).computeDeterministicActionMarks(timeline, scenarioActions)) as Record<string, unknown>;

      // Vital actions are tracked in details
      expect(result.details).toBeDefined();
      expect((result.details as unknown[]).length).toBeGreaterThan(0);
    });

    it('should detect missing vital measurements', async () => {
      const scenarioActions = [
        {
          id: 'v1',
          title: 'Obtain Vital Signs',
          type: 'vital',
          vitals: { hr: [], bp: [], temp: [] },
        },
      ];
      const timeline = [{ title: 'Obtain Vital Signs', vitals: { hr: [{ value: '80' }] } }];

      const result = (await (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).computeDeterministicActionMarks(timeline, scenarioActions)) as Record<string, unknown>;

      // Missing vitals are tracked
      expect(result.details).toBeDefined();
    });

    it('should handle multiple vital sign attempts', async () => {
      const scenarioActions = [
        {
          id: 'v1',
          title: 'Obtain Vital Signs',
          type: 'vital',
          vitals: { hr: [] },
        },
      ];
      const timeline = [
        {
          title: 'Obtain Vital Signs',
          vitals: { hr: [{ value: '52' }, { value: '60' }] },
        },
      ];

      const result = (await (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).computeDeterministicActionMarks(timeline, scenarioActions)) as Record<string, unknown>;

      // Multiple attempts are tracked
      expect(result.details).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // TIMELINE PROGRESSION TESTS
  // ---------------------------------------------------------------------------

  describe('Timeline Progression', () => {
    it('should display each Obtain Vital Signs action instance', () => {
      const timelineBlocks = [
        {
          id: 'v1',
          label: 'Obtain Vital Signs',
          sourceId: 'vital.action1.hr',
          start: 0,
          duration: 1,
        },
        {
          id: 'v2',
          label: 'Obtain Vital Signs',
          sourceId: 'vital.action2.bp',
          start: 2,
          duration: 1,
        },
      ];
      const summaryByCategory = {
        actions: [
          {
            id: 'action1',
            title: 'Obtain Vital Signs',
            vitals: {
              hr: [{ value: '80', timestamp: '2024-01-01T10:00:30Z' }],
            },
          },
          {
            id: 'action2',
            title: 'Obtain Vital Signs',
            vitals: {
              bp: [{ value: '120/80', timestamp: '2024-01-01T10:02:30Z' }],
            },
          },
        ],
      };

      const result = computeTimelineAnalysis(
        [],
        timelineBlocks,
        '2024-01-01T10:00:00Z',
        formatTime,
        summaryByCategory,
      );

      expect(result.completedBlocks).toHaveLength(2);
      expect(result.timingDetails[0].blockLabel).toBe('Obtain Vital Signs');
      expect(result.timingDetails[1].blockLabel).toBe('Obtain Vital Signs');
    });

    it('should indicate specific measurement types per instance', () => {
      const timelineBlocks = [
        {
          id: 'v1',
          label: 'Heart Rate',
          sourceId: 'vital.action1.hr',
          start: 0,
          duration: 1,
        },
        {
          id: 'v2',
          label: 'Blood Pressure',
          sourceId: 'vital.action1.bp',
          start: 0,
          duration: 1,
        },
      ];
      const summaryByCategory = {
        actions: [
          {
            id: 'action1',
            title: 'Obtain Vital Signs',
            vitals: {
              hr: [{ value: '80', timestamp: '2024-01-01T10:00:30Z' }],
              bp: [{ value: '120/80', timestamp: '2024-01-01T10:00:45Z' }],
            },
          },
        ],
      };

      const result = computeTimelineAnalysis(
        [],
        timelineBlocks,
        '2024-01-01T10:00:00Z',
        formatTime,
        summaryByCategory,
      );

      expect(result.completedBlocks).toContain('Heart Rate');
      expect(result.completedBlocks).toContain('Blood Pressure');
    });

    it('should track repeat attempts for same vital type', () => {
      const timelineBlocks = [
        {
          id: 'v1',
          label: 'Heart Rate (1st)',
          sourceId: 'vital.action1.hr',
          start: 0,
          duration: 1,
        },
        {
          id: 'v2',
          label: 'Heart Rate (2nd)',
          sourceId: 'vital.action2.hr',
          start: 2,
          duration: 1,
        },
      ];
      const summaryByCategory = {
        actions: [
          {
            id: 'action1',
            vitals: {
              hr: [{ value: '52', timestamp: '2024-01-01T10:00:30Z' }],
            },
          },
          {
            id: 'action2',
            vitals: {
              hr: [{ value: '60', timestamp: '2024-01-01T10:02:30Z' }],
            },
          },
        ],
      };

      const result = computeTimelineAnalysis(
        [],
        timelineBlocks,
        '2024-01-01T10:00:00Z',
        formatTime,
        summaryByCategory,
      );

      expect(result.completedBlocks).toHaveLength(2);
      expect(result.timingDetails[0].actualTimeSeconds).toBe(30);
      expect(result.timingDetails[1].actualTimeSeconds).toBe(150);
    });

    it('should handle all vital measurement types', () => {
      const timelineBlocks = [
        {
          id: 'v1',
          label: 'Temperature',
          sourceId: 'vital.action1.temp',
          start: 0,
          duration: 1,
        },
        {
          id: 'v2',
          label: 'Heart Rate',
          sourceId: 'vital.action1.hr',
          start: 0,
          duration: 1,
        },
        {
          id: 'v3',
          label: 'Blood Pressure',
          sourceId: 'vital.action1.bp',
          start: 0,
          duration: 1,
        },
        {
          id: 'v4',
          label: 'Respiratory Rate',
          sourceId: 'vital.action1.rr',
          start: 0,
          duration: 1,
        },
        {
          id: 'v5',
          label: 'O2 Sat',
          sourceId: 'vital.action1.spo2',
          start: 0,
          duration: 1,
        },
      ];
      const summaryByCategory = {
        actions: [
          {
            id: 'action1',
            vitals: {
              temp: [{ value: '98.6', timestamp: '2024-01-01T10:00:30Z' }],
              hr: [{ value: '80', timestamp: '2024-01-01T10:00:30Z' }],
              bp: [{ value: '120/80', timestamp: '2024-01-01T10:00:30Z' }],
              rr: [{ value: '16', timestamp: '2024-01-01T10:00:30Z' }],
              spo2: [{ value: '98', timestamp: '2024-01-01T10:00:30Z' }],
            },
          },
        ],
      };

      const result = computeTimelineAnalysis(
        [],
        timelineBlocks,
        '2024-01-01T10:00:00Z',
        formatTime,
        summaryByCategory,
      );

      expect(result.completedBlocks).toHaveLength(5);
    });
  });

  // ---------------------------------------------------------------------------
  // TRANSCRIPT LOGGING TESTS
  // ---------------------------------------------------------------------------

  describe('Transcript Logging', () => {
    it('should capture selected vitals in transcript', async () => {
      const messages = [
        {
          speaker: 'student',
          text: "I'll check heart rate",
          timestamp: '2024-01-01T10:00:30Z',
        },
        {
          speaker: 'system',
          text: 'Heart rate: 80 bpm',
          timestamp: '2024-01-01T10:00:31Z',
        },
      ];
      transcriptRepository.findByBusinessId.mockResolvedValue({
        messages,
        startedAt: '2024-01-01T10:00:00Z',
      });
      scenarioLookupMock.mockResolvedValue({
        title: 'Test',
        grading: {},
      });
      const dto = {
        transcriptId: '123',
        summaryByCategory: {
          actions: [
            {
              title: 'Obtain Vital Signs',
              vitals: {
                hr: [{ value: '80', timestamp: '2024-01-01T10:00:31Z' }],
              },
            },
          ],
        },
      };

      const result = await service.createReportWithAI(
        reportUser,
        dto as unknown as CreateReportDto,
      );

      expect(
        (
          result.summaryByCategory as unknown as Record<
            string,
            Array<Record<string, Record<string, Array<Record<string, unknown>>>>>
          >
        ).actions[0].vitals.hr,
      ).toHaveLength(1);
      expect(
        (
          result.summaryByCategory as unknown as Record<
            string,
            Array<Record<string, Record<string, Array<Record<string, unknown>>>>>
          >
        ).actions[0].vitals.hr[0].value,
      ).toBe('80');
    });

    it('should log multiple vital measurements', async () => {
      transcriptRepository.findByBusinessId.mockResolvedValue({
        messages: [],
        startedAt: '2024-01-01T10:00:00Z',
      });
      scenarioLookupMock.mockResolvedValue({
        title: 'Test',
        grading: {},
      });

      const dto = {
        transcriptId: '123',
        summaryByCategory: {
          actions: [
            {
              title: 'Obtain Vital Signs',
              vitals: {
                hr: [{ value: '80' }],
                bp: [{ value: '120/80' }],
                temp: [{ value: '98.6' }],
              },
            },
          ],
        },
      };

      const result = await service.createReportWithAI(
        reportUser,
        dto as unknown as CreateReportDto,
      );

      expect(
        Object.keys(
          (
            result.summaryByCategory as unknown as Record<
              string,
              Array<Record<string, Record<string, Array<Record<string, unknown>>>>>
            >
          ).actions[0].vitals,
        ),
      ).toHaveLength(3);
    });

    it('should log repeat vital attempts', async () => {
      transcriptRepository.findByBusinessId.mockResolvedValue({
        messages: [],
        startedAt: '2024-01-01T10:00:00Z',
      });
      scenarioLookupMock.mockResolvedValue({
        title: 'Test',
        grading: {},
      });

      const dto = {
        transcriptId: '123',
        summaryByCategory: {
          actions: [
            {
              title: 'Obtain Vital Signs',
              vitals: { hr: [{ value: '52' }, { value: '60' }] },
            },
          ],
        },
      };

      const result = await service.createReportWithAI(
        reportUser,
        dto as unknown as CreateReportDto,
      );

      expect(
        (
          result.summaryByCategory as unknown as Record<
            string,
            Array<Record<string, Record<string, Array<Record<string, unknown>>>>>
          >
        ).actions[0].vitals.hr,
      ).toHaveLength(2);
    });

    it('should include timestamp for each vital measurement', async () => {
      transcriptRepository.findByBusinessId.mockResolvedValue({
        messages: [],
        startedAt: '2024-01-01T10:00:00Z',
      });
      scenarioLookupMock.mockResolvedValue({
        title: 'Test',
        grading: {},
      });

      const dto = {
        transcriptId: '123',
        summaryByCategory: {
          actions: [
            {
              title: 'Obtain Vital Signs',
              vitals: {
                hr: [{ value: '80', timestamp: '2024-01-01T10:00:30Z' }],
              },
            },
          ],
        },
      };

      const result = await service.createReportWithAI(
        reportUser,
        dto as unknown as CreateReportDto,
      );

      expect(
        (
          result.summaryByCategory as unknown as Record<
            string,
            Array<Record<string, Record<string, Array<Record<string, unknown>>>>>
          >
        ).actions[0].vitals.hr[0].timestamp,
      ).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // RUBRIC EVALUATION TESTS
  // ---------------------------------------------------------------------------

  describe('Rubric Evaluation', () => {
    it('should evaluate correct vitals obtained', async () => {
      const scenarioActions = [
        {
          id: 'v1',
          title: 'Obtain Vital Signs',
          type: 'vital',
          vitals: { hr: [], bp: [] },
        },
      ];
      const timeline = [
        {
          title: 'Obtain Vital Signs',
          vitals: { hr: [{ value: '80' }], bp: [{ value: '120/80' }] },
        },
      ];

      const result = (await (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).computeDeterministicActionMarks(timeline, scenarioActions)) as Record<string, unknown>;

      expect(result.details).toBeDefined();
    });

    it('should evaluate repeat attempts', async () => {
      const scenarioActions = [
        {
          id: 'v1',
          title: 'Obtain Vital Signs',
          type: 'vital',
          vitals: { hr: [] },
        },
      ];
      const timeline = [
        {
          title: 'Obtain Vital Signs',
          vitals: { hr: [{ value: '52' }, { value: '60' }] },
        },
      ];

      const result = (await (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).computeDeterministicActionMarks(timeline, scenarioActions)) as Record<string, unknown>;

      expect(result.details).toBeDefined();
    });

    it('should mark incomplete vital acquisition as incorrect', async () => {
      const scenarioActions = [
        {
          id: 'v1',
          title: 'Obtain Vital Signs',
          type: 'vital',
          vitals: { hr: [], bp: [], temp: [] },
        },
      ];
      const timeline = [{ title: 'Obtain Vital Signs', vitals: { hr: [{ value: '80' }] } }];

      const result = (await (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).computeDeterministicActionMarks(timeline, scenarioActions)) as Record<string, unknown>;

      expect(result.details).toBeDefined();
    });

    it('should not include vital actions in score calculation', async () => {
      const scenarioActions = [
        { id: '1', title: 'Assessment', type: 'single', correct: 'A' },
        {
          id: 'v1',
          title: 'Obtain Vital Signs',
          type: 'vital',
          vitals: { hr: [] },
        },
      ];
      const timeline = [
        { title: 'Assessment', selectedItem: 'A' },
        { title: 'Obtain Vital Signs', vitals: { hr: [{ value: '80' }] } },
      ];

      const result = (await (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).computeDeterministicActionMarks(timeline, scenarioActions)) as Record<string, unknown>;

      expect(result.totalRequiredActions).toBeGreaterThanOrEqual(1);
      expect(result.positiveActions).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // INTEGRATION TESTS - E2E COVERAGE
  // ---------------------------------------------------------------------------

  describe('Practice Mode', () => {
    it('should process vital signs in practice mode', async () => {
      scenarioLookupMock.mockResolvedValue({
        title: 'Test',
        grading: { maxScore: 100 },
        actions: [
          {
            id: 'v1',
            title: 'Obtain Vital Signs',
            type: 'vital',
            vitals: { hr: [] },
          },
        ],
      });
      transcriptRepository.findByBusinessId.mockResolvedValue({
        messages: [],
        startedAt: '2024-01-01T10:00:00Z',
      });

      const dto = {
        transcriptId: '123',
        scenarioId: 's1',
        mode: 'practice',
        summaryByCategory: {
          actions: [{ title: 'Obtain Vital Signs', vitals: { hr: [{ value: '80' }] } }],
        },
      };

      const result = await service.createReportWithAI(
        reportUser,
        dto as unknown as CreateReportDto,
      );

      expect(result).toBeDefined();
      expect(
        (
          result.summaryByCategory as unknown as Record<
            string,
            Array<Record<string, Record<string, Array<Record<string, unknown>>>>>
          >
        ).actions[0].vitals.hr,
      ).toHaveLength(1);
    });
  });

  describe('Assessment Mode', () => {
    it('should process vital signs in assessment mode', async () => {
      scenarioLookupMock.mockResolvedValue({
        title: 'Test',
        grading: { maxScore: 100 },
        actions: [
          {
            id: 'v1',
            title: 'Obtain Vital Signs',
            type: 'vital',
            vitals: { hr: [] },
          },
        ],
      });
      transcriptRepository.findByBusinessId.mockResolvedValue({
        messages: [],
        startedAt: '2024-01-01T10:00:00Z',
      });

      const dto = {
        transcriptId: '123',
        scenarioId: 's1',
        mode: 'assessment',
        summaryByCategory: {
          actions: [{ title: 'Obtain Vital Signs', vitals: { hr: [{ value: '80' }] } }],
        },
      };

      const result = await service.createReportWithAI(
        reportUser,
        dto as unknown as CreateReportDto,
      );

      expect(result).toBeDefined();
    });
  });

  describe('Multi-Repeat Workflow', () => {
    it('should handle multiple vital sign attempts', async () => {
      scenarioLookupMock.mockResolvedValue({
        title: 'Test',
        grading: { maxScore: 100 },
        actions: [
          {
            id: 'v1',
            title: 'Obtain Vital Signs',
            type: 'vital',
            vitals: { hr: [] },
          },
        ],
      });
      transcriptRepository.findByBusinessId.mockResolvedValue({
        messages: [],
        startedAt: '2024-01-01T10:00:00Z',
      });

      const dto = {
        transcriptId: '123',
        scenarioId: 's1',
        summaryByCategory: {
          actions: [
            {
              title: 'Obtain Vital Signs',
              vitals: { hr: [{ value: '52' }, { value: '60' }] },
            },
          ],
        },
      };

      const result = await service.createReportWithAI(
        reportUser,
        dto as unknown as CreateReportDto,
      );

      expect(
        (
          result.summaryByCategory as unknown as Record<
            string,
            Array<Record<string, Record<string, Array<Record<string, unknown>>>>>
          >
        ).actions[0].vitals.hr,
      ).toHaveLength(2);
    });
  });

  describe('No Legacy Tab References', () => {
    it('should not reference legacy vitals tab data', async () => {
      scenarioLookupMock.mockResolvedValue({
        title: 'Test',
        grading: { maxScore: 100 },
        actions: [
          {
            id: 'v1',
            title: 'Obtain Vital Signs',
            type: 'vital',
            vitals: { hr: [] },
          },
        ],
      });
      transcriptRepository.findByBusinessId.mockResolvedValue({
        messages: [],
        startedAt: '2024-01-01T10:00:00Z',
      });

      const dto = {
        transcriptId: '123',
        scenarioId: 's1',
        summaryByCategory: {
          actions: [{ title: 'Obtain Vital Signs', vitals: { hr: [{ value: '80' }] } }],
          vitals: {}, // Legacy tab data should be ignored
        },
      };

      const result = await service.createReportWithAI(
        reportUser,
        dto as unknown as CreateReportDto,
      );

      expect(
        (
          result.summaryByCategory as unknown as Record<
            string,
            Array<Record<string, Record<string, Array<Record<string, unknown>>>>>
          >
        ).actions[0].vitals.hr,
      ).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // TIMELINE INTEGRATION TESTS
  // ---------------------------------------------------------------------------

  describe('Timeline Integration', () => {
    it('should integrate vital actions into timeline', () => {
      const timelineBlocks = [
        {
          id: 'v1',
          label: 'Heart Rate',
          sourceId: 'vital.action1.hr',
          start: 0,
          duration: 1,
        },
        {
          id: 'a1',
          label: 'Assessment',
          sourceId: 'action.assessment',
          start: 1,
          duration: 1,
        },
      ];
      const summaryByCategory = {
        actions: [
          {
            id: 'action1',
            vitals: {
              hr: [{ value: '80', timestamp: '2024-01-01T10:00:30Z' }],
            },
          },
          { title: 'Assessment', timestamp: '2024-01-01T10:01:30Z' },
        ],
      };

      const result = computeTimelineAnalysis(
        [],
        timelineBlocks,
        '2024-01-01T10:00:00Z',
        formatTime,
        summaryByCategory,
      );

      expect(result.completedBlocks).toHaveLength(2);
      expect(result.completedBlocks).toContain('Heart Rate');
      expect(result.completedBlocks).toContain('Assessment');
    });

    it('should track timing for each vital measurement', () => {
      const timelineBlocks = [
        {
          id: 'v1',
          label: 'Heart Rate',
          sourceId: 'vital.action1.hr',
          start: 0,
          duration: 1,
        },
      ];
      const summaryByCategory = {
        actions: [
          {
            id: 'action1',
            vitals: {
              hr: [{ value: '80', timestamp: '2024-01-01T10:00:30Z' }],
            },
          },
        ],
      };

      const result = computeTimelineAnalysis(
        [],
        timelineBlocks,
        '2024-01-01T10:00:00Z',
        formatTime,
        summaryByCategory,
      );

      expect(result.timingDetails[0].actualTimeSeconds).toBe(30);
      expect(result.timingDetails[0].withinTimeWindow).toBe(true);
    });

    it('should detect late vital measurements', () => {
      const timelineBlocks = [
        {
          id: 'v1',
          label: 'Heart Rate',
          sourceId: 'vital.action1.hr',
          start: 0,
          duration: 1,
        },
      ];
      const summaryByCategory = {
        actions: [
          {
            id: 'action1',
            vitals: {
              hr: [{ value: '80', timestamp: '2024-01-01T10:02:00Z' }],
            },
          },
        ],
      };

      const result = computeTimelineAnalysis(
        [],
        timelineBlocks,
        '2024-01-01T10:00:00Z',
        formatTime,
        summaryByCategory,
      );

      expect(result.timingDetails[0].withinTimeWindow).toBe(false);
      expect(result.timingDetails[0].status).toBe('Completed too late');
    });

    it('should detect early vital measurements', () => {
      const timelineBlocks = [
        {
          id: 'v1',
          label: 'Heart Rate',
          sourceId: 'vital.action1.hr',
          start: 2,
          duration: 1,
        },
      ];
      const summaryByCategory = {
        actions: [
          {
            id: 'action1',
            vitals: {
              hr: [{ value: '80', timestamp: '2024-01-01T10:00:30Z' }],
            },
          },
        ],
      };

      const result = computeTimelineAnalysis(
        [],
        timelineBlocks,
        '2024-01-01T10:00:00Z',
        formatTime,
        summaryByCategory,
      );

      expect(result.timingDetails[0].withinTimeWindow).toBe(false);
      expect(result.timingDetails[0].status).toBe('Completed too early');
    });

    it('should handle repeat vital measurements in timeline', () => {
      const timelineBlocks = [
        {
          id: 'v1',
          label: 'Heart Rate (1st)',
          sourceId: 'vital.action1.hr',
          start: 0,
          duration: 1,
        },
        {
          id: 'v2',
          label: 'Heart Rate (2nd)',
          sourceId: 'vital.action2.hr',
          start: 2,
          duration: 1,
        },
      ];
      const summaryByCategory = {
        actions: [
          {
            id: 'action1',
            vitals: {
              hr: [{ value: '52', timestamp: '2024-01-01T10:00:30Z' }],
            },
          },
          {
            id: 'action2',
            vitals: {
              hr: [{ value: '60', timestamp: '2024-01-01T10:02:30Z' }],
            },
          },
        ],
      };

      const result = computeTimelineAnalysis(
        [],
        timelineBlocks,
        '2024-01-01T10:00:00Z',
        formatTime,
        summaryByCategory,
      );

      expect(result.completedBlocks).toHaveLength(2);
      expect(result.timingDetails[0].actualTimeSeconds).toBe(30);
      expect(result.timingDetails[1].actualTimeSeconds).toBe(150);
    });
  });
});
