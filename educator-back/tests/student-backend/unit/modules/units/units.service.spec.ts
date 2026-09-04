import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { UnitsService } from '@/modules/units/units.service';
import { JsonDataService } from '@/data/json-data.service';
import { NotFoundException } from '@nestjs/common';

describe('UnitsService', () => {
  let service: UnitsService;
  let jsonDataService: jest.Mocked<JsonDataService>;

  const mockUnits = [
    {
      id: 'unit1',
      name: 'Unit 1',
      imageUrl: 'img1',
      scenarioCount: 0,
      completedCount: 0,
    },
    {
      id: 'unit2',
      name: 'Unit 2',
      imageUrl: 'img2',
      scenarioCount: 0,
      completedCount: 0,
    },
  ];

  const mockScenarios = [
    { id: 's1', unitId: 'unit1' },
    { id: 's2', unitId: 'unit1' },
  ];

  const mockTranscripts = [{ scenarioId: 's1', endedAt: new Date() }];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnitsService,
        {
          provide: JsonDataService,
          useValue: {
            getUnits: jest.fn(),
            getUnitById: jest.fn(),
            getScenariosByUnitId: jest.fn(),
            getTranscriptsByUserId: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UnitsService>(UnitsService);
    jsonDataService = module.get(JsonDataService);
  });

  describe('findAll', () => {
    it('should return units with scenarioCount and completedCount = 0 when no userId', async () => {
      jsonDataService.getUnits.mockReturnValue(
        mockUnits as unknown as ReturnType<typeof jsonDataService.getUnits>,
      );
      jsonDataService.getScenariosByUnitId.mockReturnValue(
        mockScenarios as unknown as ReturnType<typeof jsonDataService.getScenariosByUnitId>,
      );

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0].scenarioCount).toBe(2);
      expect(result[0].completedCount).toBe(0);
    });

    it('should calculate completedCount when userId is provided', async () => {
      jsonDataService.getUnits.mockReturnValue(
        mockUnits as unknown as ReturnType<typeof jsonDataService.getUnits>,
      );
      jsonDataService.getScenariosByUnitId.mockReturnValue(
        mockScenarios as unknown as ReturnType<typeof jsonDataService.getScenariosByUnitId>,
      );
      jsonDataService.getTranscriptsByUserId.mockReturnValue(
        mockTranscripts as unknown as ReturnType<typeof jsonDataService.getTranscriptsByUserId>,
      );

      const result = await service.findAll('user1');

      expect(result[0].scenarioCount).toBe(2);
      expect(result[0].completedCount).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return unit details with scenarioCount and completedCount', async () => {
      jsonDataService.getUnitById.mockReturnValue(
        mockUnits[0] as unknown as ReturnType<typeof jsonDataService.getUnitById>,
      );
      jsonDataService.getScenariosByUnitId.mockReturnValue(
        mockScenarios as unknown as ReturnType<typeof jsonDataService.getScenariosByUnitId>,
      );
      jsonDataService.getTranscriptsByUserId.mockReturnValue(
        mockTranscripts as unknown as ReturnType<typeof jsonDataService.getTranscriptsByUserId>,
      );

      const result = await service.findOne('unit1', 'user1');

      expect(result.id).toBe('unit1');
      expect(result.scenarioCount).toBe(2);
      expect(result.completedCount).toBe(1);
    });

    it('should throw NotFoundException when unit not found', async () => {
      jsonDataService.getUnitById.mockReturnValue(undefined);

      await expect(service.findOne('invalid')).rejects.toThrow(NotFoundException);
    });
  });
});
