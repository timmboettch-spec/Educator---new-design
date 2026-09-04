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

describe('ReportsService - Documentation Rubric', () => {
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

  describe('buildDocumentationInstructions', () => {
    const technicalSkillItems = [{ subCategory: 'Documentation' }];
    const scenario = {
      title: 'Hypertension Simulation',
      description: 'Patient has high blood pressure.',
      patientData: { name: 'John Doe', age: 45 },
    };

    it('should correctly include and format History Tab notes', () => {
      const studentSummary = {
        historyNotes: 'Patient reports family history of stroke.',
      };

      const instructions = (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).buildDocumentationInstructions(studentSummary, technicalSkillItems, scenario);

      expect(instructions).toContain(
        'History Tab Additional Notes: "Patient reports family history of stroke."',
      );
    });

    it('should correctly include and format Action Tab global notes', () => {
      const studentSummary = {
        actionNotes: 'Advised patient on lifestyle changes.',
      };

      const instructions = (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).buildDocumentationInstructions(studentSummary, technicalSkillItems, scenario);

      expect(instructions).toContain(
        'Actions Tab Global Notes: "Advised patient on lifestyle changes."',
      );
    });

    it('should correctly extract and format Action Observations', () => {
      const studentSummary = {
        actions: [
          { title: 'Check BP', details: 'Observation: 150/95 | Result: High' },
          {
            title: 'Wash Hands',
            details: 'Observation: Student followed hygiene protocol',
          },
        ],
      };

      const instructions = (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).buildDocumentationInstructions(studentSummary, technicalSkillItems, scenario);

      expect(instructions).toContain('"title": "Check BP"');
      expect(instructions).toContain('"observation": "150/95"');
      expect(instructions).toContain('"title": "Wash Hands"');
      expect(instructions).toContain('"observation": "Student followed hygiene protocol"');
    });

    it('should include the critical rule to include Chief Complaint', () => {
      const instructions = (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).buildDocumentationInstructions({}, technicalSkillItems, scenario);

      expect(instructions).toContain(
        'INCLUDE CHIEF COMPLAINT: Chief Complaint field is now part of Medical History evaluation (doc-2).',
      );
    });

    it('should return empty string if Documentation rubric is not configured', () => {
      const instructions = (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).buildDocumentationInstructions({}, [], scenario);

      expect(instructions).toBe('');
    });

    it('should handle missing data gracefully by providing empty strings', () => {
      const instructions = (
        service as unknown as Record<string, (...args: unknown[]) => unknown>
      ).buildDocumentationInstructions({}, technicalSkillItems, {});

      expect(instructions).toContain('History Tab Additional Notes: ""');
      expect(instructions).toContain('Actions Tab Global Notes: ""');
    });
  });
});
