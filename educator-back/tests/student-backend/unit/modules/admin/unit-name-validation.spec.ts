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

describe('Unit Name Validation — AdminService', () => {
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

  describe('createUnit name validation', () => {
    it("throws BadRequestException for name with '@'", async () => {
      db.getUnitById.mockReturnValue(null);
      db.getUnits.mockReturnValue([]);

      await expect(async () =>
        service.createUnit({ id: 'unit-new', name: 'Nursing@123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException for name with '#'", async () => {
      db.getUnitById.mockReturnValue(null);
      db.getUnits.mockReturnValue([]);

      await expect(async () =>
        service.createUnit({ id: 'unit-new', name: 'ICU#1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows valid name with letters, numbers and spaces', async () => {
      db.getUnitById.mockReturnValue(null);
      db.getUnits.mockReturnValue([]);

      const result = service.createUnit({
        id: 'unit-new',
        name: 'Valid Unit 123',
      });
      expect(result.name).toBe('Valid Unit 123');
    });
  });

  describe('updateUnit name validation', () => {
    const UNIT_ALPHA = { id: 'unit-001', name: 'Alpha Unit' };

    it("throws BadRequestException for name with '$' during update", async () => {
      db.getUnitById.mockReturnValue(UNIT_ALPHA);

      await expect(async () =>
        service.updateUnit('unit-001', { name: 'Invalid$Name' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
