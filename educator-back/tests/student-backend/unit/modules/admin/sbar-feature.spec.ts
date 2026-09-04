import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AdminController } from '@/modules/admin/admin.controller';
import { AdminService } from '@/modules/admin/admin.service';
import { CreateScenarioDto } from '@/modules/admin/dto/create-scenario.dto';
import { UpdateScenarioDto } from '@/modules/admin/dto/update-scenario.dto';
import { validate } from 'class-validator';

describe('SBAR Feature - Backend Tests', () => {
  let controller: AdminController;

  const mockAdminService = {
    createScenario: jest.fn(),
    updateScenario: jest.fn(),
    findAllScenarios: jest.fn(),
    findScenarioById: jest.fn(),
    deleteScenario: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: mockAdminService,
        },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);

    jest.clearAllMocks();
  });

  describe('Unit Tests: DTO Validation', () => {
    it('should validate a valid sbar object in CreateScenarioDto', async () => {
      const dto = new CreateScenarioDto();
      dto.title = 'Test Scenario';
      dto.sbar = {
        situation: 'Test Situation',
        background: 'Test Background',
        assessment: 'Test Assessment',
        recommendation: 'Test Recommendation',
      };

      const errors = await validate(dto);
      const sbarErrors = errors.filter((e) => e.property === 'sbar');
      expect(sbarErrors.length).toBe(0);
    });

    it('should allow optional sbar fields in CreateScenarioDto', async () => {
      const dto = new CreateScenarioDto();
      dto.title = 'Test Scenario';
      dto.sbar = {
        situation: 'Test Situation',
        // background, assessment, recommendation missing
      };

      const errors = await validate(dto);
      const sbarErrors = errors.filter((e) => e.property === 'sbar');
      expect(sbarErrors.length).toBe(0);
    });

    it('should allow sbar to be undefined (Regression)', async () => {
      const dto = new CreateScenarioDto();
      dto.title = 'Test Scenario';
      // sbar is undefined

      const errors = await validate(dto);
      const sbarErrors = errors.filter((e) => e.property === 'sbar');
      expect(sbarErrors.length).toBe(0);
    });

    it('should validate sbar object in UpdateScenarioDto', async () => {
      const dto = new UpdateScenarioDto();
      dto.sbar = {
        situation: 'Updated Situation',
      };

      const errors = await validate(dto);
      const sbarErrors = errors.filter((e) => e.property === 'sbar');
      expect(sbarErrors.length).toBe(0);
    });
  });

  describe('Integration Tests: Controller -> Service', () => {
    it('should pass sbar data correctly to createScenario', async () => {
      const createDto: CreateScenarioDto = {
        scenarioId: '123',
        title: 'New SBAR Scenario',
        sbar: {
          situation: 'Sit',
          background: 'Back',
          assessment: 'Assess',
          recommendation: 'Rec',
        },
      } as unknown as CreateScenarioDto;

      const expectedResult = { ...createDto, id: '1' };
      mockAdminService.createScenario.mockResolvedValue(expectedResult);

      const result = await controller.createScenario(createDto);

      expect(mockAdminService.createScenario).toHaveBeenCalledWith({
        ...createDto,
        id: '123',
      });
      expect(result).toEqual(expectedResult);
      expect(result.sbar).toEqual(createDto.sbar);
    });

    it('should pass sbar data correctly to updateScenario', async () => {
      const updateDto: UpdateScenarioDto = {
        sbar: {
          situation: 'Updated Sit',
          background: 'Updated Back',
        },
      };
      const scenarioId = '123';
      const expectedResult = { id: scenarioId, ...updateDto };
      mockAdminService.updateScenario.mockResolvedValue(expectedResult);

      const result = await controller.updateScenario(scenarioId, updateDto);

      expect(mockAdminService.updateScenario).toHaveBeenCalledWith(scenarioId, updateDto);
      expect(result).toBeDefined();
      expect(result!.sbar).toEqual(updateDto.sbar);
    });
  });

  describe('Regression Tests', () => {
    it('should handle creation without sbar data (Backward Compatibility)', async () => {
      const createDto: CreateScenarioDto = {
        scenarioId: '456',
        title: 'Legacy Scenario',
      } as unknown as CreateScenarioDto;

      const expectedResult = { ...createDto, id: '2' };
      mockAdminService.createScenario.mockResolvedValue(expectedResult);

      const result = await controller.createScenario(createDto);

      expect(mockAdminService.createScenario).toHaveBeenCalledWith({
        ...createDto,
        id: '456',
      });
      expect(result.sbar).toBeUndefined();
    });

    it('should handle updates without sbar data', async () => {
      const updateDto: UpdateScenarioDto = {
        title: 'Updated Title Only',
      };
      const scenarioId = '456';

      mockAdminService.updateScenario.mockResolvedValue({
        id: scenarioId,
        ...updateDto,
      });

      await controller.updateScenario(scenarioId, updateDto);

      expect(mockAdminService.updateScenario).toHaveBeenCalledWith(scenarioId, updateDto);
    });
  });
});
