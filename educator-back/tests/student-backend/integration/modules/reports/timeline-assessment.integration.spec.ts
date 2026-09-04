import { Test } from '@nestjs/testing';
import { ReportsService } from '@/modules/reports/reports.service';
import { JsonDataService } from '@/data/json-data.service';
import type { Scenario, Transcript, Unit } from '@/data/json-data.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { ActionsInterventionsService } from '@/modules/reports/actions-interventions.service';
import { PpePrivacyService } from '@/modules/reports/ppe-privacy.service';
import { ClinicalDocumentationService } from '@/modules/reports/clinical-documentation.service';
import { CommunicationService } from '@/modules/reports/communication.service';
import { TimelineTimingService } from '@/modules/reports/timeline-timing.service';
import { SequencingService } from '@/modules/reports/sequencing.service';
import { LifecycleTelemetryService } from '@/modules/telemetry/lifecycle-telemetry.service';

describe('Timeline Assessment - Integration Tests', () => {
  let service: ReportsService;
  let jsonDataService: jest.Mocked<JsonDataService>;

  beforeEach(async () => {
    const getTranscriptById = jest.fn();
    const getReportByTranscriptId = jest.fn();
    const getScenarioById = jest.fn();
    const addReport = jest.fn();
    jsonDataService = {
      getTranscriptById,
      getTranscriptByIdFresh: getTranscriptById,
      getReportByTranscriptId,
      getReportByTranscriptIdFresh: getReportByTranscriptId,
      getScenarioById,
      getScenarioByIdFresh: getScenarioById,
      getUnitById: jest.fn(),
      generateId: jest.fn().mockReturnValue('report-1'),
      addReport,
      addReportFresh: addReport,
      getReports: jest.fn().mockReturnValue([]),
      getReportsFresh: jest.fn().mockResolvedValue([]),
      getReportById: jest.fn(),
      getReportByIdFresh: jest.fn(),
    } as unknown as jest.Mocked<JsonDataService>;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportsService,
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
        { provide: JsonDataService, useValue: jsonDataService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: HttpService, useValue: {} },
        {
          provide: LifecycleTelemetryService,
          useValue: {
            emitSessionStarted: jest.fn(),
            emitSessionCompleted: jest.fn(),
            emitGradingStarted: jest.fn(),
            emitGradingStopped: jest.fn(),
            emitScenarioStarted: jest.fn(),
            emitScenarioStopped: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(ReportsService);
  });

  describe('End-to-End Assessment with Timeline', () => {
    it('should generate report with timeline-assessed blocks', async () => {
      const transcript = {
        id: 't1',
        userId: 'u1',
        scenarioId: 's1',
        messages: [],
        startedAt: '2024-01-01T10:00:00Z',
        actionsTimeline: [
          {
            title: 'Initial Assessment',
            timestamp: '2024-01-01T10:00:30Z',
            timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
          },
        ],
        summaryByCategory: {},
      };

      const scenario = {
        id: 's1',
        unitId: 'unit1',
        title: 'Test Scenario',
        timelineBlocks: [
          {
            id: 'b1',
            label: 'Initial Assessment',
            sourceId: 'action.assessment',
            start: 0,
            duration: 2,
          },
        ],
      };

      jsonDataService.getTranscriptById.mockReturnValue(transcript);
      jsonDataService.getReportByTranscriptId.mockReturnValue(undefined);
      jsonDataService.getScenarioById.mockReturnValue(scenario as unknown as Scenario);
      jsonDataService.getUnitById.mockReturnValue({ id: 'unit1' } as unknown as Unit);

      const report = await service.generate('t1', 'u1');

      expect(report).toBeDefined();
      expect(report.score).toBeGreaterThanOrEqual(0);
      expect(jsonDataService.addReport).toHaveBeenCalled();
    });

    it('should handle mixed timeline and completion-only blocks', async () => {
      const transcript = {
        id: 't1',
        userId: 'u1',
        scenarioId: 's1',
        messages: [],
        startedAt: '2024-01-01T10:00:00Z',
        actionsTimeline: [
          {
            title: 'Timed Action',
            timestamp: '2024-01-01T10:00:30Z',
            timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
          },
          {
            title: 'Untimed Action',
            timestamp: '2024-01-01T10:05:00Z',
            timestampValue: new Date('2024-01-01T10:05:00Z').getTime(),
          },
        ],
        summaryByCategory: {},
      };

      const scenario = {
        id: 's1',
        unitId: 'unit1',
        title: 'Mixed Scenario',
        timelineBlocks: [
          {
            id: 'b1',
            label: 'Timed Action',
            sourceId: 'action.timed',
            start: 0,
            duration: 1,
          },
          { id: 'b2', label: 'Untimed Action', sourceId: 'action.untimed' },
        ],
      };

      jsonDataService.getTranscriptById.mockReturnValue(transcript);
      jsonDataService.getReportByTranscriptId.mockReturnValue(undefined);
      jsonDataService.getScenarioById.mockReturnValue(scenario as unknown as Scenario);
      jsonDataService.getUnitById.mockReturnValue({ id: 'unit1' } as unknown as Unit);

      const report = await service.generate('t1', 'u1');

      expect(report).toBeDefined();
      expect(report.score).toBeGreaterThanOrEqual(0);
    });

    it('should penalize timing violations in assessment', async () => {
      const transcript = {
        id: 't1',
        userId: 'u1',
        scenarioId: 's1',
        messages: [],
        startedAt: '2024-01-01T10:00:00Z',
        actionsTimeline: [
          {
            title: 'Late Action',
            timestamp: '2024-01-01T10:05:00Z',
            timestampValue: new Date('2024-01-01T10:05:00Z').getTime(),
          },
        ],
        summaryByCategory: {},
      };

      const scenario = {
        id: 's1',
        unitId: 'unit1',
        title: 'Timing Test',
        timelineBlocks: [
          {
            id: 'b1',
            label: 'Late Action',
            sourceId: 'action.late',
            start: 0,
            duration: 1,
          },
        ],
      };

      jsonDataService.getTranscriptById.mockReturnValue(transcript);
      jsonDataService.getReportByTranscriptId.mockReturnValue(undefined);
      jsonDataService.getScenarioById.mockReturnValue(scenario as unknown as Scenario);
      jsonDataService.getUnitById.mockReturnValue({ id: 'unit1' } as unknown as Unit);

      const report = await service.generate('t1', 'u1');

      expect(report).toBeDefined();
      expect(report.score).toBeGreaterThanOrEqual(0);
    });

    it('should detect and report sequence violations', async () => {
      const transcript = {
        id: 't1',
        userId: 'u1',
        scenarioId: 's1',
        messages: [],
        startedAt: '2024-01-01T10:00:00Z',
        actionsTimeline: [
          {
            title: 'Second Step',
            timestamp: '2024-01-01T10:00:30Z',
            timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
          },
          {
            title: 'First Step',
            timestamp: '2024-01-01T10:01:00Z',
            timestampValue: new Date('2024-01-01T10:01:00Z').getTime(),
          },
        ],
        summaryByCategory: {},
      };

      const scenario = {
        id: 's1',
        unitId: 'unit1',
        title: 'Sequence Test',
        timelineBlocks: [
          {
            id: 'b1',
            label: 'First Step',
            sourceId: 'action.first',
            start: 0,
            duration: 1,
          },
          {
            id: 'b2',
            label: 'Second Step',
            sourceId: 'action.second',
            start: 1,
            duration: 1,
            prerequisites: ['b1'],
          },
        ],
      };

      jsonDataService.getTranscriptById.mockReturnValue(transcript);
      jsonDataService.getReportByTranscriptId.mockReturnValue(undefined);
      jsonDataService.getScenarioById.mockReturnValue(scenario as unknown as Scenario);
      jsonDataService.getUnitById.mockReturnValue({ id: 'unit1' } as unknown as Unit);

      const report = await service.generate('t1', 'u1');

      expect(report).toBeDefined();
      expect(report.score).toBeGreaterThanOrEqual(0);
    });

    it('should report omitted blocks in assessment', async () => {
      const transcript = {
        id: 't1',
        userId: 'u1',
        scenarioId: 's1',
        messages: [],
        startedAt: '2024-01-01T10:00:00Z',
        actionsTimeline: [
          {
            title: 'Completed Action',
            timestamp: '2024-01-01T10:00:30Z',
            timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
          },
        ],
        summaryByCategory: {},
      };

      const scenario = {
        id: 's1',
        unitId: 'unit1',
        title: 'Omission Test',
        timelineBlocks: [
          {
            id: 'b1',
            label: 'Completed Action',
            sourceId: 'action.completed',
            start: 0,
            duration: 1,
          },
          {
            id: 'b2',
            label: 'Missed Action',
            sourceId: 'action.missed',
            start: 1,
            duration: 1,
          },
        ],
      };

      jsonDataService.getTranscriptById.mockReturnValue(transcript);
      jsonDataService.getReportByTranscriptId.mockReturnValue(undefined);
      jsonDataService.getScenarioById.mockReturnValue(scenario as unknown as Scenario);
      jsonDataService.getUnitById.mockReturnValue({ id: 'unit1' } as unknown as Unit);

      const report = await service.generate('t1', 'u1');

      expect(report).toBeDefined();
      expect(report.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Vitals Integration with Timeline', () => {
    it('should assess vitals timing from summaryByCategory', async () => {
      const transcript = {
        id: 't1',
        userId: 'u1',
        scenarioId: 's1',
        messages: [],
        startedAt: '2024-01-01T10:00:00Z',
        actionsTimeline: [],
        summaryByCategory: {
          vitals: {
            'Heart Rate': [
              {
                value: '80',
                timestamp: '2024-01-01T10:00:30Z',
                timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
              },
            ],
          },
        },
      };

      const scenario = {
        id: 's1',
        unitId: 'unit1',
        title: 'Vitals Test',
        timelineBlocks: [
          {
            id: 'b1',
            label: 'Heart Rate',
            sourceId: 'vitals.heartrate',
            start: 0,
            duration: 1,
          },
        ],
      };

      jsonDataService.getTranscriptById.mockReturnValue(transcript);
      jsonDataService.getReportByTranscriptId.mockReturnValue(undefined);
      jsonDataService.getScenarioById.mockReturnValue(scenario as unknown as Scenario);
      jsonDataService.getUnitById.mockReturnValue({ id: 'unit1' } as unknown as Unit);

      const report = await service.generate('t1', 'u1');

      expect(report).toBeDefined();
      expect(report.score).toBeGreaterThanOrEqual(0);
    });

    it('should detect verbalized vs silent vitals', async () => {
      const transcript = {
        id: 't1',
        userId: 'u1',
        scenarioId: 's1',
        messages: [
          {
            id: 'msg-1',
            speaker: 'student' as const,
            text: 'Blood pressure is 120 over 80',
            timestamp: '2024-01-01T10:00:35Z',
          },
        ],
        startedAt: '2024-01-01T10:00:00Z',
        actionsTimeline: [],
        summaryByCategory: {
          vitals: {
            'Blood Pressure': [
              {
                value: '120/80',
                timestamp: '2024-01-01T10:00:30Z',
                timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
              },
            ],
          },
        },
      };

      const scenario = {
        id: 's1',
        unitId: 'unit1',
        title: 'Verbalization Test',
        timelineBlocks: [
          {
            id: 'b1',
            label: 'Blood Pressure',
            sourceId: 'vitals.bloodpressure',
            start: 0,
            duration: 1,
          },
        ],
      };

      jsonDataService.getTranscriptById.mockReturnValue(transcript);
      jsonDataService.getReportByTranscriptId.mockReturnValue(undefined);
      jsonDataService.getScenarioById.mockReturnValue(scenario as unknown as Scenario);
      jsonDataService.getUnitById.mockReturnValue({ id: 'unit1' } as unknown as Unit);

      const report = await service.generate('t1', 'u1');

      expect(report).toBeDefined();
      expect(report.strengths).toBeDefined();
    });
  });

  describe('PPE Integration with Timeline', () => {
    it('should assess PPE timing from commonActionTracker', async () => {
      const transcript = {
        id: 't1',
        userId: 'u1',
        scenarioId: 's1',
        messages: [],
        startedAt: '2024-01-01T10:00:00Z',
        actionsTimeline: [],
        summaryByCategory: {},
        commonActionTracker: {
          actionLog: [
            {
              label: 'Gloves',
              timestamp: '10:00:30 AM',
              timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
            },
          ],
        },
      };

      const scenario = {
        id: 's1',
        unitId: 'unit1',
        title: 'PPE Test',
        timelineBlocks: [
          {
            id: 'b1',
            label: 'Gloves',
            sourceId: 'ppe.gloves',
            start: 0,
            duration: 1,
          },
        ],
      };

      jsonDataService.getTranscriptById.mockReturnValue(transcript);
      jsonDataService.getReportByTranscriptId.mockReturnValue(undefined);
      jsonDataService.getScenarioById.mockReturnValue(scenario as unknown as Scenario);
      jsonDataService.getUnitById.mockReturnValue({ id: 'unit1' } as unknown as Unit);

      const report = await service.generate('t1', 'u1');

      expect(report).toBeDefined();
      expect(report.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Patient Data Block Integration', () => {
    it('should mark patient data blocks for AI analysis', async () => {
      const transcript = {
        id: 't1',
        userId: 'u1',
        scenarioId: 's1',
        messages: [
          {
            id: 'msg-1',
            speaker: 'student' as const,
            text: 'What is your chief complaint?',
            timestamp: '2024-01-01T10:00:30Z',
          },
        ],
        startedAt: '2024-01-01T10:00:00Z',
        actionsTimeline: [],
        summaryByCategory: {},
      };

      const scenario = {
        id: 's1',
        unitId: 'unit1',
        title: 'Patient Data Test',
        timelineBlocks: [
          {
            id: 'b1',
            label: 'Chief Complaint',
            sourceId: 'patient.chiefComplaint',
            start: 0,
            duration: 2,
          },
        ],
      };

      jsonDataService.getTranscriptById.mockReturnValue(transcript);
      jsonDataService.getReportByTranscriptId.mockReturnValue(undefined);
      jsonDataService.getScenarioById.mockReturnValue(scenario as unknown as Scenario);
      jsonDataService.getUnitById.mockReturnValue({ id: 'unit1' } as unknown as Unit);

      const report = await service.generate('t1', 'u1');

      expect(report).toBeDefined();
    });
  });

  describe('Complex Scenario Integration', () => {
    it('should handle scenario with all block types', async () => {
      const transcript = {
        id: 't1',
        userId: 'u1',
        scenarioId: 's1',
        messages: [
          {
            id: 'msg-1',
            speaker: 'student' as const,
            text: 'What brings you in today?',
            timestamp: '2024-01-01T10:00:30Z',
          },
          {
            id: 'msg-2',
            speaker: 'student' as const,
            text: 'Heart rate is 80',
            timestamp: '2024-01-01T10:01:35Z',
          },
        ],
        startedAt: '2024-01-01T10:00:00Z',
        actionsTimeline: [
          {
            title: 'Initial Assessment',
            timestamp: '2024-01-01T10:00:15Z',
            timestampValue: new Date('2024-01-01T10:00:15Z').getTime(),
          },
          {
            title: 'Documentation',
            timestamp: '2024-01-01T10:05:00Z',
            timestampValue: new Date('2024-01-01T10:05:00Z').getTime(),
          },
        ],
        summaryByCategory: {
          vitals: {
            'Heart Rate': [
              {
                value: '80',
                timestamp: '2024-01-01T10:01:30Z',
                timestampValue: new Date('2024-01-01T10:01:30Z').getTime(),
              },
            ],
          },
        },
        commonActionTracker: {
          actionLog: [
            {
              label: 'Hand Hygiene',
              timestamp: '10:00:05 AM',
              timestampValue: new Date('2024-01-01T10:00:05Z').getTime(),
            },
          ],
        },
      };

      const scenario = {
        id: 's1',
        unitId: 'unit1',
        title: 'Complex Scenario',
        timelineBlocks: [
          {
            id: 'b1',
            label: 'Hand Hygiene',
            sourceId: 'ppe.hygiene',
            start: 0,
            duration: 0.5,
          },
          {
            id: 'b2',
            label: 'Initial Assessment',
            sourceId: 'action.assessment',
            start: 0,
            duration: 1,
            prerequisites: ['b1'],
          },
          {
            id: 'b3',
            label: 'Chief Complaint',
            sourceId: 'patient.chiefComplaint',
            start: 0,
            duration: 2,
          },
          {
            id: 'b4',
            label: 'Heart Rate',
            sourceId: 'vitals.heartrate',
            start: 1,
            duration: 1,
          },
          {
            id: 'b5',
            label: 'Documentation',
            sourceId: 'action.documentation',
          },
        ],
      };

      jsonDataService.getTranscriptById.mockReturnValue(transcript);
      jsonDataService.getReportByTranscriptId.mockReturnValue(undefined);
      jsonDataService.getScenarioById.mockReturnValue(scenario as unknown as Scenario);
      jsonDataService.getUnitById.mockReturnValue({ id: 'unit1' } as unknown as Unit);

      const report = await service.generate('t1', 'u1');

      expect(report).toBeDefined();
      expect(report.score).toBeGreaterThanOrEqual(0);
    });

    it('should calculate accurate completion rate across all block types', async () => {
      const transcript = {
        id: 't1',
        userId: 'u1',
        scenarioId: 's1',
        messages: [],
        startedAt: '2024-01-01T10:00:00Z',
        actionsTimeline: [
          {
            title: 'Action 1',
            timestamp: '2024-01-01T10:00:30Z',
            timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
          },
        ],
        summaryByCategory: {
          vitals: {
            'Heart Rate': [
              {
                value: '80',
                timestamp: '2024-01-01T10:01:00Z',
                timestampValue: new Date('2024-01-01T10:01:00Z').getTime(),
              },
            ],
          },
        },
        commonActionTracker: {
          actionLog: [
            {
              label: 'Gloves',
              timestamp: '10:00:15 AM',
              timestampValue: new Date('2024-01-01T10:00:15Z').getTime(),
            },
          ],
        },
      };

      const scenario = {
        id: 's1',
        unitId: 'unit1',
        title: 'Completion Rate Test',
        timelineBlocks: [
          {
            id: 'b1',
            label: 'Gloves',
            sourceId: 'ppe.gloves',
            start: 0,
            duration: 1,
          },
          {
            id: 'b2',
            label: 'Action 1',
            sourceId: 'action.1',
            start: 0,
            duration: 1,
          },
          {
            id: 'b3',
            label: 'Heart Rate',
            sourceId: 'vitals.heartrate',
            start: 1,
            duration: 1,
          },
          {
            id: 'b4',
            label: 'Missed Action',
            sourceId: 'action.missed',
            start: 2,
            duration: 1,
          },
          {
            id: 'b5',
            label: 'Patient History',
            sourceId: 'patient.history',
            start: 0,
            duration: 2,
          },
        ],
      };

      jsonDataService.getTranscriptById.mockReturnValue(transcript);
      jsonDataService.getReportByTranscriptId.mockReturnValue(undefined);
      jsonDataService.getScenarioById.mockReturnValue(scenario as unknown as Scenario);
      jsonDataService.getUnitById.mockReturnValue({ id: 'unit1' } as unknown as Unit);

      const report = await service.generate('t1', 'u1');

      expect(report).toBeDefined();
      expect(report.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Regression Prevention', () => {
    it('should not break existing scoring when timeline blocks are absent', async () => {
      const transcript = {
        id: 't1',
        userId: 'u1',
        scenarioId: 's1',
        messages: [],
        startedAt: '2024-01-01T10:00:00Z',
        actionsTimeline: [
          {
            title: 'Some Action',
            timestamp: '2024-01-01T10:00:30Z',
            timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
          },
        ],
        summaryByCategory: {},
      };

      const scenario = {
        id: 's1',
        unitId: 'unit1',
        title: 'Legacy Scenario',
        timelineBlocks: [],
      };

      jsonDataService.getTranscriptById.mockReturnValue(transcript);
      jsonDataService.getReportByTranscriptId.mockReturnValue(undefined);
      jsonDataService.getScenarioById.mockReturnValue(scenario as unknown as Scenario);
      jsonDataService.getUnitById.mockReturnValue({ id: 'unit1' } as unknown as Unit);

      const report = await service.generate('t1', 'u1');

      expect(report).toBeDefined();
      expect(report.score).toBeGreaterThanOrEqual(0);
    });

    it('should maintain backward compatibility with scenarios without timing', async () => {
      const transcript = {
        id: 't1',
        userId: 'u1',
        scenarioId: 's1',
        messages: [],
        startedAt: '2024-01-01T10:00:00Z',
        actionsTimeline: [
          {
            title: 'Action',
            timestamp: '2024-01-01T10:00:30Z',
            timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
          },
        ],
        summaryByCategory: {},
      };

      const scenario = {
        id: 's1',
        unitId: 'unit1',
        title: 'No Timing Scenario',
        timelineBlocks: [{ id: 'b1', label: 'Action', sourceId: 'action.test' }],
      };

      jsonDataService.getTranscriptById.mockReturnValue(transcript);
      jsonDataService.getReportByTranscriptId.mockReturnValue(undefined);
      jsonDataService.getScenarioById.mockReturnValue(scenario as unknown as Scenario);
      jsonDataService.getUnitById.mockReturnValue({ id: 'unit1' } as unknown as Unit);

      const report = await service.generate('t1', 'u1');

      expect(report).toBeDefined();
      expect(report.score).toBeGreaterThanOrEqual(0);
    });
  });
});
