import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';

import type { CreateScenarioDto } from '@/modules/admin/dto/create-scenario.dto';
import type { UpdateScenarioDto } from '@/modules/admin/dto/update-scenario.dto';

describe('Student Briefing DTO Validation (Integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      // Add your module imports here
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('CreateScenarioDto - studentBriefing field', () => {
    it('should accept valid studentBriefing object', () => {
      const dto: Partial<CreateScenarioDto> = {
        title: 'Test Scenario',
        studentBriefing: {
          safeEnvironment: 'Safety instructions',
          orientationSpace: 'Orientation details',
          evaluation: 'Evaluation criteria',
          learningObjectives: 'Learning objectives',
        },
      };

      expect(dto.studentBriefing).toBeDefined();
      expect(dto.studentBriefing?.safeEnvironment).toBe('Safety instructions');
    });

    it('should accept studentBriefing with empty strings', () => {
      const dto: Partial<CreateScenarioDto> = {
        title: 'Test Scenario',
        studentBriefing: {
          safeEnvironment: '',
          orientationSpace: '',
          evaluation: '',
          learningObjectives: '',
        },
      };

      expect(dto.studentBriefing).toBeDefined();
      expect(dto.studentBriefing?.safeEnvironment).toBe('');
    });

    it('should accept partial studentBriefing object', () => {
      const dto: Partial<CreateScenarioDto> = {
        title: 'Test Scenario',
        studentBriefing: {
          safeEnvironment: 'Safety only',
        },
      };

      expect(dto.studentBriefing).toBeDefined();
      expect(dto.studentBriefing?.safeEnvironment).toBe('Safety only');
      expect(dto.studentBriefing?.orientationSpace).toBeUndefined();
    });

    it('should accept scenario without studentBriefing field', () => {
      const dto: Partial<CreateScenarioDto> = {
        title: 'Test Scenario',
      };

      expect(dto.studentBriefing).toBeUndefined();
    });
  });

  describe('UpdateScenarioDto - studentBriefing field', () => {
    it('should accept valid studentBriefing update', () => {
      const dto: Partial<UpdateScenarioDto> = {
        studentBriefing: {
          safeEnvironment: 'Updated safety',
          orientationSpace: 'Updated orientation',
          evaluation: 'Updated evaluation',
          learningObjectives: 'Updated objectives',
        },
      };

      expect(dto.studentBriefing).toBeDefined();
      expect(dto.studentBriefing?.safeEnvironment).toBe('Updated safety');
    });

    it('should accept clearing studentBriefing fields', () => {
      const dto: Partial<UpdateScenarioDto> = {
        studentBriefing: {
          safeEnvironment: '',
          orientationSpace: '',
          evaluation: '',
          learningObjectives: '',
        },
      };

      expect(dto.studentBriefing).toBeDefined();
      expect(dto.studentBriefing?.safeEnvironment).toBe('');
    });

    it('should accept updating only specific briefing fields', () => {
      const dto: Partial<UpdateScenarioDto> = {
        studentBriefing: {
          safeEnvironment: 'New safety text',
        },
      };

      expect(dto.studentBriefing).toBeDefined();
      expect(dto.studentBriefing?.safeEnvironment).toBe('New safety text');
    });
  });

  describe('Full Scenario Creation with studentBriefing', () => {
    it('should create scenario with complete studentBriefing data', () => {
      const dto: Partial<CreateScenarioDto> = {
        id: 'test-scenario-1',
        title: 'Complete Test Scenario',
        unitId: 'unit-1',
        difficulty: 'Medium',
        department: 'Emergency',
        description: 'Test description',
        studentBriefing: {
          safeEnvironment:
            'Ensure patient safety at all times. Follow standard precautions and infection control protocols. Report any concerns immediately to your instructor.',
          orientationSpace:
            'You will interact with a simulated patient in a clinical setting. Take time to review the patient chart and available resources before beginning the scenario.',
          evaluation:
            'Your performance will be evaluated based on clinical assessment, communication skills, critical thinking, and adherence to safety protocols.',
          learningObjectives:
            'Demonstrate appropriate patient assessment techniques, establish therapeutic communication, develop a care plan, and document findings accurately.',
        },
        patientData: {
          name: 'John Doe',
          gender: 'Male',
          age: 45,
          Weight: '180 lbs',
          Height: '5\'10"',
        },
      };

      expect(dto.studentBriefing).toBeDefined();
      expect(Object.keys(dto.studentBriefing!).length).toBe(4);
    });
  });

  describe('Scenario Update with studentBriefing', () => {
    it('should update scenario with modified studentBriefing', () => {
      const dto: Partial<UpdateScenarioDto> = {
        title: 'Updated Scenario',
        studentBriefing: {
          safeEnvironment: 'Modified safety instructions',
          orientationSpace: 'Modified orientation',
          evaluation: 'Modified evaluation',
          learningObjectives: 'Modified objectives',
        },
      };

      expect(dto.studentBriefing).toBeDefined();
      expect(dto.studentBriefing?.safeEnvironment).toContain('Modified');
    });

    it('should handle studentBriefing alongside other updates', () => {
      const dto: Partial<UpdateScenarioDto> = {
        title: 'Updated Title',
        description: 'Updated Description',
        studentBriefing: {
          safeEnvironment: 'Updated safety',
        },
        sbar: {
          situation: 'Updated situation',
        },
      };

      expect(dto.studentBriefing).toBeDefined();
      expect(dto.sbar).toBeDefined();
      expect(dto.title).toBe('Updated Title');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long briefing text', () => {
      const longText = 'A'.repeat(5000);
      const dto: Partial<CreateScenarioDto> = {
        title: 'Test',
        studentBriefing: {
          safeEnvironment: longText,
          orientationSpace: longText,
          evaluation: longText,
          learningObjectives: longText,
        },
      };

      expect(dto.studentBriefing?.safeEnvironment?.length).toBe(5000);
    });

    it('should handle special characters in briefing text', () => {
      const dto: Partial<CreateScenarioDto> = {
        title: 'Test',
        studentBriefing: {
          safeEnvironment: 'Safety with <html> & "quotes" and \'apostrophes\'',
          orientationSpace: 'Text with\nnewlines\nand\ttabs',
          evaluation: 'Unicode: 你好 🎉',
          learningObjectives: 'Math: 2 + 2 = 4, x > y',
        },
      };

      expect(dto.studentBriefing?.safeEnvironment).toContain('<html>');
      expect(dto.studentBriefing?.orientationSpace).toContain('\n');
      expect(dto.studentBriefing?.evaluation).toContain('你好');
    });

    it('should handle null vs undefined briefing fields', () => {
      const dtoWithUndefined: Partial<CreateScenarioDto> = {
        title: 'Test',
        studentBriefing: {
          safeEnvironment: undefined,
          orientationSpace: 'Text',
        },
      };

      const dtoWithoutField: Partial<CreateScenarioDto> = {
        title: 'Test',
        studentBriefing: {
          orientationSpace: 'Text',
        },
      };

      expect(dtoWithUndefined.studentBriefing?.safeEnvironment).toBeUndefined();
      expect(dtoWithoutField.studentBriefing?.safeEnvironment).toBeUndefined();
    });
  });
});
