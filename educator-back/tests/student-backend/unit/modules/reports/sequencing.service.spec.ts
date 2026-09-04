import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';

import { SequencingService } from '../../../../../src/student-backend/modules/reports/sequencing.service';
import { ActionsInterventionsService } from '../../../../../src/student-backend/modules/reports/actions-interventions.service';
import {
  type Scenario,
  type SequenceGroupDefinition,
} from '../../../../../src/student-backend/data/json-data.service';

describe('SequencingService - Group-Based Sequencing Tests', () => {
  let service: SequencingService;
  let configService: ConfigService;
  let httpService: HttpService;
  let actionsService: ActionsInterventionsService;

  // ══════════════════════════════════════════════════════════════════════════
  // MOCK HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  const createMockScenario = (overrides?: Partial<Scenario>): Scenario =>
    ({
      id: 'test-scenario',
      title: 'Test Scenario',
      actions: [
        { id: 'ppe.handHygiene', title: 'Hand Hygiene' },
        { id: 'patient.name', title: 'Patient Name' },
        { id: 'patient.age', title: 'Age' },
        { id: 'patient.chiefComplaint', title: 'Chief Complaint' },
        { id: 'patient.medicalHistory', title: 'Medical History' },
        { id: 'patient.allergies', title: 'Allergies' },
        { id: 'action_vitals_1', title: 'Check Vitals' },
      ],
      sequenceGroups: [],
      ...overrides,
    }) as Scenario;

  const createMockTranscriptMessage = (speaker: string, text: string, elapsedSeconds: number) => ({
    speaker,
    text,
    elapsedSeconds,
    timestampValue: 1000000 + elapsedSeconds * 1000,
    timestamp: new Date(1000000 + elapsedSeconds * 1000).toISOString(),
  });

  const formatSecondsToTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const createMockActionTimelineEntry = (
    id: string,
    title: string,
    elapsedSeconds: number | undefined,
    orderValue?: number,
  ) => ({
    id,
    title,
    elapsedSeconds,
    elapsedTimeFormatted: elapsedSeconds !== undefined ? formatSecondsToTime(elapsedSeconds) : '',
    orderValue:
      orderValue ?? (elapsedSeconds !== undefined ? 1000000 + elapsedSeconds * 1000 : undefined),
  });

  // ══════════════════════════════════════════════════════════════════════════
  // TEST SETUP
  // ══════════════════════════════════════════════════════════════════════════

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SequencingService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'OPENAI_API_KEY') {
                return 'test-api-key';
              }
              if (key === 'AI_MODEL') {
                return 'gpt-4o';
              }
              return undefined;
            }),
          },
        },
        {
          provide: HttpService,
          useValue: {
            post: jest.fn(),
          },
        },
        {
          provide: ActionsInterventionsService,
          useValue: {
            calculateSimilarity: jest.fn((s1: string, s2: string) => {
              const a = s1.toLowerCase();
              const b = s2.toLowerCase();
              if (a === b) {
                return 1.0;
              }
              if (a.includes(b) || b.includes(a)) {
                return 0.9;
              }
              const aWords = new Set(a.split(/\s+/));
              const bWords = new Set(b.split(/\s+/));
              const intersection = [...aWords].filter((word) => bWords.has(word));
              const union = new Set([...aWords, ...bWords]);
              return intersection.length / union.size;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SequencingService>(SequencingService);
    configService = module.get<ConfigService>(ConfigService);
    httpService = module.get<HttpService>(HttpService);
    actionsService = module.get<ActionsInterventionsService>(ActionsInterventionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // BASIC GROUP TESTS
  // ══════════════════════════════════════════════════════════════════════════

  describe('Basic Group Configuration', () => {
    it('should return default result when no sequence groups configured', async () => {
      const scenario = createMockScenario({ sequenceGroups: [] });
      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        [],
        undefined,
      );

      expect(result.score).toBeNull();
      expect(result.summary).toContain('No sequence groups configured');
      expect(result.parentResults).toHaveLength(0);
      expect(result.groupResults).toHaveLength(0);
    });

    it('should pass when single flexible group items are completed in any order', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'Demographics',
          mode: 'flexible',
          items: ['patient.name', 'patient.age'],
        },
      ];

      const scenario = createMockScenario({ sequenceGroups });
      const actionsTimeline = [
        createMockActionTimelineEntry('patient.age', 'Age', 10),
        createMockActionTimelineEntry('patient.name', 'Patient Name', 20),
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      expect(result.score).toBe(100);
      expect(result.groupResults).toHaveLength(2); // Overall + Group
      expect(result.groupResults?.find((g) => g.id === 'group_group1')?.passed).toBe(true);
    });

    it('should fail when not all items in a group are completed', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'Demographics',
          mode: 'flexible',
          items: ['patient.name', 'patient.age'],
        },
      ];

      const scenario = createMockScenario({ sequenceGroups });
      const actionsTimeline = [
        createMockActionTimelineEntry('patient.name', 'Patient Name', 10),
        // patient.age is missing
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      expect(result.score).toBeLessThan(100);
      const groupResult = result.groupResults?.find((g) => g.id === 'group_group1');
      expect(groupResult?.passed).toBe(false);
      expect(groupResult?.failedReasons).toEqual(
        expect.arrayContaining([expect.stringContaining('Age')]),
      );
    });

    it('should enforce strict order within a group', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'Demographics',
          mode: 'strict',
          items: ['patient.name', 'patient.age'],
        },
      ];

      const scenario = createMockScenario({ sequenceGroups });
      const actionsTimeline = [
        createMockActionTimelineEntry('patient.age', 'Age', 10),
        createMockActionTimelineEntry('patient.name', 'Patient Name', 20),
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      expect(result.score).toBeLessThan(100);
      const groupResult = result.groupResults?.find((g) => g.id === 'group_group1');
      expect(groupResult?.passed).toBe(false);
      expect(groupResult?.failedReasons).toEqual(
        expect.arrayContaining([expect.stringContaining('Age')]),
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // MULTIPLE GROUPS - STRICT MODE
  // ══════════════════════════════════════════════════════════════════════════

  describe('Multiple Groups - Strict Mode', () => {
    it('should pass when groups are completed in correct order (strict mode)', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'PPE',
          mode: 'flexible',
          items: ['ppe.handHygiene'],
        },
        {
          id: 'group2',
          label: 'Demographics',
          mode: 'flexible',
          items: ['patient.name', 'patient.age'],
        },
      ];

      const scenario = createMockScenario({
        sequenceGroups,
        sequenceGroupsOrderMode: 'strict' as const,
      });

      const actionsTimeline = [
        createMockActionTimelineEntry('ppe.handHygiene', 'Hand Hygiene', 5),
        createMockActionTimelineEntry('patient.name', 'Patient Name', 10),
        createMockActionTimelineEntry('patient.age', 'Age', 15),
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      expect(result.score).toBe(100);
      const overallResult = result.groupResults?.find((g) => g.type === 'overall');
      expect(overallResult?.passed).toBe(true);
    });

    it('should fail when groups overlap in strict mode', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'PPE',
          mode: 'flexible',
          items: ['ppe.handHygiene'],
        },
        {
          id: 'group2',
          label: 'Demographics',
          mode: 'flexible',
          items: ['patient.name', 'patient.age'],
        },
      ];

      const scenario = createMockScenario({
        sequenceGroups,
        sequenceGroupsOrderMode: 'strict' as const,
      });

      // Group 2 starts before Group 1 finishes
      const actionsTimeline = [
        createMockActionTimelineEntry('patient.name', 'Patient Name', 5),
        createMockActionTimelineEntry('ppe.handHygiene', 'Hand Hygiene', 10),
        createMockActionTimelineEntry('patient.age', 'Age', 15),
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      expect(result.score).toBeLessThan(100);
      const overallResult = result.groupResults?.find((g) => g.type === 'overall');
      expect(overallResult?.passed).toBe(false);
      expect(overallResult?.failedReasons).toEqual(
        expect.arrayContaining([expect.stringContaining('started')]),
      );
    });

    it('should fail when a group interrupts another group in strict mode', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'PPE',
          mode: 'flexible',
          items: ['ppe.handHygiene', 'ppe.donStandardGloves'],
        },
        {
          id: 'group2',
          label: 'Demographics',
          mode: 'flexible',
          items: ['patient.name', 'patient.age'],
        },
      ];

      const scenario = createMockScenario({
        sequenceGroups,
        sequenceGroupsOrderMode: 'strict' as const,
        actions: [
          { id: 'ppe.handHygiene', title: 'Hand Hygiene', order: 0, items: [], correct: '' },
          {
            id: 'ppe.donStandardGloves',
            title: 'Don Standard Gloves',
            order: 1,
            items: [],
            correct: '',
          },
          { id: 'patient.name', title: 'Patient Name', order: 2, items: [], correct: '' },
          { id: 'patient.age', title: 'Age', order: 3, items: [], correct: '' },
        ],
      });

      // Group 2 item interrupts Group 1
      const actionsTimeline = [
        createMockActionTimelineEntry('ppe.handHygiene', 'Hand Hygiene', 5),
        createMockActionTimelineEntry('patient.name', 'Patient Name', 10), // Interruption!
        createMockActionTimelineEntry('ppe.donStandardGloves', 'Don Standard Gloves', 15),
        createMockActionTimelineEntry('patient.age', 'Age', 20),
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      expect(result.score).toBeLessThan(100);
      const overallResult = result.groupResults?.find((g) => g.type === 'overall');
      expect(overallResult?.passed).toBe(false);
      expect(overallResult?.failedReasons.join(' ')).toContain('started');
      expect(overallResult?.failedReasons.join(' ')).toContain('Demographics');
      expect(overallResult?.failedReasons.join(' ')).toContain('PPE');
    });

    it('should fail when not all groups are completed in strict mode', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'PPE',
          mode: 'flexible',
          items: ['ppe.handHygiene'],
        },
        {
          id: 'group2',
          label: 'Demographics',
          mode: 'flexible',
          items: ['patient.name', 'patient.age'],
        },
      ];

      const scenario = createMockScenario({
        sequenceGroups,
        sequenceGroupsOrderMode: 'strict' as const,
      });

      // Only Group 1 completed
      const actionsTimeline = [createMockActionTimelineEntry('ppe.handHygiene', 'Hand Hygiene', 5)];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      expect(result.score).toBeLessThan(100);
      const overallResult = result.groupResults?.find((g) => g.type === 'overall');
      expect(overallResult?.passed).toBe(false);
      expect(overallResult?.failedReasons.join(' ')).toContain('did not complete');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // MULTIPLE GROUPS - FLEXIBLE MODE
  // ══════════════════════════════════════════════════════════════════════════

  describe('Multiple Groups - Flexible Mode', () => {
    it('should pass when groups are completed in any order (flexible mode)', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'PPE',
          mode: 'flexible',
          items: ['ppe.handHygiene'],
        },
        {
          id: 'group2',
          label: 'Demographics',
          mode: 'flexible',
          items: ['patient.name', 'patient.age'],
        },
      ];

      const scenario = createMockScenario({
        sequenceGroups,
        sequenceGroupsOrderMode: 'flexible' as const,
      });

      // Groups can be in any order in flexible mode
      const actionsTimeline = [
        createMockActionTimelineEntry('patient.name', 'Patient Name', 5),
        createMockActionTimelineEntry('patient.age', 'Age', 10),
        createMockActionTimelineEntry('ppe.handHygiene', 'Hand Hygiene', 15),
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      expect(result.score).toBe(100);
      const overallResult = result.groupResults?.find((g) => g.type === 'overall');
      expect(overallResult?.passed).toBe(true);
    });

    it('should fail when one group interrupts another in flexible mode', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'PPE',
          mode: 'flexible',
          items: ['ppe.handHygiene', 'ppe.donStandardGloves'],
        },
        {
          id: 'group2',
          label: 'Demographics',
          mode: 'flexible',
          items: ['patient.name', 'patient.age'],
        },
      ];

      const scenario = createMockScenario({
        sequenceGroups,
        sequenceGroupsOrderMode: 'flexible' as const,
        actions: [
          { id: 'ppe.handHygiene', title: 'Hand Hygiene', order: 0, items: [], correct: '' },
          {
            id: 'ppe.donStandardGloves',
            title: 'Don Standard Gloves',
            order: 1,
            items: [],
            correct: '',
          },
          { id: 'patient.name', title: 'Patient Name', order: 2, items: [], correct: '' },
          { id: 'patient.age', title: 'Age', order: 3, items: [], correct: '' },
        ],
      });

      // Group 2 item interrupts Group 1 (even in flexible mode, interruptions are not allowed)
      const actionsTimeline = [
        createMockActionTimelineEntry('ppe.handHygiene', 'Hand Hygiene', 5),
        createMockActionTimelineEntry('patient.name', 'Patient Name', 10), // Interruption!
        createMockActionTimelineEntry('ppe.donStandardGloves', 'Don Standard Gloves', 15),
        createMockActionTimelineEntry('patient.age', 'Age', 20),
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      expect(result.score).toBeLessThan(100);
      const overallResult = result.groupResults?.find((g) => g.type === 'overall');
      expect(overallResult?.passed).toBe(false);
      expect(overallResult?.failedReasons.join(' ')).toContain('started');
      expect(overallResult?.failedReasons.join(' ')).toContain('Demographics');
      expect(overallResult?.failedReasons.join(' ')).toContain('PPE');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SUBGROUPS
  // ══════════════════════════════════════════════════════════════════════════

  describe('Subgroups', () => {
    it('should pass when flexible subgroup items are completed in any order', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'Assessment',
          mode: 'flexible',
          items: ['patient.chiefComplaint'],
          subgroups: [
            {
              id: 'subgroup1',
              label: 'Demographics',
              mode: 'flexible',
              items: ['patient.name', 'patient.age'],
            },
          ],
        },
      ];

      const scenario = createMockScenario({ sequenceGroups });
      const actionsTimeline = [
        createMockActionTimelineEntry('patient.chiefComplaint', 'Chief Complaint', 5),
        createMockActionTimelineEntry('patient.age', 'Age', 10),
        createMockActionTimelineEntry('patient.name', 'Patient Name', 15),
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      expect(result.score).toBe(100);
      const subgroupResult = result.groupResults?.find((g) => g.id === 'subgroup_subgroup1');
      expect(subgroupResult?.passed).toBe(true);
    });

    it('should enforce strict order within a subgroup', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'Assessment',
          mode: 'flexible',
          items: ['patient.chiefComplaint'],
          subgroups: [
            {
              id: 'subgroup1',
              label: 'Demographics',
              mode: 'strict',
              items: ['patient.name', 'patient.age'],
            },
          ],
        },
      ];

      const scenario = createMockScenario({ sequenceGroups });
      const actionsTimeline = [
        createMockActionTimelineEntry('patient.chiefComplaint', 'Chief Complaint', 5),
        createMockActionTimelineEntry('patient.age', 'Age', 10),
        createMockActionTimelineEntry('patient.name', 'Patient Name', 15),
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      expect(result.score).toBeLessThan(100);
      const subgroupResult = result.groupResults?.find((g) => g.id === 'subgroup_subgroup1');
      expect(subgroupResult?.passed).toBe(false);
      expect(subgroupResult?.failedReasons).toEqual(
        expect.arrayContaining([expect.stringContaining('before')]),
      );
    });

    it('should fail when not all subgroup items are completed', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'Assessment',
          mode: 'flexible',
          items: ['patient.chiefComplaint'],
          subgroups: [
            {
              id: 'subgroup1',
              label: 'Demographics',
              mode: 'flexible',
              items: ['patient.name', 'patient.age'],
            },
          ],
        },
      ];

      const scenario = createMockScenario({ sequenceGroups });
      const actionsTimeline = [
        createMockActionTimelineEntry('patient.chiefComplaint', 'Chief Complaint', 5),
        createMockActionTimelineEntry('patient.name', 'Patient Name', 10),
        // patient.age is missing
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      expect(result.score).toBeLessThan(100);
      const subgroupResult = result.groupResults?.find((g) => g.id === 'subgroup_subgroup1');
      expect(subgroupResult?.passed).toBe(false);
      expect(subgroupResult?.failedReasons).toEqual(
        expect.arrayContaining([expect.stringContaining('Age')]),
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // TIMING CONSTRAINTS
  // ══════════════════════════════════════════════════════════════════════════

  describe('Timing Constraints', () => {
    it('should pass when item is within timing window of reference item', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'Assessment',
          mode: 'flexible',
          items: [
            'patient.name',
            {
              id: 'patient.age',
              timing: {
                mode: 'withinMinutes',
                withinMinutesFromStart: 1, // 60 seconds
              },
              timingReferenceItem: 'patient.name',
            },
          ],
        },
      ];

      const scenario = createMockScenario({ sequenceGroups });
      const actionsTimeline = [
        createMockActionTimelineEntry('patient.name', 'Patient Name', 10),
        createMockActionTimelineEntry('patient.age', 'Age', 50), // 40 seconds later - within window
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      expect(result.score).toBe(100);
      const timingResult = result.groupResults?.find(
        (g) => g.type === 'timing' && g.id.includes('patient.age'),
      );
      expect(timingResult?.passed).toBe(true);
    });

    it('should fail when item is outside timing window of reference item', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'Assessment',
          mode: 'flexible',
          items: [
            'patient.name',
            {
              id: 'patient.age',
              timing: {
                mode: 'withinMinutes',
                withinMinutesFromStart: 1, // 60 seconds
              },
              timingReferenceItem: 'patient.name',
            },
          ],
        },
      ];

      const scenario = createMockScenario({ sequenceGroups });
      const actionsTimeline = [
        createMockActionTimelineEntry('patient.name', 'Patient Name', 10),
        createMockActionTimelineEntry('patient.age', 'Age', 100), // 90 seconds later - outside window
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      expect(result.score).toBeLessThan(100);
      const timingResult = result.groupResults?.find(
        (g) => g.type === 'timing' && g.id.includes('patient.age'),
      );
      expect(timingResult?.passed).toBe(false);
      expect(timingResult?.failedReasons).toEqual(
        expect.arrayContaining([expect.stringContaining('after')]),
      );
    });

    it('should fail timing check when reference item is not completed', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'Assessment',
          mode: 'flexible',
          items: [
            'patient.name',
            {
              id: 'patient.age',
              timing: {
                mode: 'withinMinutes',
                withinMinutesFromStart: 1,
              },
              timingReferenceItem: 'patient.name',
            },
          ],
        },
      ];

      const scenario = createMockScenario({ sequenceGroups });
      const actionsTimeline = [
        createMockActionTimelineEntry('patient.age', 'Age', 10),
        // patient.name is missing
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      expect(result.score).toBeLessThan(100);
      const timingResult = result.groupResults?.find(
        (g) => g.type === 'timing' && g.id.includes('patient.age'),
      );
      expect(timingResult?.passed).toBe(false);
      expect(timingResult?.failedReasons).toEqual(
        expect.arrayContaining([expect.stringContaining('not completed')]),
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // QUESTION ASKED ASSESSMENT METHOD
  // ══════════════════════════════════════════════════════════════════════════

  describe('QuestionAsked Assessment Method', () => {
    it('should use AI to detect when a question was asked', async () => {
      const aiResponse = {
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  evaluations: {
                    'patient.name': {
                      occurrences: [
                        {
                          evidence: "What's your name?",
                          messageIndex: 0,
                        },
                      ],
                    },
                  },
                }),
              },
            },
          ],
        },
      };

      jest
        .spyOn(httpService, 'post')
        .mockReturnValue(of(aiResponse) as ReturnType<typeof httpService.post>);

      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'Patient Information',
          mode: 'flexible',
          items: [
            {
              id: 'patient.name',
              assessmentMethod: 'questionAsked',
            },
          ],
        },
      ];

      const scenario = createMockScenario({ sequenceGroups });
      const transcriptMessages = [createMockTranscriptMessage('Student', "What's your name?", 10)];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        transcriptMessages,
        undefined,
        [],
        [],
        '2024-01-01T00:00:00.000Z',
      );

      expect(result.score).toBe(100);
      expect(httpService.post).toHaveBeenCalled();
    });

    it('should fallback to deterministic matching when AI fails', async () => {
      jest.spyOn(httpService, 'post').mockReturnValue(throwError(() => new Error('API Error')));

      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'Patient Information',
          mode: 'flexible',
          items: [
            {
              id: 'patient.allergies',
              assessmentMethod: 'questionAsked',
            },
          ],
        },
      ];

      const scenario = createMockScenario({ sequenceGroups });
      const transcriptMessages = [
        createMockTranscriptMessage('Student', 'Do you have any allergies?', 10),
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        transcriptMessages,
        undefined,
        [],
        [],
        '2024-01-01T00:00:00.000Z',
      );

      expect(result.score).toBe(100);
    });

    it('should use deterministic matching when no API key configured', async () => {
      jest.spyOn(configService, 'get').mockReturnValue(undefined);

      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'Patient Information',
          mode: 'flexible',
          items: [
            {
              id: 'patient.medicalHistory',
              assessmentMethod: 'questionAsked',
            },
          ],
        },
      ];

      const scenario = createMockScenario({ sequenceGroups });
      const transcriptMessages = [
        createMockTranscriptMessage('Student', 'What is your medical history?', 10),
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        transcriptMessages,
        undefined,
        [],
        [],
        '2024-01-01T00:00:00.000Z',
      );

      expect(result.score).toBe(100);
      expect(httpService.post).not.toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // COMPLEX INTEGRATION TESTS
  // ══════════════════════════════════════════════════════════════════════════

  describe('Complex Integration Scenarios', () => {
    it('should evaluate complex multi-group scenario with subgroups and timing', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'PPE',
          mode: 'strict',
          items: ['ppe.handHygiene'],
        },
        {
          id: 'group2',
          label: 'Patient Assessment',
          mode: 'flexible',
          items: ['patient.chiefComplaint'],
          subgroups: [
            {
              id: 'demographics',
              label: 'Demographics',
              mode: 'strict',
              items: ['patient.name', 'patient.age'],
            },
            {
              id: 'history',
              label: 'Medical History',
              mode: 'flexible',
              items: ['patient.medicalHistory', 'patient.allergies'],
            },
          ],
        },
      ];

      const scenario = createMockScenario({
        sequenceGroups,
        sequenceGroupsOrderMode: 'strict' as const,
      });

      const actionsTimeline = [
        createMockActionTimelineEntry('ppe.handHygiene', 'Hand Hygiene', 5),
        createMockActionTimelineEntry('patient.chiefComplaint', 'Chief Complaint', 10),
        createMockActionTimelineEntry('patient.name', 'Patient Name', 15),
        createMockActionTimelineEntry('patient.age', 'Age', 20),
        createMockActionTimelineEntry('patient.allergies', 'Allergies', 25),
        createMockActionTimelineEntry('patient.medicalHistory', 'Medical History', 30),
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      expect(result.score).toBe(100);
      expect(result.groupResults?.filter((g) => g.passed)).toHaveLength(
        result.groupResults?.length ?? 0,
      );
    });

    it('should handle shared items across multiple groups', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'Initial Assessment',
          mode: 'flexible',
          items: ['patient.name', 'patient.chiefComplaint'],
        },
        {
          id: 'group2',
          label: 'Detailed Assessment',
          mode: 'flexible',
          items: ['patient.chiefComplaint', 'patient.medicalHistory'], // chiefComplaint is shared
        },
      ];

      const scenario = createMockScenario({
        sequenceGroups,
        sequenceGroupsOrderMode: 'flexible' as const,
      });

      const actionsTimeline = [
        createMockActionTimelineEntry('patient.name', 'Patient Name', 5),
        createMockActionTimelineEntry('patient.chiefComplaint', 'Chief Complaint', 10),
        createMockActionTimelineEntry('patient.medicalHistory', 'Medical History', 15),
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      // With shared items, the service consumes the first occurrence for each group
      // Score should be less than 100 if groups have issues, or 100 if all pass
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.groupResults).toBeDefined();
    });

    it('should provide detailed user-friendly feedback in weaknesses', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'PPE',
          mode: 'flexible',
          items: ['ppe.handHygiene'],
        },
        {
          id: 'group2',
          label: 'Demographics',
          mode: 'strict',
          items: ['patient.name', 'patient.age'],
        },
      ];

      const scenario = createMockScenario({
        sequenceGroups,
        sequenceGroupsOrderMode: 'strict' as const,
      });

      // Group 2 starts before Group 1 finishes AND items in wrong order
      const actionsTimeline = [
        createMockActionTimelineEntry('patient.age', 'Age', 5), // Wrong order + premature start
        createMockActionTimelineEntry('ppe.handHygiene', 'Hand Hygiene', 10),
        createMockActionTimelineEntry('patient.name', 'Patient Name', 15),
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      expect(result.score).toBeLessThan(100);
      expect(result.weaknesses.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeGreaterThan(0);

      // Check that weaknesses contain actionable information
      const weaknessText = result.weaknesses.map((w) => w.point + ' ' + w.example).join(' ');
      expect(weaknessText).toContain('Demographics');
    });

    it('should handle vital sign references correctly', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'Vital Signs',
          mode: 'flexible',
          items: ['vital.action_vitals_1.heartRate', 'vital.action_vitals_1.bloodPressure'],
        },
      ];

      const scenario = createMockScenario({
        sequenceGroups,
        actions: [
          { id: 'action_vitals_1', title: 'Check Vitals', order: 0, items: [], correct: '' },
        ],
      });

      const actionsTimeline = [
        {
          id: 'action_vitals_1',
          title: 'Check Vitals',
          elapsedSeconds: 10,
          elapsedTimeFormatted: '0:10',
          orderValue: 1000010000,
          vitals: {
            heartRate: [
              {
                id: 'hr1',
                value: 72,
                timestamp: '2024-01-01T00:00:10.000Z',
                timestampValue: 1000010000,
                elapsedSeconds: 10,
              },
            ],
            bloodPressure: [
              {
                id: 'bp1',
                value: '120/80',
                timestamp: '2024-01-01T00:00:15.000Z',
                timestampValue: 1000015000,
                elapsedSeconds: 15,
              },
            ],
          },
        },
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      expect(result.score).toBe(100);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // EDGE CASES
  // ══════════════════════════════════════════════════════════════════════════

  describe('Edge Cases', () => {
    it('should handle empty groups gracefully', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'Empty Group',
          mode: 'flexible',
          items: [],
        },
      ];

      const scenario = createMockScenario({ sequenceGroups });

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        [],
        '2024-01-01T00:00:00.000Z',
      );

      // Empty groups are valid but may have a lower score
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.groupResults).toBeDefined();
    });

    it('should handle scenario without sequenceGroupsOrderMode (default to strict)', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'Group 1',
          mode: 'flexible',
          items: ['patient.name'],
        },
        {
          id: 'group2',
          label: 'Group 2',
          mode: 'flexible',
          items: ['patient.age'],
        },
      ];

      const scenario = createMockScenario({
        sequenceGroups,
        // sequenceGroupsOrderMode is undefined - should default to strict
      });

      const actionsTimeline = [
        createMockActionTimelineEntry('patient.age', 'Age', 5),
        createMockActionTimelineEntry('patient.name', 'Patient Name', 10),
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      // Should fail because groups are in wrong order (defaults to strict)
      expect(result.score).toBeLessThan(100);
    });

    it('should handle items with no timestamps', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'Group',
          mode: 'flexible',
          items: ['patient.name', 'patient.age'],
        },
      ];

      const scenario = createMockScenario({ sequenceGroups });
      const actionsTimeline = [
        createMockActionTimelineEntry('patient.name', 'Patient Name', undefined),
        createMockActionTimelineEntry('patient.age', 'Age', 10),
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      // Should handle gracefully
      expect(result).toBeDefined();
      expect(result.score).toBeDefined();
    });

    it('should handle duplicate action occurrences correctly', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'Group',
          mode: 'flexible',
          items: ['patient.name'],
        },
      ];

      const scenario = createMockScenario({ sequenceGroups });
      const actionsTimeline = [
        createMockActionTimelineEntry('patient.name', 'Patient Name', 5),
        createMockActionTimelineEntry('patient.name', 'Patient Name', 10), // Duplicate
        createMockActionTimelineEntry('patient.name', 'Patient Name', 15), // Duplicate
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      // Should use earliest occurrence
      expect(result.score).toBe(100);
    });

    it('should calculate correct score percentage', async () => {
      const sequenceGroups: SequenceGroupDefinition[] = [
        {
          id: 'group1',
          label: 'Group 1',
          mode: 'flexible',
          items: ['patient.name', 'patient.age'],
        },
        {
          id: 'group2',
          label: 'Group 2',
          mode: 'flexible',
          items: ['patient.chiefComplaint'],
        },
      ];

      const scenario = createMockScenario({ sequenceGroups });
      const actionsTimeline = [
        createMockActionTimelineEntry('patient.name', 'Patient Name', 5),
        createMockActionTimelineEntry('patient.age', 'Age', 10),
        // patient.chiefComplaint is missing
      ];

      const result = await service.evaluateSequencingPrioritization(
        scenario,
        [],
        undefined,
        [],
        actionsTimeline,
        '2024-01-01T00:00:00.000Z',
      );

      // Score should be based on passed/total group results
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(100);
      expect(result.groupResults).toBeDefined();
      const passedCount = result.groupResults?.filter((g) => g.passed).length ?? 0;
      const totalCount = result.groupResults?.length ?? 1;
      const expectedScore = Number(((passedCount / totalCount) * 100).toFixed(2));
      expect(result.score).toBe(expectedScore);
      expect(result.groupResults!.length).toBeGreaterThan(0);
    });
  });
});
