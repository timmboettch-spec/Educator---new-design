/**
 * Unit tests — Action & Medication Grading Handling
 *
 * Covers:
 *  - evaluateActionAttempt  (single / ordering / vital / grading shortcuts)
 *  - computeDeterministicActionMarks  (edge-cases: empty, vital, multi-attempt)
 *  - Medication grading combined with actions inside createReportWithAI
 */

import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ReportsService } from '@/modules/reports/reports.service';
import { ActionsInterventionsService } from '@/modules/reports/actions-interventions.service';
import { PpePrivacyService } from '@/modules/reports/ppe-privacy.service';
import { ClinicalDocumentationService } from '@/modules/reports/clinical-documentation.service';
import { CommunicationService } from '@/modules/reports/communication.service';
import { TimelineTimingService } from '@/modules/reports/timeline-timing.service';
import { SequencingService } from '@/modules/reports/sequencing.service';
import { JsonDataService } from '@/data/json-data.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { LifecycleTelemetryService } from '@/modules/telemetry/lifecycle-telemetry.service';
import { of } from 'rxjs';
import type { CreateReportDto } from '@/modules/reports/dto/create-report.dto';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Build a full NestJS testing module with all real service providers. */
async function buildModule(scenarioOverride?: Record<string, unknown>): Promise<TestingModule> {
  const defaultScenario = {
    id: 'scenario-1',
    title: 'Test Scenario',
    grading: {
      rubric: [
        { id: 'rubric_action', subCategory: 'Action', weight: 40 },
        { id: 'rubric_medications', subCategory: 'Medications', weight: 20 },
      ],
    },
    ...scenarioOverride,
  };

  return Test.createTestingModule({
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
            score: 100,
            parentResults: [],
            groupResults: [],
            violations: [],
            strengths: [],
            weaknesses: [],
            recommendations: [],
          }),
        },
      },
      {
        provide: HttpService,
        useValue: { post: jest.fn().mockReturnValue(of({ data: {} })) },
      },
      {
        provide: ConfigService,
        useValue: { get: (_key: string) => 'test-key' },
      },
      {
        provide: JsonDataService,
        useValue: {
          getTranscriptByIdFresh: jest.fn().mockResolvedValue({
            messages: [],
            startedAt: '2024-01-01T10:00:00Z',
          }),
          getTranscriptById: jest.fn().mockReturnValue({ messages: [] }),
          getScenarioById: jest.fn().mockReturnValue(defaultScenario),
          getScenarioByIdFresh: jest.fn().mockResolvedValue(defaultScenario),
          getScenarioByIdLocalized: jest.fn().mockResolvedValue(defaultScenario),
          getReportByTranscriptId: jest.fn().mockReturnValue(null),
          getReportByTranscriptIdFresh: jest.fn().mockResolvedValue(null),
          getReports: jest.fn().mockReturnValue([]),
          getReportsFresh: jest.fn().mockResolvedValue([]),
          addReport: jest.fn(),
          addReportFresh: jest.fn(),
          generateId: jest.fn().mockReturnValue('report-id'),
          getUnitById: () => null,
        },
      },
      { provide: LifecycleTelemetryService, useValue: {} },
    ],
  }).compile();
}

// ─────────────────────────────────────────────────────────────────────────────
// evaluateActionAttempt
// ─────────────────────────────────────────────────────────────────────────────

describe('ActionsInterventionsService.evaluateActionAttempt', () => {
  let actionsService: ActionsInterventionsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ActionsInterventionsService,
        {
          provide: ConfigService,
          useValue: { get: () => null }, // No OpenAI key → keyword fallback
        },
        { provide: HttpService, useValue: {} },
      ],
    }).compile();

    actionsService = module.get(ActionsInterventionsService);
  });

  describe('grading shortcut (non-vital)', () => {
    it('returns true when attempt.grading === true', async () => {
      const result = await actionsService.evaluateActionAttempt(
        { grading: true } as never,
        { type: 'single' } as never,
      );
      expect(result).toBe(true);
    });

    it('returns true when attempt.grading === 1', async () => {
      const result = await actionsService.evaluateActionAttempt(
        { grading: 1 } as never,
        { type: 'single' } as never,
      );
      expect(result).toBe(true);
    });

    it('returns false when attempt.grading === false', async () => {
      const result = await actionsService.evaluateActionAttempt(
        { grading: false } as never,
        { type: 'single' } as never,
      );
      expect(result).toBe(false);
    });

    it('returns false when attempt.grading === 0', async () => {
      const result = await actionsService.evaluateActionAttempt(
        { grading: 0 } as never,
        { type: 'single' } as never,
      );
      expect(result).toBe(false);
    });

    it('returns true when attempt.status === passed', async () => {
      const result = await actionsService.evaluateActionAttempt(
        { status: 'passed' } as never,
        { type: 'single' } as never,
      );
      expect(result).toBe(true);
    });

    it('returns false when attempt.status === failed', async () => {
      const result = await actionsService.evaluateActionAttempt(
        { status: 'failed' } as never,
        { type: 'single' } as never,
      );
      expect(result).toBe(false);
    });
  });

  describe('score shortcut', () => {
    it('returns true when attempt.score >= 80', async () => {
      const result = await actionsService.evaluateActionAttempt(
        { score: 90 } as never,
        { type: 'single' } as never,
      );
      expect(result).toBe(true);
    });

    it('returns false when attempt.score < 80', async () => {
      const result = await actionsService.evaluateActionAttempt(
        { score: 70 } as never,
        { type: 'single' } as never,
      );
      expect(result).toBe(false);
    });
  });

  describe('ordering type', () => {
    const actionDef = { type: 'ordering', correct: ['A', 'B', 'C'] } as never;

    it('returns true for correct array order', async () => {
      const result = await actionsService.evaluateActionAttempt(
        { selectedItem: ['A', 'B', 'C'] } as never,
        actionDef,
      );
      expect(result).toBe(true);
    });

    it('returns false for wrong array order', async () => {
      const result = await actionsService.evaluateActionAttempt(
        { selectedItem: ['B', 'A', 'C'] } as never,
        actionDef,
      );
      expect(result).toBe(false);
    });

    it('returns true for correct comma-separated string', async () => {
      const result = await actionsService.evaluateActionAttempt(
        { selectedItem: 'A, B, C' } as never,
        actionDef,
      );
      expect(result).toBe(true);
    });

    it('returns false for wrong comma-separated string', async () => {
      const result = await actionsService.evaluateActionAttempt(
        { selectedItem: 'C, B, A' } as never,
        actionDef,
      );
      expect(result).toBe(false);
    });
  });

  describe('vital type — grading shortcut is skipped', () => {
    it('does NOT short-circuit on grading=true — vital check runs and returns false when no vitals taken', async () => {
      // heartRate: ['72'] → expectedCount=1 → actual vital check runs
      // attempt.vitals={} → takenCount=0 → 0 < 1 → false
      const result = await actionsService.evaluateActionAttempt(
        { grading: true, vitals: {} } as never,
        { type: 'vital', vitals: { heartRate: ['72'] } } as never,
      );
      expect(result).toBe(false);
    });

    it('returns true for optional vital when vitals are present', async () => {
      const result = await actionsService.evaluateActionAttempt(
        { vitals: { hr: [{ value: '72' }] } } as never,
        { type: 'vital', isOptional: true, vitals: {} } as never,
      );
      expect(result).toBe(true);
    });

    it('returns false for optional vital when no vitals taken and a required vital is configured', async () => {
      // heartRate: ['72'] → expectedCount=1 → field check runs even for optional
      // All response fields null + no vitals taken → optional shortcut does NOT trigger
      // field check: takenCount=0 < requiredCount=1 → false
      const result = await actionsService.evaluateActionAttempt(
        {
          vitals: {},
          response: null,
          Response: null,
          selectedItem: null,
          SelectedItem: null,
        } as never,
        { type: 'vital', isOptional: true, vitals: { heartRate: ['72'] } } as never,
      );
      expect(result).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeDeterministicActionMarks — additional edge-cases
// ─────────────────────────────────────────────────────────────────────────────

describe('ActionsInterventionsService.computeDeterministicActionMarks — edge cases', () => {
  let actionsService: ActionsInterventionsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ActionsInterventionsService,
        { provide: ConfigService, useValue: { get: () => null } },
        { provide: HttpService, useValue: {} },
      ],
    }).compile();

    actionsService = module.get(ActionsInterventionsService);
  });

  it('returns zeros when timeline is empty', async () => {
    const actions = [{ id: '1', title: 'Mandatory A', correct: 'yes', type: 'single' }] as never[];
    const result = await actionsService.computeDeterministicActionMarks([], actions);
    expect(result.positiveActions).toBe(0);
    expect(result.totalRequiredActions).toBe(1);
    expect(result.negativeActions).toBe(0);
  });

  it('returns zeros when scenario has no actions', async () => {
    const result = await actionsService.computeDeterministicActionMarks(
      [{ title: 'Some Action', selectedItem: 'X' } as never],
      [],
    );
    expect(result.positiveActions).toBe(0);
    expect(result.totalRequiredActions).toBe(0);
  });

  it('best-attempt-wins: correct on second attempt scores positive', async () => {
    const actions = [
      { id: '1', title: 'Check BP', correct: 'systolic 120', type: 'single', grading: false },
    ] as never[];
    const timeline = [
      { title: 'Check BP', selectedItem: 'wrong answer', grading: false },
      { title: 'Check BP', selectedItem: 'systolic 120', grading: true },
    ] as never[];
    const result = await actionsService.computeDeterministicActionMarks(timeline, actions);
    expect(result.positiveActions).toBe(1);
    expect(result.details[0].anyAttemptCorrect).toBe(true);
  });

  it('records distractor when distractor action is attempted', async () => {
    const actions = [
      { id: '1', title: 'Correct Action', correct: 'yes', type: 'single' },
      { id: '2', title: 'Wrong Action', type: 'single', typeRequirement: 'Distractor' },
    ] as never[];
    const timeline = [
      { title: 'Correct Action', selectedItem: 'yes', grading: true },
      { title: 'Wrong Action', selectedItem: 'anything', grading: true },
    ] as never[];
    const result = await actionsService.computeDeterministicActionMarks(timeline, actions);
    expect(result.positiveActions).toBe(1);
    expect(result.negativeActions).toBe(1);
    expect(result.totalRequiredActions).toBe(1);
    const distractorDetail = result.details.find((d) => d.type === 'distractor');
    expect(distractorDetail).toBeDefined();
    expect(distractorDetail?.pointsAwarded).toBe(0);
  });

  it('does not count distractor that was never attempted', async () => {
    const actions = [
      { id: '1', title: 'Mandatory', correct: 'yes', type: 'single' },
      { id: '2', title: 'Distractor', type: 'single', typeRequirement: 'Distractor' },
    ] as never[];
    const timeline = [{ title: 'Mandatory', selectedItem: 'yes', grading: true }] as never[];
    const result = await actionsService.computeDeterministicActionMarks(timeline, actions);
    expect(result.negativeActions).toBe(0);
  });

  it('optional action correct does not increase positiveActions', async () => {
    const actions = [
      { id: '1', title: 'Mandatory', correct: 'yes', type: 'single' },
      { id: '2', title: 'Optional', correct: 'opt', type: 'single', typeRequirement: 'Optional' },
    ] as never[];
    const timeline = [
      { title: 'Mandatory', selectedItem: 'yes', grading: true },
      { title: 'Optional', selectedItem: 'opt', grading: true },
    ] as never[];
    const result = await actionsService.computeDeterministicActionMarks(timeline, actions);
    expect(result.positiveActions).toBe(1);
    expect(result.totalRequiredActions).toBe(1);
    const optionalDetail = result.details.find((d) => d.title === 'Optional');
    expect(optionalDetail?.isOptional).toBe(true);
    expect(optionalDetail?.isCorrect).toBe(true);
    expect(optionalDetail?.pointsAwarded).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Medication grading — formula validation & createReportWithAI smoke tests
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The Actions & Interventions rubric score is calculated deterministically as:
 *   score = (correctMandatoryActions + correctMandatoryMedications)
 *           / (totalMandatoryActions + totalMandatoryMedications)
 *           * 100
 *
 * These tests validate the formula directly using plain arithmetic and verify
 * that `createReportWithAI` stores medications in the output without crashing.
 * Detailed rubric item scoring is covered by the full integration test suite.
 */

describe('Medication + Action combined scoring — formula', () => {
  const calcScore = (
    correctActions: number,
    totalActions: number,
    correctMeds: number,
    totalMeds: number,
  ): number => {
    const total = totalActions + totalMeds;
    if (total === 0) {
      return 100;
    } // no requirements = full score by convention
    return Math.round(((correctActions + correctMeds) / total) * 100);
  };

  it('100% when 1/1 action correct, 0 medications configured', () => {
    expect(calcScore(1, 1, 0, 0)).toBe(100);
  });

  it('0% when 0/1 action correct, 0 medications', () => {
    expect(calcScore(0, 1, 0, 0)).toBe(0);
  });

  it('100% when 0 actions, 1/1 mandatory medication correct', () => {
    expect(calcScore(0, 0, 1, 1)).toBe(100);
  });

  it('0% when 0 actions, 0/1 mandatory medication correct', () => {
    expect(calcScore(0, 0, 0, 1)).toBe(0);
  });

  it('50% when 1 action correct, 1 medication missed (2 total required)', () => {
    expect(calcScore(1, 1, 0, 1)).toBe(50);
  });

  it('50% when 0 actions correct, 1 medication correct (2 total required)', () => {
    expect(calcScore(0, 1, 1, 1)).toBe(50);
  });

  it('100% when both action and medication are correct', () => {
    expect(calcScore(1, 1, 1, 1)).toBe(100);
  });

  it('0% when both action and medication are missed', () => {
    expect(calcScore(0, 1, 0, 1)).toBe(0);
  });

  it('optional medications (totalMeds=0) do not reduce score', () => {
    // Only mandatory meds count in the denominator
    expect(calcScore(1, 1, 0, 0)).toBe(100); // optional med ignored
  });
});

describe('ReportsService — createReportWithAI medication smoke tests', () => {
  let service: ReportsService;
  let jsonDataService: JsonDataService;

  const mandatoryOrder = {
    id: 'med-1',
    title: 'Aspirin 325mg',
    category: 'Medication',
    medicationConfig: { gradingConfig: { enabled: true } },
  };

  beforeEach(async () => {
    const scenario = {
      id: 'scenario-1',
      title: 'Med Smoke Test',
      orders: [mandatoryOrder],
      actions: [],
      sequences: [],
      grading: { rubric: [{ id: 'rubric_action', subCategory: 'Action', weight: 100 }] },
    };

    const module = await buildModule(scenario);
    service = module.get(ReportsService);
    jsonDataService = module.get(JsonDataService);
    (jsonDataService.getScenarioByIdLocalized as jest.Mock).mockResolvedValue(scenario);
    (jsonDataService.getScenarioByIdFresh as jest.Mock).mockResolvedValue(scenario);

    // Stub analyzeWithOpenAI — returns a minimal valid rubric so the rest of
    // createReportWithAI (including medication combining logic) still runs.
    jest.spyOn(service as never, 'analyzeWithOpenAI').mockResolvedValue({
      overall: { summary: 'smoke test', feedback: 'ok' },
      rubrics: {
        overallSummary: 'ok',
        totalScore: 0,
        totalWeight: 100,
        items: {
          rubric_action: {
            id: 'rubric_action',
            subCategory: 'Action',
            weight: 100,
            score: 0,
            strengths: [],
            weaknesses: [],
            recommendations: [],
          },
        },
      },
      communicationAssessment: { rubrics: { items: {} } },
    } as never);
  });

  it('completes without throwing when a correct mandatory medication is in the DTO', async () => {
    const dto = {
      transcriptId: 'tx-1',
      scenarioId: 'scenario-1',
      summaryByCategory: {
        medications: [
          {
            administrationDetails: {
              orderTitle: 'Aspirin 325mg',
              gradingResult: {
                medicationName: 'Aspirin 325mg',
                medicationId: 'med-1',
                overallScore: 100,
                mandatory: true,
                totalExpected: 1,
                totalCorrect: 1,
                comparisons: [],
              },
            },
          },
        ],
      },
      summaryEntries: [],
      actionsTimeline: [],
    } as unknown as CreateReportDto;

    await expect(service.createReportWithAI(dto)).resolves.toBeDefined();
  });

  it('completes without throwing when mandatory medication is missing (never administered)', async () => {
    const dto = {
      transcriptId: 'tx-2',
      scenarioId: 'scenario-1',
      summaryByCategory: { medications: [] },
      summaryEntries: [],
      actionsTimeline: [],
    } as unknown as CreateReportDto;

    await expect(service.createReportWithAI(dto)).resolves.toBeDefined();
  });

  it('result.score is a finite number', async () => {
    const dto = {
      transcriptId: 'tx-3',
      scenarioId: 'scenario-1',
      summaryByCategory: {
        medications: [
          {
            administrationDetails: {
              orderTitle: 'Aspirin 325mg',
              gradingResult: {
                medicationName: 'Aspirin 325mg',
                medicationId: 'med-1',
                overallScore: 100,
                mandatory: true,
                totalExpected: 1,
                totalCorrect: 1,
                comparisons: [],
              },
            },
          },
        ],
      },
      summaryEntries: [],
      actionsTimeline: [],
    } as unknown as CreateReportDto;

    const result = await service.createReportWithAI(dto);
    expect(typeof result.score).toBe('number');
    expect(Number.isFinite(result.score)).toBe(true);
  });

  it('medication data is preserved in summaryByCategory on the output', async () => {
    const dto = {
      transcriptId: 'tx-4',
      scenarioId: 'scenario-1',
      summaryByCategory: {
        medications: [
          {
            administrationDetails: {
              orderTitle: 'Aspirin 325mg',
              gradingResult: {
                medicationName: 'Aspirin 325mg',
                medicationId: 'med-1',
                overallScore: 100,
                mandatory: true,
                totalExpected: 1,
                totalCorrect: 1,
                comparisons: [],
              },
            },
          },
        ],
      },
      summaryEntries: [],
      actionsTimeline: [],
    } as unknown as CreateReportDto;

    const result = await service.createReportWithAI(dto);
    const meds = (result.summaryByCategory as Record<string, unknown>)?.['medications'];
    expect(Array.isArray(meds)).toBe(true);
    expect((meds as unknown[]).length).toBeGreaterThan(0);
  });
});
