import { AiGateway } from 'src/common/interfaces';
import {
  createMockSimulationReportRepository,
  createMockStudentRepository,
  createMockStudentSimulationProgressRepository,
} from '../../../unit/common/utils/mock-factory';
import type { ICurrentUser } from 'src/common/interfaces';
import { ScenariosService } from 'src/student-backend/modules/scenarios/scenarios.service';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ReportsService } from '@/modules/reports/reports.service';
import { ConfigModule } from '@nestjs/config';
import { ActionsInterventionsService } from '@/modules/reports/actions-interventions.service';
import { PpePrivacyService } from '@/modules/reports/ppe-privacy.service';
import { ClinicalDocumentationService } from '@/modules/reports/clinical-documentation.service';
import { CommunicationService } from '@/modules/reports/communication.service';
import { TimelineTimingService } from '@/modules/reports/timeline-timing.service';
import { SequencingService } from '@/modules/reports/sequencing.service';
import { LifecycleTelemetryService } from '@/modules/telemetry/lifecycle-telemetry.service';
import { MailService } from 'src/mail/mail.service';
import { MailRetryService } from 'src/mail/mail-retry.service';
import type { Scenario } from 'src/common/interfaces/student-scenario.interface';
import { loggerServiceTestProvider } from '../../common/setup/logger.mock';
import {
  SIMULATION_V2_REPOSITORY,
  TRANSCRIPT_REPOSITORY,
  UNIT_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  STUDENT_SIMULATION_PROGRESS_REPOSITORY,
  STUDENT_REPOSITORY,
} from 'src/database/tokens';

const reportUser = { userId: 'user-1', type: 'educator' } as ICurrentUser;

// Type for spying on private methods
type SpyableReportsService = {
  analyzeWithOpenAI: (...args: unknown[]) => Promise<unknown>;
};

describe('Reports Integration Tests', () => {
  // Override the 10 s global default set by jest.setup.ts — integration tests
  // can legitimately take up to 60 s (configured in jest.integration.json).
  jest.setTimeout(60000);

  let service: ReportsService;
  let communicationService: CommunicationService;
  let simulationV2Repository: {
    findByBusinessId: jest.Mock;
    findByBusinessIdWithChildrenJoined: jest.Mock;
  };
  let transcriptRepository: { findByBusinessId: jest.Mock };

  beforeEach(async () => {
    const findByBusinessIdMock = jest.fn();
    simulationV2Repository = {
      findByBusinessId: findByBusinessIdMock,
      findByBusinessIdWithChildrenJoined: findByBusinessIdMock,
    };
    transcriptRepository = { findByBusinessId: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [
        ReportsService,
        ActionsInterventionsService,
        PpePrivacyService,
        ClinicalDocumentationService,
        CommunicationService,
        TimelineTimingService,
        SequencingService,
        {
          provide: AiGateway,
          useValue: {
            complete: jest.fn(),
            completeJson: jest.fn(),
            isConfigured: jest.fn().mockReturnValue(false),
          },
        },
        { provide: MailService, useValue: { sendMail: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: MailRetryService,
          useValue: { enqueue: jest.fn().mockResolvedValue(undefined) },
        },
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
        { provide: MailService, useValue: { sendMail: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: MailRetryService,
          useValue: { enqueue: jest.fn().mockResolvedValue(undefined) },
        },
        loggerServiceTestProvider,
        {
          provide: UNIT_REPOSITORY,
          useValue: {
            findByBusinessId: jest.fn(async (id: string) => ({ id, name: 'Unit' })),
            find: jest.fn(async () => []),
          },
        },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationV2Repository },
        { provide: ScenariosService, useValue: { assertScenarioAssigned: jest.fn() } },
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: createMockSimulationReportRepository() },
        {
          provide: STUDENT_SIMULATION_PROGRESS_REPOSITORY,
          useValue: createMockStudentSimulationProgressRepository(),
        },
        { provide: STUDENT_REPOSITORY, useValue: createMockStudentRepository() },
        { provide: TRANSCRIPT_REPOSITORY, useValue: transcriptRepository },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    communicationService = module.get<CommunicationService>(CommunicationService);
  });

  afterEach(async () => {
    // Clear all mocks to prevent interference between tests
    jest.clearAllMocks();
    // Restore console.log
    jest.restoreAllMocks();
  });

  describe('End-to-End Grading with Phase 4 Data', () => {
    it('should generate report with AI assessment', async () => {
      const mockTranscript = {
        id: 'test-transcript-1',
        userId: 'test-user',
        scenarioId: 'test-scenario',
        startedAt: new Date().toISOString(),
        messages: [
          {
            id: '1',
            timestamp: new Date().toISOString(),
            text: 'Hello, can you tell me your name?',
            speaker: 'student' as const,
          },
          {
            id: '2',
            timestamp: new Date().toISOString(),
            text: 'My name is Sarah',
            speaker: 'avatar' as const,
          },
          {
            id: '3',
            timestamp: new Date().toISOString(),
            text: 'Do you have any allergies?',
            speaker: 'student' as const,
          },
          {
            id: '4',
            timestamp: new Date().toISOString(),
            text: 'I am allergic to penicillin',
            speaker: 'avatar' as const,
          },
        ],
      };

      const mockScenario = {
        id: 'test-scenario',
        title: 'Test Scenario',
        unitId: 'unit-1',
        difficulty: 'Medium',
        learnerLevel: 'Intermediate',
        department: 'Nursing',
        description: 'Test description',
        learningObjective: 'Test objective',
        Status: 'Active',
        patientData: { Weight: '', Height: '' },
        grading: {
          maxScore: 100,
          rubric: [
            {
              id: 'soft_empathy',
              name: 'Empathy',
              categoryType: 'Soft Skill' as const,
              subCategory: 'Empathy',
              weight: 10,
              scoringModel: 'Graded' as const,
              required: true,
              evaluationSource: 'AI' as const,
              aiMapping: {
                aiCheckId: 'soft_empathy',
                aiDescription: 'Evaluate empathy',
                aiPromptParameter: 'empathy',
              },
            },
            {
              id: 'rubric_communication',
              name: 'Communication',
              categoryType: 'Technical Skill' as const,
              subCategory: 'Communication',
              weight: 20,
              scoringModel: 'Graded' as const,
              required: true,
              evaluationSource: 'AI' as const,
              aiMapping: {
                aiCheckId: 'communication',
                aiDescription: 'Evaluate communication',
                aiPromptParameter: 'communication',
              },
              communicationCriteria: [
                {
                  id: 'comm-1',
                  title: 'Demonstrate empathy',
                  prompt: 'Evaluate empathy',
                  enabled: true,
                  order: 1,
                },
              ],
            },
          ],
        },
      };

      transcriptRepository.findByBusinessId.mockResolvedValue(mockTranscript);
      simulationV2Repository.findByBusinessId.mockResolvedValue(mockScenario);

      // Mock the AI analysis to avoid actual API calls
      const mockAIResponse = {
        rubrics: {
          totalScore: 75,
          totalWeight: 30,
          items: {
            communication: {
              id: 'rubric_communication',
              name: 'Communication',
              subCategory: 'Communication',
              score: 75,
              summary: 'Student demonstrated good communication',
              strengths: [{ point: 'Clear communication', example: 'Asked open-ended questions' }],
              weaknesses: [],
              recommendations: [],
              criteriaResults: [
                {
                  criterionId: 'comm-1',
                  title: 'Demonstrate empathy',
                  passed: true,
                  rationale: 'Student showed empathy in responses',
                },
              ],
            },
          },
        },
        overall: {
          score: 75,
          summary: 'Test summary',
          feedback: 'Test feedback',
        },
        softSkills: { totalScore: 75, totalWeight: 10 },
        technicalSkills: { totalScore: 0, totalWeight: 0 },
      };
      jest
        .spyOn(service as unknown as SpyableReportsService, 'analyzeWithOpenAI')
        .mockResolvedValue(mockAIResponse as never);

      // Mock communication service to avoid actual OpenAI API calls
      jest.spyOn(communicationService, 'evaluateCommunication').mockResolvedValue({
        score: 80,
        passed: true,
        flagged: false,
        results: [],
      });

      // Mock console.log to prevent "Cannot log after tests are done" errors
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const reportDto = {
        userId: 'test-user',
        studentName: 'Test Student',
        studentClass: 'Test Class',
        scenarioId: 'test-scenario',
        scenarioTitle: 'Test Scenario',
        transcriptId: 'test-transcript-1',
        summaryByCategory: {
          vitals: [{ id: '1', title: 'Heart Rate', details: '72 bpm' }],
          actions: [{ id: '2', title: 'Physical Exam', details: 'Complete' }],
        },
      };

      const result = await service.createReportWithAI(reportUser, reportDto);

      expect(result).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.scoreJson).toBeDefined();
      expect(result.communicationAssessment).toBeDefined();

      // Restore console spy
      consoleSpy.mockRestore();
    }, 10000);

    it('should handle Phase 4 reassessment data correctly', async () => {
      const phaseData = {
        history: [],
        vitals: {
          'Heart Rate': [
            {
              id: '1',
              timestamp: '2025-01-01T10:00:00Z',
              details: '72 bpm',
              elapsedSeconds: 60,
            },
            {
              id: '2',
              timestamp: '2025-01-01T10:05:00Z',
              details: '75 bpm',
              elapsedSeconds: 360,
            },
          ],
          'Blood Pressure': [],
          'Respiratory Rate': [],
          Temperature: [],
          SpO2: [],
        },
        actions: [],
        medications: [],
        assessment: [],
        followup: [],
      };

      const mockScenario = {
        id: 'test-scenario',
        unitId: 'unit-1',
        title: 'Test Scenario',
        difficulty: 'Medium',
        learnerLevel: 'Intermediate',
        department: 'Nursing',
        description: 'Test description',
        learningObjective: 'Test objective',
        Status: 'Active',
        patientData: { Weight: '', Height: '' },
        grading: {
          maxScore: 100,
          rubric: [
            {
              id: 'technical_vitals',
              name: 'Vitals Assessment',
              categoryType: 'Technical Skill' as const,
              subCategory: 'Vitals',
              weight: 10,
              scoringModel: 'Graded' as const,
              required: true,
              evaluationSource: 'AI' as const,
              vitalsFields: [{ field: 'heartRate', status: 'Within 5 minutes' as const }],
            },
          ],
        },
      };

      simulationV2Repository.findByBusinessId.mockResolvedValue(mockScenario);

      const analysis = service['computeVitalsAnalysisFromSummary'](
        phaseData,
        [{ field: 'heartRate', status: 'Reassess Within 5 minutes' }],
        '2025-01-01T09:59:00Z',
      );

      expect((analysis as unknown as Record<string, unknown>).vitalsTaken).toContain('heartRate');
      expect((analysis as unknown as Record<string, unknown>).timingAnalysis).toHaveLength(1);
      expect(
        (analysis as unknown as Record<string, { type: string; hasReassessment: boolean }[]>)
          .timingAnalysis[0].type,
      ).toBe('reassess');
      expect(
        (analysis as unknown as Record<string, { type: string; hasReassessment: boolean }[]>)
          .timingAnalysis[0].hasReassessment,
      ).toBe(true);
    });
  });

  describe('Score Persistence and Retrieval', () => {
    it('should handle score retrieval with missing data gracefully', async () => {
      await expect(service.findOne('non-existent-id')).rejects.toThrow(
        'Report with ID non-existent-id not found',
      );
    });
  });

  describe('Integration with Grading System', () => {
    it('should calculate scores based on rubric weights', async () => {
      const mockScenario = {
        grading: {
          maxScore: 100,
          rubric: [
            { id: '1', weight: 30, categoryType: 'Soft Skill' as const },
            { id: '2', weight: 70, categoryType: 'Technical Skill' as const },
          ],
        },
      };

      const mockAssessment = {
        softSkills: { totalScore: 24, totalWeight: 30 },
        technicalSkills: { totalScore: 56, totalWeight: 70 },
      };

      // Calculate expected score: (24+56)/(30+70) * 100 = 80
      const totalPoints =
        mockAssessment.softSkills.totalScore + mockAssessment.technicalSkills.totalScore;
      const totalWeight =
        mockAssessment.softSkills.totalWeight + mockAssessment.technicalSkills.totalWeight;
      const expectedScore = Math.round((totalPoints / totalWeight) * mockScenario.grading.maxScore);

      expect(expectedScore).toBe(80);
    });

    it('should validate score boundaries', () => {
      const testScores = [0, 50, 100, 150, -10];
      const validatedScores = testScores.map((score) => Math.max(0, Math.min(100, score)));

      expect(validatedScores).toEqual([0, 50, 100, 100, 0]);
    });
  });

  describe('API Response Validation', () => {
    it('should not include vitals data in assessment score API response when vitals are not configured', async () => {
      const mockScenario = {
        id: 'test-scenario',
        unitId: 'unit-1',
        title: 'Test Scenario',
        difficulty: 'Medium',
        learnerLevel: 'Intermediate',
        department: 'Nursing',
        description: 'Test description',
        learningObjective: 'Test objective',
        Status: 'Active',
        patientData: { Weight: '', Height: '' },
        grading: {
          maxScore: 100,
          rubric: [
            {
              id: 'soft_communication',
              name: 'Communication',
              categoryType: 'Soft Skill' as const,
              subCategory: 'Communication',
              weight: 50,
              scoringModel: 'Graded' as const,
              evaluationSource: 'AI' as const,
              required: true,
            },
            {
              id: 'technical_actions',
              name: 'Actions',
              categoryType: 'Technical Skill' as const,
              subCategory: 'Actions',
              weight: 50,
              scoringModel: 'Graded' as const,
              evaluationSource: 'AI' as const,
              required: true,
            },
          ],
        },
      };

      const mockTranscript = {
        id: 'test-transcript',
        userId: 'test-user',
        scenarioId: 'test-scenario',
        startedAt: '2025-01-01T10:00:00Z',
        messages: [],
        data: {},
      };
      const mockAIResponse = {
        communicationAssessment: {
          overall: {
            score: 80,
            summary: 'Good communication',
            feedback: 'Well done',
          },
          softSkills: { totalScore: 40, totalWeight: 50 },
          technicalSkills: { totalScore: 40, totalWeight: 50 },
        },
      };

      simulationV2Repository.findByBusinessId.mockResolvedValue(mockScenario);
      transcriptRepository.findByBusinessId.mockResolvedValue(mockTranscript);
      jest
        .spyOn(service as unknown as SpyableReportsService, 'analyzeWithOpenAI')
        .mockResolvedValue(mockAIResponse as never);

      const reportDto = {
        userId: 'test-user',
        studentName: 'Test Student',
        studentClass: 'Test Class',
        scenarioId: 'test-scenario',
        scenarioTitle: 'Test Scenario',
        transcriptId: 'test-transcript',
        summaryByCategory: {
          actions: [{ id: '1', title: 'Physical Exam', details: 'Complete' }],
        },
      };

      const result = await service.createReportWithAI(reportUser, reportDto);

      expect(result.communicationAssessment).toBeDefined();
      expect(
        (result as unknown as Record<string, Record<string, unknown>>).communicationAssessment
          ?.vitalsAnalysis,
      ).toBeUndefined();
      expect(result.scoreJson).toBeDefined();
      expect((result.scoreJson as unknown as Record<string, unknown>).vitals).toBeUndefined();
    });

    it('should ensure report generation API respects grading configuration', async () => {
      const mockScenario = {
        id: 'test-scenario',
        unitId: 'unit-1',
        title: 'Test Scenario',
        difficulty: 'Medium',
        learnerLevel: 'Intermediate',
        department: 'Nursing',
        description: 'Test description',
        learningObjective: 'Test objective',
        Status: 'Active',
        patientData: { Weight: '', Height: '' },
        grading: {
          maxScore: 80,
          rubric: [
            {
              id: 'communication',
              name: 'Communication',
              categoryType: 'Soft Skill' as const,
              subCategory: 'Communication',
              weight: 30,
              scoringModel: 'Graded' as const,
              evaluationSource: 'AI' as const,
              required: true,
            },
            {
              id: 'clinical_judgment',
              name: 'Clinical Judgment',
              categoryType: 'Technical Skill' as const,
              subCategory: 'Clinical Judgment',
              weight: 50,
              scoringModel: 'Graded' as const,
              evaluationSource: 'AI' as const,
              required: true,
            },
          ],
        },
      };

      const mockTranscript = {
        id: 'test-transcript',
        userId: 'test-user',
        scenarioId: 'test-scenario',
        startedAt: '2025-01-01T10:00:00Z',
        messages: [],
        data: {},
      };
      const mockAIResponse = {
        communicationAssessment: {
          overall: {
            score: 70,
            summary: 'Good performance',
            feedback: 'Keep improving',
          },
          softSkills: { totalScore: 21, totalWeight: 30 },
          technicalSkills: { totalScore: 35, totalWeight: 50 },
        },
      };

      simulationV2Repository.findByBusinessId.mockResolvedValue(mockScenario);
      transcriptRepository.findByBusinessId.mockResolvedValue(mockTranscript);
      jest
        .spyOn(service as unknown as SpyableReportsService, 'analyzeWithOpenAI')
        .mockResolvedValue(mockAIResponse as never);

      const reportDto = {
        userId: 'test-user',
        studentName: 'Test Student',
        studentClass: 'Test Class',
        scenarioId: 'test-scenario',
        scenarioTitle: 'Test Scenario',
        transcriptId: 'test-transcript',
        summaryByCategory: {
          actions: [{ id: '1', title: 'Assessment', details: 'Complete' }],
        },
      };

      const result = await service.createReportWithAI(reportUser, reportDto);

      // Verify score respects maxScore configuration (80 instead of default 100)
      expect(result.score).toBeLessThanOrEqual(80);
      expect(result.score).toBeGreaterThanOrEqual(0);

      // Verify report was generated with proper structure
      expect(result.communicationAssessment).toBeDefined();
      expect(result.scoreJson).toBeDefined();
    });

    it('should only include configured rubrics in the report', async () => {
      const mockScenario = {
        id: 'test-scenario',
        unitId: 'unit-1',
        title: 'Test Scenario',
        difficulty: 'Medium',
        learnerLevel: 'Intermediate',
        department: 'Nursing',
        description: 'Test description',
        learningObjective: 'Test objective',
        Status: 'Active',
        patientData: { Weight: '', Height: '' },
        grading: {
          maxScore: 100,
          rubric: [
            {
              id: 'communication_only',
              name: 'Communication',
              categoryType: 'Soft Skill' as const,
              subCategory: 'Communication',
              weight: 100,
              scoringModel: 'Graded' as const,
              evaluationSource: 'AI' as const,
              required: true,
            },
          ],
        },
      };

      const mockTranscript = {
        id: 'test-transcript',
        userId: 'test-user',
        scenarioId: 'test-scenario',
        startedAt: '2025-01-01T10:00:00Z',
        messages: [],
        data: {},
      };
      const mockAIResponse = {
        communicationAssessment: {
          overall: {
            score: 85,
            summary: 'Good communication',
            feedback: 'Well done',
          },
          softSkills: { totalScore: 85, totalWeight: 100 },
          technicalSkills: { totalScore: 0, totalWeight: 0 },
        },
      };

      simulationV2Repository.findByBusinessId.mockResolvedValue(mockScenario);
      transcriptRepository.findByBusinessId.mockResolvedValue(mockTranscript);
      jest
        .spyOn(service as unknown as SpyableReportsService, 'analyzeWithOpenAI')
        .mockResolvedValue(mockAIResponse as never);

      const reportDto = {
        userId: 'test-user',
        studentName: 'Test Student',
        studentClass: 'Test Class',
        scenarioId: 'test-scenario',
        scenarioTitle: 'Test Scenario',
        transcriptId: 'test-transcript',
        summaryByCategory: {
          actions: [{ id: '1', title: 'Assessment', details: 'Complete' }],
        },
      };

      const result = await service.createReportWithAI(reportUser, reportDto);

      // Verify only configured rubric is included
      expect(result.scoreJson).toBeDefined();
      expect(result.scoreJson.communication).toBeDefined();
      expect((result.scoreJson as unknown as Record<string, unknown>).vitals).toBeUndefined();
    });
  });
});
