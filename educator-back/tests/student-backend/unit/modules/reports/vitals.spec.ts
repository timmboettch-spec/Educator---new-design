import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
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
import type { CreateReportDto } from '@/modules/reports/dto/create-report.dto';

import { of } from 'rxjs';
import * as os from 'os';

jest.mock('os', () => ({
  ...jest.requireActual('os'),
  userInfo: jest.fn(() => ({ username: 'tester' })),
}));

describe('ReportsService - Vitals Multi-Reading Feature (Full Suite)', () => {
  let service: ReportsService;

  beforeEach(async () => {
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
        {
          provide: HttpService,
          useValue: { post: jest.fn().mockReturnValue(of({ data: {} })) },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('mock-api-key') },
        },
        {
          provide: JsonDataService,
          useValue: {
            getTranscriptById: jest.fn().mockReturnValue({ messages: [] }),
            getTranscriptByIdFresh: jest.fn().mockResolvedValue({ messages: [] }),
            getScenarioById: jest.fn().mockReturnValue({
              title: 'Acute Coronary Syndrome',
              grading: { maxScore: 100 },
            }),
            getScenarioByIdFresh: jest.fn().mockResolvedValue({
              title: 'Acute Coronary Syndrome',
              grading: { maxScore: 100 },
            }),
            getScenarioByIdLocalized: jest.fn().mockResolvedValue({
              title: 'Acute Coronary Syndrome',
              grading: { maxScore: 100 },
            }),
            getReportByTranscriptId: jest.fn(),
            getReportByTranscriptIdFresh: jest.fn(),
            getReports: jest.fn().mockReturnValue([]),
            getReportsFresh: jest.fn().mockResolvedValue([]),
            addReport: jest.fn(),
            addReportFresh: jest.fn(),
            generateId: jest.fn().mockReturnValue('r1'),
          },
        },
        { provide: LifecycleTelemetryService, useValue: {} },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);

    // Mock internal persistence and AI logic to isolate unit tests
    jest
      .spyOn(service as unknown as Record<string, (...args: unknown[]) => unknown>, 'readReports')
      .mockReturnValue([]);
    jest
      .spyOn(service as unknown as Record<string, (...args: unknown[]) => unknown>, 'writeReports')
      .mockImplementation(() => {});
    (
      jest.spyOn(
        service as unknown as Record<string, (...args: unknown[]) => unknown>,
        'analyzeWithOpenAI',
      ) as jest.Mock
    ).mockResolvedValue({
      softSkills: { totalScore: 15, totalWeight: 20 },
      technicalSkills: { totalScore: 70, totalWeight: 80 },
      overall: { summary: 'Analysis complete', feedback: 'Good work' },
    });
    (os.userInfo as jest.Mock).mockReturnValue({ username: 'tester' } as unknown as ReturnType<
      typeof os.userInfo
    >);
  });

  // --- TICKET 1: MULTIPLE READINGS PER VITAL ---
  describe('Multiple Vitals Support', () => {
    it('should allow and persist multiple readings for the same vital type', async () => {
      const dto = createMockDto({
        'Heart Rate': [
          { id: 'h1', details: 'Value: 52 bpm', timestamp: '11:58 AM' },
          { id: 'h2', details: 'Value: 60 bpm', timestamp: '11:59 AM' },
        ],
      });

      const result = await service.createReportWithAI(dto);

      expect(
        (
          result.summaryByCategory as unknown as Record<
            string,
            Record<string, Array<Record<string, unknown>>>
          >
        ).vitals['Heart Rate'],
      ).toHaveLength(2);
      expect(
        (
          result.summaryByCategory as unknown as Record<
            string,
            Record<string, Array<Record<string, unknown>>>
          >
        ).vitals['Heart Rate'][1].details,
      ).toBe('Value: 60 bpm');
    });
  });

  // --- TICKET 2: DATA MODEL & SCHEMA ---
  describe('Data Model Update', () => {
    it('should store vitals as a list with timestamped objects', async () => {
      const dto = createMockDto({
        'Blood Pressure': [{ id: 'bp1', details: '120/80', timestamp: '2026-01-20T10:00:00Z' }],
      });

      const result = await service.createReportWithAI(dto);
      const reading = (
        result.summaryByCategory as unknown as Record<
          string,
          Record<string, Array<Record<string, unknown>>>
        >
      ).vitals['Blood Pressure'][0];

      expect(
        Array.isArray(
          (
            result.summaryByCategory as unknown as Record<
              string,
              Record<string, Array<Record<string, unknown>>>
            >
          ).vitals['Blood Pressure'],
        ),
      ).toBe(true);
      expect(reading).toHaveProperty('timestamp');
      expect(reading).toHaveProperty('details');
    });
  });

  // --- TICKET 3: BACKWARD COMPATIBILITY ---
  describe('Backward Compatibility', () => {
    it('should preserve legacy behavior by not crashing when vitals is a single object', async () => {
      const legacyDto = createMockDto({
        'Heart Rate': {
          id: 'old-1',
          details: 'Value: 72 bpm',
          timestamp: '11:58 AM',
        },
      });

      // Verify the service handles the object without throwing a 500 error
      const result = await service.createReportWithAI(legacyDto);
      expect(result).toBeDefined();
      expect(
        (
          result.summaryByCategory as unknown as Record<
            string,
            Record<string, Array<Record<string, unknown>>>
          >
        ).vitals['Heart Rate'],
      ).toBeDefined();
    });
  });

  // --- TICKET 4: REGRESSION VALIDATION ---
  //     describe('Regression Validation', () => {
  //         it('should verify multiple readings do not interfere with overall scoring', async () => {
  //             const dto = createMockDto({
  //                 "Heart Rate": [
  //                     { value: 60, timestamp: "10:00 AM" },
  //                     { value: 120, timestamp: "10:10 AM" }
  //                 ]
  //             });

  //             const result = await service.createReportWithAI(dto);

  //             // Verify scoring logic is still functional (not NaN or undefined)
  //             expect(result.score).toBeGreaterThan(0);
  //             expect(result.scoreJson.clinicalJudgment).toBeDefined();
  //             // Verify no UI/UX regression in other categories
  //             expect((result.summaryByCategory as unknown as Record<string, Array<Record<string, Record<string, Array<Record<string, unknown>>>>>>).actions).toEqual([]);
  //         });

  //         it('should verify report persistence is called with full vital history', async () => {
  //             const dto = createMockDto({ "SpO2": [{ value: 98, timestamp: "12:00 PM" }] });
  //             await service.createReportWithAI(dto);
  //             expect(service['writeReports']).toHaveBeenCalled();
  //         });
  //     });
});

/**
 * Helper to generate valid DTO based on the user's submit payload
 */
function createMockDto(vitals: Record<string, unknown>): CreateReportDto {
  return {
    userId: 'user-001',
    studentName: 'kiruthika',
    studentClass: 'MBBS 2nd Year',
    scenarioId: 'scenario-u2-002',
    scenarioTitle: 'Acute Coronary Syndrome',
    transcriptId: '1768890464832-zu2jpayp6',
    summaryByCategory: {
      vitals: vitals,
      history: [],
      actions: [],
      medications: [],
      assessment: [],
      followup: [],
    },
  };
}
