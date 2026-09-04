import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ReportsService } from '@/modules/reports/reports.service';
import { JsonDataService } from '@/data/json-data.service';
import type { Transcript, Scenario } from '@/data/json-data.service';
import { HttpService } from '@nestjs/axios';
import { ActionsInterventionsService } from '@/modules/reports/actions-interventions.service';
import { PpePrivacyService } from '@/modules/reports/ppe-privacy.service';
import { ClinicalDocumentationService } from '@/modules/reports/clinical-documentation.service';
import { CommunicationService } from '@/modules/reports/communication.service';
import { TimelineTimingService } from '@/modules/reports/timeline-timing.service';
import { SequencingService } from '@/modules/reports/sequencing.service';
import { LifecycleTelemetryService } from '@/modules/telemetry/lifecycle-telemetry.service';
import { ConfigService } from '@nestjs/config';

describe('ReportsService - Grading Logic', () => {
  let service: ReportsService;
  let jsonDataService: jest.Mocked<JsonDataService>;

  beforeEach(async () => {
    jsonDataService = {
      getReportsFresh: jest.fn().mockResolvedValue([]),
      getTranscriptByIdFresh: jest.fn(),
      getScenarioById: jest.fn(),
      addReportFresh: jest.fn(),
      generateId: jest.fn().mockReturnValue('report-123'),
      getReportByTranscriptId: jest.fn().mockReturnValue(null),
    } as unknown as jest.Mocked<JsonDataService>;

    const module: TestingModule = await Test.createTestingModule({
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
        { provide: HttpService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: LifecycleTelemetryService, useValue: {} },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  describe('Unit Tests: calculateScoresStrict', () => {
    // Helper to bypass TypeScript private access restriction for testing pure logic
    const calculateScores = (
      patientData: unknown,
      phases: unknown,
      actions: unknown,
      conversation: unknown,
      scenarioReqs: unknown,
      msgCount: number,
    ): { overallScore: number; [key: string]: unknown } => {
      return (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).calculateScoresStrict(
        patientData,
        phases,
        actions,
        conversation,
        scenarioReqs,
        msgCount,
      ) as { overallScore: number; [key: string]: unknown };
    };

    const defaultPhases = {
      totalTasks: 0,
      completedTasks: 0,
      missedTasks: 0,
      taskDetails: [],
    };
    const defaultScenarioReqs = { met: 0, total: 0, details: [] };

    it('Documentation + Communication  → max 75%', () => {
      const patientData = {
        coverage: 90,
        askedFields: ['name', 'allergies', 'chiefComplaint'],
        criticalMissing: [],
      };
      const actions = {
        totalExpected: 5,
        completed: 5,
        completionRate: 100,
        completedActions: [],
        missingActions: [],
        distractorActions: [],
      };
      const conversation = { questionCount: 1, professionalismScore: 1 };

      const result = calculateScores(
        patientData,
        defaultPhases,
        actions,
        conversation,
        defaultScenarioReqs,
        2,
      );

      expect(result.overallScore).toBeLessThanOrEqual(75);
    });

    it('Documentation  + Communication  → low score', () => {
      const patientData = {
        coverage: 20,
        askedFields: [],
        criticalMissing: ['allergies', 'chiefComplaint'],
      };
      const actions = {
        totalExpected: 5,
        completed: 0,
        completionRate: 0,
        completedActions: [],
        missingActions: [],
        distractorActions: [],
      };
      const conversation = { questionCount: 0, professionalismScore: 0 };

      const result = calculateScores(
        patientData,
        defaultPhases,
        actions,
        conversation,
        defaultScenarioReqs,
        1,
      );

      expect(result.overallScore).toBeLessThan(40);
    });

    it('Documentation  + Communication  → up to 100%', () => {
      const patientData = {
        coverage: 100,
        askedFields: ['name', 'allergies', 'chiefComplaint'],
        criticalMissing: [],
      };
      const actions = {
        totalExpected: 5,
        completed: 5,
        completionRate: 100,
        completedActions: [],
        missingActions: [],
        distractorActions: [],
      };
      const conversation = { questionCount: 6, professionalismScore: 3 };

      const result = calculateScores(
        patientData,
        defaultPhases,
        actions,
        conversation,
        defaultScenarioReqs,
        10,
      );

      expect(result.overallScore).toBeGreaterThanOrEqual(90);
    });

    it('Edge cases: missing critical fields penalized heavily', () => {
      const patientData = {
        coverage: 50,
        askedFields: ['name'],
        criticalMissing: ['allergies', 'chiefComplaint'],
      };
      const actions = {
        totalExpected: 5,
        completed: 2,
        completionRate: 40,
        completedActions: [],
        missingActions: [],
        distractorActions: [],
      };
      const conversation = { questionCount: 3, professionalismScore: 2 };

      const result = calculateScores(
        patientData,
        defaultPhases,
        actions,
        conversation,
        defaultScenarioReqs,
        5,
      );

      expect(result.overallScore).toBeLessThan(80);
    });

    it('Edge cases: missing messages zeroes score', () => {
      const patientData = {
        coverage: 100,
        askedFields: ['name', 'allergies', 'chiefComplaint'],
        criticalMissing: [],
      };
      const actions = {
        totalExpected: 5,
        completed: 5,
        completionRate: 100,
        completedActions: [],
        missingActions: [],
        distractorActions: [],
      };
      const conversation = { questionCount: 0, professionalismScore: 0 };

      const result = calculateScores(
        patientData,
        defaultPhases,
        actions,
        conversation,
        defaultScenarioReqs,
        0,
      );

      expect(result.overallScore).toBe(0);
    });
  });

  describe('Integration Tests: generate()', () => {
    it('Integration: Scenario actions → stored data → grading engine', async () => {
      const mockTranscript = {
        id: 'transcript-1',
        scenarioId: 'scenario-1',
        userId: 'user-1',
        messages: [
          { speaker: 'student', text: 'Hello, what is your name?' },
          { speaker: 'avatar', text: 'I am John.' },
          { speaker: 'student', text: 'Do you have any allergies?' },
          { speaker: 'avatar', text: 'No allergies.' },
          { speaker: 'student', text: 'What brings you here today?' },
          { speaker: 'student', text: 'I will check your vitals now.' },
        ],
        startedAt: new Date().toISOString(),
      };

      const mockScenario = {
        id: 'scenario-1',
        patientData: {
          name: 'John',
          allergies: 'None',
          chiefComplaint: 'Chest pain',
        },
        expectedActions: {
          physicalExam: ['check your vitals'],
          labs: [],
          imaging: [],
          medications: [],
        },
      };

      jsonDataService.getTranscriptByIdFresh.mockResolvedValue(
        mockTranscript as unknown as Transcript,
      );
      jsonDataService.getScenarioById.mockReturnValue(mockScenario as unknown as Scenario);

      const report = await service.generate('transcript-1', 'user-1');

      expect(report).toBeDefined();
      expect(jsonDataService.getTranscriptByIdFresh).toHaveBeenCalledWith('transcript-1');
      expect(jsonDataService.getScenarioById).toHaveBeenCalledWith('scenario-1');

      // Communication events (messages) affect communication score
      expect(report.scoreJson.communication).toBeGreaterThanOrEqual(3);

      // Documentation events (patient data and expected actions) affect clinicalJudgment & technicalAccuracy
      expect(report.scoreJson.clinicalJudgment).toBeGreaterThanOrEqual(3);
      expect(report.scoreJson.technicalAccuracy).toBeGreaterThanOrEqual(4);
    });
  });
});
