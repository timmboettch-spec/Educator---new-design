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
import { of } from 'rxjs';
import type { CreateReportDto } from '@/modules/reports/dto/create-report.dto';

describe('ReportsService: Backward Compatibility', () => {
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
          useValue: { get: jest.fn().mockReturnValue('key') },
        },
        {
          provide: JsonDataService,
          useValue: {
            getTranscriptById: jest.fn().mockReturnValue({ messages: [] }),
            getTranscriptByIdFresh: jest.fn().mockResolvedValue({ messages: [] }),
            getScenarioById: jest.fn().mockReturnValue({ title: 'Test', grading: {} }),
            getScenarioByIdFresh: jest.fn().mockResolvedValue({ title: 'Test', grading: {} }),
            getScenarioByIdLocalized: jest.fn().mockResolvedValue({ title: 'Test', grading: {} }),
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
    ).mockResolvedValue({ overall: {} });
  });

  it('should handle legacy behavior by not crashing when vitals is a single object', async () => {
    // Simulating the OLD data format (Object instead of Array)
    const legacyDto = {
      transcriptId: '123',
      summaryByCategory: {
        vitals: {
          'Heart Rate': {
            id: 'old-1',
            details: '72 bpm',
            timestamp: '11:58 AM',
          },
        },
      },
    };

    const result = await service.createReportWithAI(legacyDto as unknown as CreateReportDto);

    // Ensure the system didn't throw an error and processed the object
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
