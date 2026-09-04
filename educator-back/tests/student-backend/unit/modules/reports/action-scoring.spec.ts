import { Test } from '@nestjs/testing';
import { ReportsService } from '@/modules/reports/reports.service';
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

describe('ReportsService - Action Scoring', () => {
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
        { provide: JsonDataService, useValue: { getUnitById: () => null } },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'OPENAI_API_KEY' ? 'test-key' : null),
          },
        },
        { provide: HttpService, useValue: {} },
        { provide: LifecycleTelemetryService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ReportsService);
  });

  describe('computeDeterministicActionMarks', () => {
    const scenarioActions = [
      {
        id: '1',
        title: 'Mandatory 1',
        correct: 'A',
        type: 'single',
        typeRequirement: 'Mandatory',
      },
      {
        id: '2',
        title: 'Mandatory 2',
        correct: 'B',
        type: 'single',
        typeRequirement: 'Mandatory',
      },
      {
        id: '3',
        title: 'Optional 1',
        correct: 'C',
        type: 'single',
        typeRequirement: 'Optional',
      },
      {
        id: '4',
        title: 'Optional 2',
        correct: 'D',
        type: 'single',
        typeRequirement: 'Optional',
      },
    ];

    it('should return 50% (1/2) if 1 mandatory and 1 optional are correct', async () => {
      const timeline = [
        { title: 'Mandatory 1', selectedItem: 'A' }, // Correct Mandatory (+1)
        { title: 'Optional 1', selectedItem: 'C' }, // Correct Optional (0 points, excluded from denominator)
      ];
      const result = (await (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).computeDeterministicActionMarks(timeline, scenarioActions)) as Record<string, number>;

      // X = 1 (Mandatory 1)
      // Y = 2 (Mandatory 1, Mandatory 2)
      expect(result.positiveActions).toBe(1);
      expect(result.totalRequiredActions).toBe(2);
      expect(result.totalPoints).toBe(1);

      // Percentage (calculated in analyzeWithOpenAI) would be 1/2 = 50%
    });

    it('should return 100% (2/2) if both mandatory are correct, regardless of optional', async () => {
      const timeline = [
        { title: 'Mandatory 1', selectedItem: 'A' },
        { title: 'Mandatory 2', selectedItem: 'B' },
        { title: 'Optional 1', selectedItem: 'C' },
      ];
      const result = (await (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).computeDeterministicActionMarks(timeline, scenarioActions)) as Record<string, number>;
      expect(result.positiveActions).toBe(2);
      expect(result.totalRequiredActions).toBe(2);
    });

    it('should handle traditional isOptional flag as well', async () => {
      const actions = [
        { id: '1', title: 'M', correct: 'A', type: 'single' },
        { id: '2', title: 'O', correct: 'B', type: 'single', isOptional: true },
      ];
      const timeline = [
        { title: 'M', selectedItem: 'A' },
        { title: 'O', selectedItem: 'B' },
      ];
      const result = (await (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).computeDeterministicActionMarks(timeline, actions)) as Record<string, number>;
      expect(result.positiveActions).toBe(1);
      expect(result.totalRequiredActions).toBe(1);
    });

    it('should handle Distractor via typeRequirement', async () => {
      const actions = [
        { id: '1', title: 'M', correct: 'A', type: 'single' },
        { id: '2', title: 'D', type: 'single', typeRequirement: 'Distractor' },
      ];
      const timeline = [
        { title: 'M', selectedItem: 'A' },
        { title: 'D', selectedItem: 'X' },
      ];
      const result = (await (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).computeDeterministicActionMarks(timeline, actions)) as Record<string, number>;
      expect(result.positiveActions).toBe(1);
      expect(result.totalRequiredActions).toBe(1);
      expect(result.negativeActions).toBe(1);
      expect(result.totalPoints).toBe(1); // No deduction
    });
  });
});
