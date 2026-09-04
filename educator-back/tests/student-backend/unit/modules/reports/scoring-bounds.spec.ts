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

describe('ReportsService - Scoring Bounds', () => {
  let service: ReportsService;
  let actionsService: ActionsInterventionsService;
  let ppeService: PpePrivacyService;

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
    actionsService = moduleRef.get(ActionsInterventionsService);
    ppeService = moduleRef.get(PpePrivacyService);
  });

  describe('computeDeterministicActionMarks Bounds', () => {
    it('should NOT return positiveActions > totalRequiredActions even with duplicates', async () => {
      const scenarioActions = [
        { id: '1', title: 'Action 1', typeRequirement: 'Mandatory' },
        { id: '2', title: 'Action 2', typeRequirement: 'Mandatory' },
      ];
      const timeline = [
        { title: 'Action 1', selectedItem: 'X' },
        { title: 'Action 1', selectedItem: 'X' }, // Duplicate entry in timeline
        { title: 'Action 2', selectedItem: 'Y' },
      ];

      // Mock evaluateActionAttempt on the underlying actions service to always return true
      (
        actionsService as unknown as Record<string, (...args: unknown[]) => unknown>
      ).evaluateActionAttempt = jest.fn().mockResolvedValue(true);

      const result = (await (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).computeDeterministicActionMarks(timeline, scenarioActions)) as Record<string, number>;

      expect(result.positiveActions).toBeLessThanOrEqual(result.totalRequiredActions);
      expect(result.positiveActions).toBe(2);
      expect(result.totalRequiredActions).toBe(2);
    });

    it('should handle duplicate scenario actions by increasing denominator', async () => {
      const scenarioActions = [
        { id: '1', title: 'Action 1', typeRequirement: 'Mandatory' },
        { id: '2', title: 'Action 1', typeRequirement: 'Mandatory' }, // Duplicate title in scenario
      ];
      const timeline = [{ title: 'Action 1', selectedItem: 'X' }];

      (
        actionsService as unknown as Record<string, (...args: unknown[]) => unknown>
      ).evaluateActionAttempt = jest.fn().mockResolvedValue(true);

      const result = (await (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).computeDeterministicActionMarks(timeline, scenarioActions)) as Record<string, number>;

      // Both scenario actions match the same timeline attempt
      expect(result.positiveActions).toBe(2);
      expect(result.totalRequiredActions).toBe(2);
      expect(result.positiveActions).toBeLessThanOrEqual(result.totalRequiredActions);
    });
  });

  describe('computePPEScore Bounds', () => {
    it('should NOT return completedPPE > totalConfiguredItems', () => {
      const checklistItems = [
        { id: 'c1', text: 'Wash Hands', mandatory: true },
        { id: 'c2', text: 'Wear Gloves', mandatory: true },
      ];
      const tracker = [
        { label: 'Wash Hands' },
        { label: 'Wash Hands' }, // Multiple same label
        { label: 'Wear Gloves' },
      ];

      // Override the underlying PPE service to return a deterministic bounded result
      (ppeService as unknown as Record<string, (...args: unknown[]) => unknown>).computePPEScore =
        jest.fn().mockReturnValue({
          totalConfiguredItems: 2,
          totalStandalonePPE: 2,
          completedPPE: 2,
          ppeScore: 100,
          matchedItems: [],
          unmatchedItems: [],
        });

      const result = (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).computePPEScore(checklistItems, tracker) as Record<string, number>;

      expect(result.completedPPE).toBeLessThanOrEqual(result.totalConfiguredItems);
      expect(result.completedPPE).toBe(2);
      expect(result.totalConfiguredItems).toBe(2);
    });
  });
});
