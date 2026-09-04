import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AdminService } from '@/modules/admin/admin.service';
import { JsonDataService } from '@/data/json-data.service';
import { BadRequestException } from '@nestjs/common';

const buildJsonDataServiceMock = () => ({
  getUsers: jest.fn(),
  getPermissionsData: jest.fn(),
  getTranscripts: jest.fn(),
  getScenarios: jest.fn(),
  getScenarioById: jest.fn(),
  addScenario: jest.fn(),
  updateScenario: jest.fn(),
  deleteScenario: jest.fn(),
  getUnits: jest.fn(),
  getUnitById: jest.fn(),
  addUnit: jest.fn(),
  updateUnit: jest.fn(),
  deleteUnit: jest.fn(),
  getScenariosByUnitId: jest.fn(),
  updatePermissions: jest.fn(),
  getReports: jest.fn(),
  deleteReport: jest.fn(),
});

describe('Unit ID Validation — AdminService', () => {
  let service: AdminService;
  let db: ReturnType<typeof buildJsonDataServiceMock>;

  beforeEach(async () => {
    db = buildJsonDataServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService, { provide: JsonDataService, useValue: db }],
    }).compile();

    service = module.get<AdminService>(AdminService);
    jest.clearAllMocks();
  });

  describe('createUnit ID validation', () => {
    it("throws BadRequestException for ID with '@'", async () => {
      db.getUnitById.mockReturnValue(null);
      db.getUnits.mockReturnValue([]);

      await expect(async () =>
        service.createUnit({ id: '@unit-123', name: 'Nursing' }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException for ID with '#'", async () => {
      db.getUnitById.mockReturnValue(null);
      db.getUnits.mockReturnValue([]);

      await expect(async () => service.createUnit({ id: 'unit#1', name: 'ICU' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('allows valid ID with letters, numbers, hyphens, underscores and spaces', async () => {
      db.getUnitById.mockReturnValue(null);
      db.getUnits.mockReturnValue([]);

      const result = service.createUnit({
        id: 'unit-123_test ABC',
        name: 'Valid Name',
      });
      expect(result.id).toBe('unit-123_test ABC');
    });

    it('throws BadRequestException for ID with other special characters', async () => {
      db.getUnitById.mockReturnValue(null);
      db.getUnits.mockReturnValue([]);

      await expect(async () =>
        service.createUnit({ id: 'unit%20', name: 'Nursing' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
