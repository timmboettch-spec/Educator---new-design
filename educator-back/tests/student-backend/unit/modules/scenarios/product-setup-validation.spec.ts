import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ScenariosService } from '@/modules/scenarios/scenarios.service';
import { JsonDataService } from '@/data/json-data.service';
import type { Scenario } from '@/data/json-data.service';
import { BadRequestException } from '@nestjs/common';

describe('Product Setup Validation (Integration & Regression)', () => {
  let service: ScenariosService;
  let jsonDataService: jest.Mocked<JsonDataService>;

  beforeEach(async () => {
    // Mock JsonDataService to simulate database interactions
    jsonDataService = {
      addScenario: jest.fn(),
      saveAsDefaultScenario: jest.fn(),
      updateScenario: jest.fn(),
      getScenarioById: jest.fn(),
    } as unknown as jest.Mocked<JsonDataService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [ScenariosService, { provide: JsonDataService, useValue: jsonDataService }],
    }).compile();

    service = module.get<ScenariosService>(ScenariosService);
  });

  describe('Validation Logic (Unit & Integration)', () => {
    it('should REJECT creation when requiresProductSetup is true but Product Name is missing', async () => {
      const invalidScenario = {
        id: 'new-scenario',
        requiresProductSetup: true,
        productSetup: { title: '' }, // Empty title
      };

      await expect(service.createScenario(invalidScenario as unknown as Scenario)).rejects.toThrow(
        BadRequestException,
      );
      expect(jsonDataService.addScenario).not.toHaveBeenCalled();
    });

    it('should REJECT update when requiresProductSetup is true but Product Name is missing', async () => {
      const existingScenario = {
        id: 's1',
        requiresProductSetup: true,
        productSetup: { title: 'Old Valid Title' },
      };
      jsonDataService.getScenarioById.mockReturnValue(existingScenario as unknown as Scenario);

      const invalidUpdate = {
        productSetup: { title: '   ' }, // Whitespace only
      };

      await expect(service.updateScenario('s1', invalidUpdate)).rejects.toThrow(
        BadRequestException,
      );
      expect(jsonDataService.updateScenario).not.toHaveBeenCalled();
    });

    it('should ACCEPT creation when requiresProductSetup is true and Product Name is provided', async () => {
      const validScenario = {
        id: 'valid-scenario',
        requiresProductSetup: true,
        productSetup: { title: 'Valid Product' },
      };

      await service.createScenario(validScenario as unknown as Scenario);

      expect(jsonDataService.addScenario).toHaveBeenCalledWith(validScenario);
    });

    it('should ACCEPT update when requiresProductSetup is true and Product Name is valid', async () => {
      const existingScenario = {
        id: 's1',
        requiresProductSetup: true,
        productSetup: { title: 'Old Title' },
      };
      jsonDataService.getScenarioById.mockReturnValue(existingScenario as unknown as Scenario);

      const validUpdate = {
        productSetup: { title: 'New Valid Title' },
      };

      await service.updateScenario('s1', validUpdate);

      expect(jsonDataService.updateScenario).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ productSetup: { title: 'New Valid Title' } }),
      );
    });
  });

  describe('Regression Testing', () => {
    it('should unaffected scenarios WITHOUT physical product setup (create)', async () => {
      const standardScenario = {
        id: 'standard',
        requiresProductSetup: false,
        // productSetup might be missing or empty, which is fine if flag is false
      };

      await service.createScenario(standardScenario as unknown as Scenario);

      expect(jsonDataService.addScenario).toHaveBeenCalledWith(standardScenario);
    });

    it('should unaffected scenarios WITHOUT physical product setup (update)', async () => {
      const standardScenario = {
        id: 's2',
        requiresProductSetup: false,
        title: 'Standard Scenario',
      };
      jsonDataService.getScenarioById.mockReturnValue(standardScenario as unknown as Scenario);

      const update = { title: 'Updated Title' };

      await service.updateScenario('s2', update);

      expect(jsonDataService.updateScenario).toHaveBeenCalledWith('s2', update);
    });

    it('should allow updating other fields without breaking validation for enabled setup', async () => {
      // Scenario HAS product setup enabled
      const setupScenario = {
        id: 's3',
        requiresProductSetup: true,
        productSetup: { title: 'Existing Product' },
      };
      jsonDataService.getScenarioById.mockReturnValue(setupScenario as unknown as Scenario);

      // We only update the scenario title, NOT the product setup
      const update = { title: 'New Scenario Title' };

      // Merged object will still have the old valid product title, so this should pass
      await service.updateScenario('s3', update);

      expect(jsonDataService.updateScenario).toHaveBeenCalledWith('s3', update);
    });
  });
});
