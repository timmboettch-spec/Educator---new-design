import 'reflect-metadata';
import { validate } from 'class-validator';
import { ValidationPipe } from '@nestjs/common';
import { CreateScenarioDto } from '@/modules/admin/dto/create-scenario.dto';
import { UpdateScenarioDto } from '@/modules/admin/dto/update-scenario.dto';

describe('RealClinical Experience Configuration - Backend DTO Tests', () => {
  describe('CreateScenarioDto - realClinical validation', () => {
    it('should validate valid realClinical object in CreateScenarioDto', async () => {
      const dto = new CreateScenarioDto();
      dto.id = 'SCN-RC-001';
      dto.title = 'RealClinical Test Scenario';
      dto.realClinical = {
        enabled: true,
        steps: [
          {
            id: 'step-1',
            actionId: 'action_123',
            label: 'Adjust Bed to Working Height',
            activityType: 'action',
            order: 1,
          },
          {
            id: 'step-2',
            actionId: 'action_456',
            label: 'Obtain Vital Signs',
            activityType: 'action',
            order: 2,
          },
        ],
      };

      const errors = await validate(dto);
      const rcErrors = errors.filter((e) => e.property === 'realClinical');
      expect(rcErrors.length).toBe(0);
    });

    it('should allow disabled realClinical configuration with empty steps', async () => {
      const dto = new CreateScenarioDto();
      dto.id = 'SCN-RC-002';
      dto.title = 'RealClinical Disabled Scenario';
      dto.realClinical = {
        enabled: false,
        steps: [],
      };

      const errors = await validate(dto);
      const rcErrors = errors.filter((e) => e.property === 'realClinical');
      expect(rcErrors.length).toBe(0);
    });

    it('should allow hsRealClinical and psRealClinical properties', async () => {
      const dto = new CreateScenarioDto();
      dto.id = 'SCN-RC-003';
      dto.title = 'HS PS RealClinical Scenario';
      dto.hsRealClinical = {
        enabled: true,
        steps: [{ id: 'step-1', actionId: 'act-1', label: 'Step 1', order: 1 }],
      };
      dto.psRealClinical = {
        enabled: true,
        steps: [{ id: 'step-1', actionId: 'act-1', label: 'Step 1', order: 1 }],
      };

      const errors = await validate(dto);
      const hsErrors = errors.filter((e) => e.property === 'hsRealClinical');
      const psErrors = errors.filter((e) => e.property === 'psRealClinical');
      expect(hsErrors.length).toBe(0);
      expect(psErrors.length).toBe(0);
    });
  });

  describe('UpdateScenarioDto - realClinical validation', () => {
    it('should validate valid realClinical in UpdateScenarioDto', async () => {
      const dto = new UpdateScenarioDto();
      dto.realClinical = {
        enabled: true,
        steps: [
          {
            id: 'step-1',
            actionId: 'action_123',
            label: 'Adjust Bed to Working Height',
            activityType: 'action',
            order: 1,
          },
        ],
      };

      const errors = await validate(dto);
      const rcErrors = errors.filter((e) => e.property === 'realClinical');
      expect(rcErrors.length).toBe(0);
    });

    it('should allow optional realClinical in UpdateScenarioDto', async () => {
      const dto = new UpdateScenarioDto();
      dto.title = 'Updated Title';

      const errors = await validate(dto);
      const rcErrors = errors.filter((e) => e.property === 'realClinical');
      expect(rcErrors.length).toBe(0);
    });
  });

  describe('ValidationPipe with forbidNonWhitelisted: true', () => {
    it('should accept raw payload containing realClinical, hsRealClinical, psRealClinical without non-whitelisted property errors', async () => {
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      });

      const rawUpdatePayload = {
        title: 'Updated Scenario Title',
        patientChartMode: 'PS',
        realClinical: {
          enabled: true,
          steps: [
            {
              id: 's1',
              actionId: 'actions_assessment',
              label: 'Action',
              order: 1,
            },
          ],
        },
        hsRealClinical: {
          enabled: true,
          steps: [],
        },
        psRealClinical: {
          enabled: false,
          steps: [],
        },
      };

      const result = await pipe.transform(rawUpdatePayload, {
        type: 'body',
        metatype: UpdateScenarioDto,
      });

      expect(result).toBeDefined();
      expect(result.patientChartMode).toBe('PS');
      expect(result.realClinical).toEqual(rawUpdatePayload.realClinical);
      expect(result.hsRealClinical).toEqual(rawUpdatePayload.hsRealClinical);
      expect(result.psRealClinical).toEqual(rawUpdatePayload.psRealClinical);
    });
  });
});
