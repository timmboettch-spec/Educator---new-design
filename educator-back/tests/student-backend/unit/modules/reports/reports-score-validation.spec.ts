import { AiGateway } from 'src/common/interfaces';
import { ScenariosService } from 'src/student-backend/modules/scenarios/scenarios.service';
import { LoggerService } from 'src/common/services';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ReportsService } from '@/modules/reports/reports.service';
import { ActionsInterventionsService } from '@/modules/reports/actions-interventions.service';
import { PpePrivacyService } from '@/modules/reports/ppe-privacy.service';
import { ClinicalDocumentationService } from '@/modules/reports/clinical-documentation.service';
import { CommunicationService } from '@/modules/reports/communication.service';
import { TimelineTimingService } from '@/modules/reports/timeline-timing.service';
import { SequencingService } from '@/modules/reports/sequencing.service';
import { LifecycleTelemetryService } from '@/modules/telemetry/lifecycle-telemetry.service';
import { MailService } from 'src/mail/mail.service';
import { MailRetryService } from 'src/mail/mail-retry.service';
import { ConfigService } from '@nestjs/config';
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

/**
 * Unit and Integration Tests for Score Validation and Clamping
 *
 * TICKET: Report Scores Can Exceed 100 Due to Unvalidated AI-Generated Rubric Scores
 *
 * COVERAGE:
 * - Validates that AI-generated rubric scores outside 0–100 range are clamped
 * - Ensures final report scores never exceed 100
 * - Verifies deterministic scoring overrides persist through grading
 * - Confirms diagnostic logging is triggered for invalid scores
 * - Tests edge cases with extreme invalid values (187.5, 150, 125, etc.)
 */
describe('ReportsService - Score Validation & Clamping (Ticket Fix)', () => {
  let service: ReportsService;
  let loggerWarnSpy: jest.SpyInstance;
  let loggerDebugSpy: jest.SpyInstance;

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
        { provide: TRANSCRIPT_REPOSITORY, useValue: { findByBusinessId: jest.fn() } },
        { provide: UNIT_REPOSITORY, useValue: createMockUnitRepository() },
        { provide: SIMULATION_V2_REPOSITORY, useValue: { findByBusinessId: jest.fn() } },
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
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: LifecycleTelemetryService, useValue: {} },
        {
          provide: MailRetryService,
          useValue: { enqueue: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: MailService, useValue: { sendMail: jest.fn().mockResolvedValue(undefined) } },
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

    service = module.get<ReportsService>(ReportsService);

    // Spy on logger methods to verify diagnostic logging
    loggerWarnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();
    loggerDebugSpy = jest.spyOn(service['logger'], 'debug').mockImplementation();
  });

  afterEach(() => {
    loggerWarnSpy.mockRestore();
    loggerDebugSpy.mockRestore();
  });

  describe('Unit Tests: Score Clamping & Validation', () => {
    it('Should clamp AI rubric score exceeding 100 to 100 via service method', () => {
      // Create mock rubric items with invalid score
      const rubricItems: Record<string, Record<string, unknown>> = {
        'communication-1': {
          id: 'communication-1',
          subCategory: 'Communication',
          score: 150, // INVALID: exceeds 100
        },
      };

      // Call the private method through type casting
      (service as unknown as { clampAiRubricScores(items: any): void }).clampAiRubricScores(
        rubricItems,
      );

      // Verify the score was clamped
      expect(rubricItems['communication-1'].score).toBe(100);

      // Verify logger was called with [SCORE-VALIDATION] prefix
      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('[SCORE-VALIDATION]'));
      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('150'));
      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('100'));
    });

    it('Should clamp AI rubric score below 0 to 0 via service method', () => {
      const rubricItems: Record<string, Record<string, unknown>> = {
        'test-item': {
          id: 'test-item',
          subCategory: 'TestCategory',
          score: -25, // INVALID: below 0
        },
      };

      (service as unknown as { clampAiRubricScores(items: any): void }).clampAiRubricScores(
        rubricItems,
      );

      expect(rubricItems['test-item'].score).toBe(0);
      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('[SCORE-VALIDATION]'));
    });

    it('Should preserve valid AI rubric scores within 0-100', () => {
      const validScores = [0, 50, 75, 100];
      validScores.forEach((score) => {
        const rubricItems: Record<string, Record<string, unknown>> = {
          item: {
            id: 'item',
            score,
          },
        };

        loggerWarnSpy.mockClear();
        (service as unknown as { clampAiRubricScores(items: any): void }).clampAiRubricScores(
          rubricItems,
        );

        // Score should remain unchanged
        expect(rubricItems['item'].score).toBe(score);
        // Logger should NOT be called for valid scores
        expect(loggerWarnSpy).not.toHaveBeenCalled();
      });
    });

    it('Should handle extreme invalid values like 187.5 via service method', () => {
      const rubricItems: Record<string, Record<string, unknown>> = {
        'extreme-item': {
          id: 'extreme-item',
          score: 187.5,
        },
      };

      (service as unknown as { clampAiRubricScores(items: any): void }).clampAiRubricScores(
        rubricItems,
      );

      expect(rubricItems['extreme-item'].score).toBe(100);
      expect(loggerWarnSpy).toHaveBeenCalled();
    });

    it('Should handle extreme negative values like -50 via service method', () => {
      const rubricItems: Record<string, Record<string, unknown>> = {
        'negative-item': {
          id: 'negative-item',
          score: -50,
        },
      };

      (service as unknown as { clampAiRubricScores(items: any): void }).clampAiRubricScores(
        rubricItems,
      );

      expect(rubricItems['negative-item'].score).toBe(0);
    });

    it('Should clamp final overall score when exceeding 100 via service method', () => {
      // Call the private clampOverallScore method
      const result = (
        service as unknown as { clampOverallScore(score: number): number }
      ).clampOverallScore(125.5);

      expect(result).toBe(100);
      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('[SCORE-VALIDATION]'));
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Final overall score exceeded bounds'),
      );
    });

    it('Should clamp final overall score when negative via service method', () => {
      const result = (
        service as unknown as { clampOverallScore(score: number): number }
      ).clampOverallScore(-50);

      expect(result).toBe(0);
      expect(loggerWarnSpy).toHaveBeenCalled();
    });

    it('Should return score unchanged when within 0-100 bounds', () => {
      const validScores = [0, 25, 50, 75, 100];
      validScores.forEach((score) => {
        loggerWarnSpy.mockClear();
        const result = (
          service as unknown as { clampOverallScore(score: number): number }
        ).clampOverallScore(score);

        expect(result).toBe(score);
        expect(loggerWarnSpy).not.toHaveBeenCalled();
      });
    });

    it('Should clamp rubric score at weighted-calc site (defense-in-depth) via service method', () => {
      // Directly addresses client comment: clamp before (score * weight) / 100 at weighted-calc site.
      const item = { id: 'actions-1', name: 'Actions & Interventions', subCategory: 'Actions' };
      const result = (
        service as unknown as {
          clampWeightedRubricScore(score: number, item: unknown): number;
        }
      ).clampWeightedRubricScore(150, item);

      expect(result).toBe(100);
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[SCORE-VALIDATION] Rubric score exceeded bounds at weighted-calc site',
        ),
      );
      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Item: actions-1'));
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Name: Actions & Interventions'),
      );
    });

    it('Should prevent (150 * 45)/100 = 67.5 bug from client report via weighted-calc clamp', () => {
      const item = { id: 'ai-1', name: 'AI Item', subCategory: 'Communication' };
      const weight = 45;
      const invalidAiScore = 150;

      const clampedScore = (
        service as unknown as {
          clampWeightedRubricScore(score: number, item: unknown): number;
        }
      ).clampWeightedRubricScore(invalidAiScore, item);

      const weightedContribution = (clampedScore * weight) / 100;

      // Without clamp: (150 * 45) / 100 = 67.5 which exceeds the weight (45).
      // With clamp:    (100 * 45) / 100 = 45 which equals the weight (the max valid contribution).
      expect(clampedScore).toBe(100);
      expect(weightedContribution).toBe(45);
      expect(weightedContribution).toBeLessThanOrEqual(weight);
    });

    it('Should return score unchanged at weighted-calc site when within bounds', () => {
      const item = { id: 'x', name: 'X', subCategory: 'X' };
      const validScores = [0, 42.5, 100];
      validScores.forEach((score) => {
        loggerWarnSpy.mockClear();
        const result = (
          service as unknown as {
            clampWeightedRubricScore(score: number, item: unknown): number;
          }
        ).clampWeightedRubricScore(score, item);

        expect(result).toBe(score);
        expect(loggerWarnSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('Unit Tests: Diagnostic Logging', () => {
    it('Should log [SCORE-VALIDATION] when AI rubric score is clamped', () => {
      const rubricItems: Record<string, Record<string, unknown>> = {
        'communication-1': {
          id: 'communication-1',
          subCategory: 'Communication',
          score: 150,
        },
      };

      (service as unknown as { clampAiRubricScores(items: any): void }).clampAiRubricScores(
        rubricItems,
      );

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[SCORE-VALIDATION] Invalid AI-generated rubric score detected and clamped',
        ),
      );
      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Item: communication-1'));
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('SubCategory: Communication'),
      );
      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Original Score: 150'));
      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Clamped Score: 100'));
    });

    it('Should log [SCORE-VALIDATION] when final overall score is clamped', () => {
      (service as unknown as { clampOverallScore(score: number): number }).clampOverallScore(125.5);

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[SCORE-VALIDATION] Final overall score exceeded bounds and was clamped',
        ),
      );
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Original Score: 125.50%'),
      );
      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Clamped Score: 100.00%'));
    });

    it('Should not log when score is within valid bounds', () => {
      const rubricItems: Record<string, Record<string, unknown>> = {
        'item-1': {
          id: 'item-1',
          subCategory: 'Category',
          score: 85,
        },
      };

      loggerWarnSpy.mockClear();
      (service as unknown as { clampAiRubricScores(items: any): void }).clampAiRubricScores(
        rubricItems,
      );

      expect(loggerWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Integration Tests: Score Validation in Grading Pipeline', () => {
    it('Should never allow final report score to exceed 100 regardless of input via service method', () => {
      const overRangeScores = [150, 125, 187.5, 200, 300];
      overRangeScores.forEach((score) => {
        const result = (
          service as unknown as { clampOverallScore(score: number): number }
        ).clampOverallScore(score);
        expect(result).toBeLessThanOrEqual(100);
      });
    });

    it('Should maintain score integrity for valid calculations via service method', () => {
      const validScores = [0, 25, 50, 75, 100];
      validScores.forEach((score) => {
        loggerWarnSpy.mockClear();
        const result = (
          service as unknown as { clampOverallScore(score: number): number }
        ).clampOverallScore(score);
        expect(result).toBe(score);
        expect(loggerWarnSpy).not.toHaveBeenCalled();
      });
    });

    it('Should handle weighted grading with multiple rubric items via service methods', () => {
      const rubricItems: Record<string, Record<string, unknown>> = {
        'item-1': { id: 'item-1', subCategory: 'Category', score: 150 },
        'item-2': { id: 'item-2', subCategory: 'Category', score: 80 },
        'item-3': { id: 'item-3', subCategory: 'Category', score: 90 },
        'item-4': { id: 'item-4', subCategory: 'Category', score: 100 },
      };
      const weights = { 'item-1': 25, 'item-2': 25, 'item-3': 25, 'item-4': 25 };

      (service as unknown as { clampAiRubricScores(items: any): void }).clampAiRubricScores(
        rubricItems,
      );

      const totalWeightedScore = Object.entries(rubricItems).reduce((sum, [id, item]) => {
        return sum + ((item.score as number) / 100) * weights[id as keyof typeof weights];
      }, 0);
      const finalScore = (
        service as unknown as { clampOverallScore(score: number): number }
      ).clampOverallScore(totalWeightedScore);

      expect(rubricItems['item-1'].score).toBe(100);
      expect(rubricItems['item-1'].score).not.toBe(150);
      expect(finalScore).toBeLessThanOrEqual(100);
      expect(finalScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge Cases & Regression Prevention', () => {
    it('Should handle rubric with all invalid scores via service method', () => {
      const rubricItems: Record<string, Record<string, unknown>> = {
        '1': { id: '1', score: 150 },
        '2': { id: '2', score: 187.5 },
        '3': { id: '3', score: 125 },
        '4': { id: '4', score: -30 },
      };

      (service as unknown as { clampAiRubricScores(items: any): void }).clampAiRubricScores(
        rubricItems,
      );

      expect(rubricItems['1'].score).toBe(100);
      expect(rubricItems['2'].score).toBe(100);
      expect(rubricItems['3'].score).toBe(100);
      expect(rubricItems['4'].score).toBe(0);
    });

    it('Should map clamped 150 to Excellent performance label via service method', () => {
      const clamped = (
        service as unknown as { clampOverallScore(score: number): number }
      ).clampOverallScore(150);

      const performanceCategories = [
        { score: 90, label: 'Excellent' },
        { score: 75, label: 'Good' },
        { score: 60, label: 'Satisfactory' },
        { score: 40, label: 'Needs Improvement' },
        { score: 0, label: 'Critical' },
      ];
      const label = performanceCategories.find((p) => clamped >= p.score)?.label;
      expect(clamped).toBe(100);
      expect(label).toBe('Excellent');
    });

    it('Should handle floating point precision correctly via service method', () => {
      const overRange = [100.0000001, 100.000000001];
      overRange.forEach((score) => {
        const result = (
          service as unknown as { clampOverallScore(score: number): number }
        ).clampOverallScore(score);
        expect(result).toBeLessThanOrEqual(100);
      });

      const belowRange = [-0.0000001];
      belowRange.forEach((score) => {
        const result = (
          service as unknown as { clampOverallScore(score: number): number }
        ).clampOverallScore(score);
        expect(result).toBeGreaterThanOrEqual(0);
      });
    });

    it('Should not alter valid deterministic scores via service method', () => {
      const deterministicScore = 85;
      loggerWarnSpy.mockClear();
      const result = (
        service as unknown as { clampOverallScore(score: number): number }
      ).clampOverallScore(deterministicScore);

      expect(result).toBe(85);
      expect(loggerWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Regression Tests: Reported Scenarios from Ticket', () => {
    it('Should clamp Actions & Interventions score of 115.5 (from ticket) via service method', () => {
      const result = (
        service as unknown as { clampOverallScore(score: number): number }
      ).clampOverallScore(115.5);

      expect(result).toBe(100);
      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('[SCORE-VALIDATION]'));
    });

    it('Should clamp rubric score of 187.5 (from ticket) via service method', () => {
      const rubricItems: Record<string, Record<string, unknown>> = {
        'rubric-actions': { id: 'rubric-actions', score: 187.5 },
      };
      (service as unknown as { clampAiRubricScores(items: any): void }).clampAiRubricScores(
        rubricItems,
      );

      expect(rubricItems['rubric-actions'].score).toBe(100);
    });

    it('Should clamp all reported invalid values (106.67, 125, 150, 187.5) via service method', () => {
      const rubricItems: Record<string, Record<string, unknown>> = {
        '1': { id: '1', score: 106.67 },
        '2': { id: '2', score: 125 },
        '3': { id: '3', score: 150 },
        '4': { id: '4', score: 187.5 },
      };
      (service as unknown as { clampAiRubricScores(items: any): void }).clampAiRubricScores(
        rubricItems,
      );

      Object.values(rubricItems).forEach((item) => {
        expect(item.score).toBe(100);
      });
    });
  });
});
