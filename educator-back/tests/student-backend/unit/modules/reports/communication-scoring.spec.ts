import { Test } from '@nestjs/testing';
import { ReportsService, normalize } from '@/modules/reports/reports.service';
import { JsonDataService } from '@/data/json-data.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { ActionsInterventionsService } from '@/modules/reports/actions-interventions.service';
import { PpePrivacyService } from '@/modules/reports/ppe-privacy.service';
import { ClinicalDocumentationService } from '@/modules/reports/clinical-documentation.service';
import { CommunicationService } from '@/modules/reports/communication.service';
import { TimelineTimingService } from '@/modules/reports/timeline-timing.service';
import { SequencingService } from '@/modules/reports/sequencing.service';
import { LifecycleTelemetryService } from '@/modules/telemetry/lifecycle-telemetry.service';

describe('ReportsService - Communication Scoring', () => {
  let service: ReportsService;

  beforeEach(async () => {
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
        { provide: JsonDataService, useValue: {} },
        { provide: ConfigService, useValue: {} },
        { provide: HttpService, useValue: {} },
        { provide: LifecycleTelemetryService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ReportsService);
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

  describe('evaluateConversationQualityEnhanced', () => {
    it('should score high for professional and empathetic messages', () => {
      const messages = [
        { speaker: 'student', text: 'Hello, please tell me how you feel.' },
        {
          speaker: 'student',
          text: 'I understand that must be difficult, thank you for sharing.',
        },
        { speaker: 'student', text: 'Can you tell me more about your pain?' },
      ];
      const result = (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).evaluateConversationQualityEnhanced(messages) as Record<string, unknown>;

      expect(result.professionalismScore).toBeGreaterThan(0);
      expect(result.questionCount).toBeGreaterThan(0);
      expect(result.engagementScore).toBeGreaterThan(3);
    });

    it('should score low for unprofessional language', () => {
      const messages = [
        { speaker: 'student', text: 'hey what is up' },
        { speaker: 'student', text: 'um like whatever' },
      ];
      const result = (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).evaluateConversationQualityEnhanced(messages) as Record<string, unknown>;

      expect(result.professionalismScore).toBeLessThan(0);
    });

    it('should handle empty messages array', () => {
      const result = (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).evaluateConversationQualityEnhanced([]) as Record<string, unknown>;
      expect(result.messageCount).toBe(0);
      expect(result.engagementScore).toBe(0);
    });
  });

  describe('calculateScoresStrict', () => {
    const defaultData = {
      coverage: 50,
      askedFields: ['name'],
      missingFields: ['allergies'],
      criticalMissing: [],
    };
    const defaultPhases = {
      completedTasks: 0,
      totalTasks: 0,
      completedPhases: 0,
      totalPhases: 0,
      phaseDetails: [],
    };
    const defaultActions = {
      totalExpected: 0,
      totalMentioned: 0,
      totalTaken: 0,
      mentionedInConversation: {
        labs: 0,
        imaging: 0,
        physicalExam: 0,
        medications: 0,
      },
      completionRate: 0,
    };
    const defaultConversation = {
      messageCount: 5,
      avgResponseLength: 20,
      professionalismScore: 5,
      questionCount: 2,
      engagementScore: 5,
    };
    const defaultReqs = { met: 0, total: 0, details: [] };

    it('should yield score 0 if message count is 0', () => {
      const result = (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).calculateScoresStrict(
        defaultData,
        defaultPhases,
        defaultActions,
        defaultConversation,
        defaultReqs,
        0,
      ) as Record<string, unknown>;
      expect(result.overallScore).toBe(0);
    });

    it('should apply heavy penalty for missing critical fields like allergies', () => {
      const patientData = { ...defaultData, criticalMissing: ['allergies'] };
      const result = (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).calculateScoresStrict(
        patientData,
        defaultPhases,
        defaultActions,
        defaultConversation,
        defaultReqs,
        5,
      ) as Record<string, unknown>;
      // Base score is around 40-60, penalty is 15
      expect(result.clinicalJudgment).toBeLessThan(3);
    });

    it('should be deterministic (same input = same output)', () => {
      const run1 = (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).calculateScoresStrict(
        defaultData,
        defaultPhases,
        defaultActions,
        defaultConversation,
        defaultReqs,
        5,
      ) as Record<string, unknown>;
      const run2 = (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).calculateScoresStrict(
        defaultData,
        defaultPhases,
        defaultActions,
        defaultConversation,
        defaultReqs,
        5,
      ) as Record<string, unknown>;
      expect(run1).toEqual(run2);
    });

    it('should award communication points based on quality', () => {
      const highQualityConv = {
        ...defaultConversation,
        questionCount: 10,
        professionalismScore: 10,
      };
      const lowQualityConv = {
        ...defaultConversation,
        questionCount: 0,
        professionalismScore: -5,
      };

      const scoreHigh = (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).calculateScoresStrict(
        defaultData,
        defaultPhases,
        defaultActions,
        highQualityConv,
        defaultReqs,
        5,
      ) as Record<string, unknown>;
      const scoreLow = (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).calculateScoresStrict(
        defaultData,
        defaultPhases,
        defaultActions,
        lowQualityConv,
        defaultReqs,
        5,
      ) as Record<string, unknown>;

      expect(scoreHigh.communication as number).toBeGreaterThan(scoreLow.communication as number);
    });
  });

  describe('Edge Cases in buildDynamicAssessment', () => {
    it('should return 0 score and critical improvements for empty transcript', () => {
      const result = (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).buildDynamicAssessment({
        messages: [],
        scenario: {},
      }) as { score: number; scoreJson: { overallScore: number }; improvements: string[] };

      expect(result.score).toBe(0);
      expect(result.scoreJson.overallScore).toBe(0);
      expect(result.improvements).toContain('CRITICAL: No questions were asked to the patient');
    });

    it('should return 0 score for transcript with only empty messages', () => {
      const result = (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).buildDynamicAssessment({
        messages: [{ speaker: 'student', text: '   ', timestamp: '...' }],
        scenario: {},
      }) as { score: number };

      expect(result.score).toBe(0);
    });
  });
});
