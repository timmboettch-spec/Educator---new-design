import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AdminService } from '@/modules/admin/admin.service';
import { JsonDataService } from '@/data/json-data.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Shared mock factory
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const UNIT_ALPHA = {
  id: 'unit-001',
  name: 'Alpha Unit',
  category: 'AI Only',
  imageUrl: '',
  scenarioCount: 0,
  completedCount: 0,
};
const UNIT_BETA = {
  id: 'unit-002',
  name: 'Beta Unit',
  category: 'AI Only',
  imageUrl: '',
  scenarioCount: 0,
  completedCount: 0,
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------
describe('Unit Duplicate Validation — AdminService', () => {
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

  // =========================================================================
  // createUnit — duplicate ID
  // =========================================================================
  describe('createUnit — duplicate ID checks', () => {
    it('throws BadRequestException when unit ID already exists', async () => {
      db.getUnitById.mockReturnValue(UNIT_ALPHA); // ID exists

      await expect(async () =>
        service.createUnit({ id: 'unit-001', name: 'Different Name' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('error message mentions the duplicate ID', async () => {
      db.getUnitById.mockReturnValue(UNIT_ALPHA);

      await expect(async () =>
        service.createUnit({ id: 'unit-001', name: 'Different Name' }),
      ).rejects.toThrow(/Unit with ID unit-001 already exists/i);
    });

    it('throws BadRequestException for empty ID string', async () => {
      await expect(async () => service.createUnit({ id: '', name: 'Some Name' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for whitespace-only ID', async () => {
      await expect(async () =>
        service.createUnit({ id: '   ', name: 'Some Name' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when ID is missing entirely', async () => {
      await expect(async () => service.createUnit({ name: 'Some Name' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // =========================================================================
  // createUnit — duplicate name
  // =========================================================================
  describe('createUnit — duplicate name checks', () => {
    it('throws BadRequestException when name already exists (exact match)', async () => {
      db.getUnitById.mockReturnValue(null); // ID is free
      db.getUnits.mockReturnValue([UNIT_ALPHA, UNIT_BETA]);

      await expect(async () =>
        service.createUnit({ id: 'unit-new', name: 'Alpha Unit' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for case-insensitive duplicate name (lowercase input)', async () => {
      db.getUnitById.mockReturnValue(null);
      db.getUnits.mockReturnValue([UNIT_ALPHA]);

      await expect(async () =>
        service.createUnit({ id: 'unit-new', name: 'alpha unit' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for case-insensitive duplicate name (uppercase input)', async () => {
      db.getUnitById.mockReturnValue(null);
      db.getUnits.mockReturnValue([UNIT_ALPHA]);

      await expect(async () =>
        service.createUnit({ id: 'unit-new', name: 'ALPHA UNIT' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for case-insensitive duplicate with mixed case', async () => {
      db.getUnitById.mockReturnValue(null);
      db.getUnits.mockReturnValue([UNIT_ALPHA]);

      await expect(async () =>
        service.createUnit({ id: 'unit-new', name: 'aLpHa UnIt' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('error message mentions the duplicate name', async () => {
      db.getUnitById.mockReturnValue(null);
      db.getUnits.mockReturnValue([UNIT_BETA]);

      await expect(async () =>
        service.createUnit({ id: 'unit-new', name: 'Beta Unit' }),
      ).rejects.toThrow(/Unit with name "Beta Unit" already exists/i);
    });

    it('error message says "Unit name must be unique"', async () => {
      db.getUnitById.mockReturnValue(null);
      db.getUnits.mockReturnValue([UNIT_BETA]);

      await expect(async () =>
        service.createUnit({ id: 'unit-new', name: 'Beta Unit' }),
      ).rejects.toThrow(/Unit name must be unique/i);
    });

    it('throws BadRequestException when name is empty string', async () => {
      db.getUnitById.mockReturnValue(null);
      db.getUnits.mockReturnValue([]);

      await expect(async () => service.createUnit({ id: 'unit-new', name: '' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when name is whitespace-only', async () => {
      db.getUnitById.mockReturnValue(null);
      db.getUnits.mockReturnValue([]);

      await expect(async () => service.createUnit({ id: 'unit-new', name: '   ' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when name is missing', async () => {
      db.getUnitById.mockReturnValue(null);
      db.getUnits.mockReturnValue([]);

      await expect(async () => service.createUnit({ id: 'unit-new' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // =========================================================================
  // createUnit — successful creation (regression)
  // =========================================================================
  describe('createUnit — valid / unique creation (regression)', () => {
    it('creates and returns unit when ID and name are both unique', async () => {
      db.getUnitById.mockReturnValue(null);
      db.getUnits.mockReturnValue([UNIT_ALPHA, UNIT_BETA]);

      const result = service.createUnit({
        id: 'unit-003',
        name: 'Gamma Unit',
      });

      expect(result.id).toBe('unit-003');
      expect(result.name).toBe('Gamma Unit');
      expect(db.addUnit).toHaveBeenCalledTimes(1);
      expect(db.addUnit).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'unit-003', name: 'Gamma Unit' }),
      );
    });

    it('unit is created with default category "AI Only" when not specified', async () => {
      db.getUnitById.mockReturnValue(null);
      db.getUnits.mockReturnValue([]);

      const result = service.createUnit({
        id: 'unit-x',
        name: 'New Unit',
      });

      expect(result.category).toBe('AI Only');
    });

    it('does NOT call addUnit when validation fails', async () => {
      db.getUnitById.mockReturnValue(UNIT_ALPHA); // ID conflict

      await expect(async () =>
        service.createUnit({ id: 'unit-001', name: 'Alpha Unit' }),
      ).rejects.toThrow(BadRequestException);

      expect(db.addUnit).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // updateUnit — duplicate name
  // =========================================================================
  describe('updateUnit — duplicate name checks', () => {
    it('throws BadRequestException when renaming to a name used by another unit', async () => {
      db.getUnitById.mockReturnValue(UNIT_ALPHA);
      db.getUnits.mockReturnValue([UNIT_ALPHA, UNIT_BETA]);

      await expect(async () =>
        service.updateUnit('unit-001', { name: 'Beta Unit' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for case-insensitive duplicate on update', async () => {
      db.getUnitById.mockReturnValue(UNIT_ALPHA);
      db.getUnits.mockReturnValue([UNIT_ALPHA, UNIT_BETA]);

      await expect(async () =>
        service.updateUnit('unit-001', { name: 'beta unit' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for UPPERCASE duplicate during update', async () => {
      db.getUnitById.mockReturnValue(UNIT_ALPHA);
      db.getUnits.mockReturnValue([UNIT_ALPHA, UNIT_BETA]);

      await expect(async () =>
        service.updateUnit('unit-001', { name: 'BETA UNIT' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('error message mentions the conflicting name', async () => {
      db.getUnitById.mockReturnValue(UNIT_ALPHA);
      db.getUnits.mockReturnValue([UNIT_ALPHA, UNIT_BETA]);

      await expect(async () =>
        service.updateUnit('unit-001', { name: 'Beta Unit' }),
      ).rejects.toThrow(/Unit with name "Beta Unit" already exists/i);
    });

    it('throws BadRequestException when name is cleared to empty string', async () => {
      db.getUnitById.mockReturnValue(UNIT_ALPHA);

      await expect(async () => service.updateUnit('unit-001', { name: '' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when name is set to whitespace only', async () => {
      db.getUnitById.mockReturnValue(UNIT_ALPHA);

      await expect(async () => service.updateUnit('unit-001', { name: '   ' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('does NOT call updateUnit (data layer) when validation fails', async () => {
      db.getUnitById.mockReturnValue(UNIT_ALPHA);
      db.getUnits.mockReturnValue([UNIT_ALPHA, UNIT_BETA]);

      await expect(async () =>
        service.updateUnit('unit-001', { name: 'Beta Unit' }),
      ).rejects.toThrow(BadRequestException);

      expect(db.updateUnit).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // updateUnit — no false positives (regression)
  // =========================================================================
  describe('updateUnit — no false positives (regression)', () => {
    it('allows keeping the same name on the same unit without error', async () => {
      db.getUnitById
        .mockReturnValueOnce(UNIT_ALPHA) // existence check
        .mockReturnValueOnce(UNIT_ALPHA); // return after update
      db.getUnits.mockReturnValue([UNIT_ALPHA, UNIT_BETA]);

      service.updateUnit('unit-001', {
        name: 'Alpha Unit',
      });

      expect(db.updateUnit).toHaveBeenCalledWith('unit-001', {
        name: 'Alpha Unit',
      });
    });

    it('allows renaming to a completely new unique name', async () => {
      db.getUnitById
        .mockReturnValueOnce(UNIT_ALPHA)
        .mockReturnValueOnce({ ...UNIT_ALPHA, name: 'Alpha Renamed' });
      db.getUnits.mockReturnValue([UNIT_ALPHA, UNIT_BETA]);

      service.updateUnit('unit-001', { name: 'Alpha Renamed' });

      expect(db.updateUnit).toHaveBeenCalledWith('unit-001', {
        name: 'Alpha Renamed',
      });
    });

    it('skips name check entirely when name field is not in the update payload', async () => {
      db.getUnitById
        .mockReturnValueOnce(UNIT_ALPHA) // existence check
        .mockReturnValueOnce(UNIT_ALPHA); // return after update

      // Updating imageUrl only — no name field
      service.updateUnit('unit-001', {
        imageUrl: '/updated-image.jpg',
      });

      expect(db.updateUnit).toHaveBeenCalledWith('unit-001', {
        imageUrl: '/updated-image.jpg',
      });
      // getUnits should NOT have been called (no name in payload)
      expect(db.getUnits).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when unit does not exist', async () => {
      db.getUnitById.mockReturnValue(null);

      await expect(async () =>
        service.updateUnit('non-existent', { name: 'Anything' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // Integration: create → duplicate → error cycle
  // =========================================================================
  describe('Integration — create → duplicate → error cycle', () => {
    it('rejects a second createUnit call with the same name (simulated sequence)', async () => {
      // First call succeeds
      db.getUnitById.mockReturnValue(null);
      db.getUnits.mockReturnValue([]); // empty list → no duplicates

      service.createUnit({ id: 'unit-new', name: 'Brand New Unit' });

      expect(db.addUnit).toHaveBeenCalledTimes(1);

      // Second call: same name now exists
      db.getUnitById.mockReturnValue(null); // different ID
      db.getUnits.mockReturnValue([{ id: 'unit-new', name: 'Brand New Unit' }]);

      await expect(async () =>
        service.createUnit({ id: 'unit-another', name: 'Brand New Unit' }),
      ).rejects.toThrow(BadRequestException);

      // addUnit should still have been called only once (first call)
      expect(db.addUnit).toHaveBeenCalledTimes(1);
    });

    it('rejects createUnit with same ID as existing unit even if name is unique', async () => {
      db.getUnitById.mockReturnValue(UNIT_ALPHA); // ID collision
      db.getUnits.mockReturnValue([UNIT_ALPHA]);

      await expect(async () =>
        service.createUnit({
          id: 'unit-001',
          name: 'Completely Different Name',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(db.addUnit).not.toHaveBeenCalled();
    });

    it('after a failed createUnit (name conflict), a valid createUnit with different name succeeds', async () => {
      // First: name conflict
      db.getUnitById.mockReturnValueOnce(null);
      db.getUnits.mockReturnValue([UNIT_ALPHA]);

      await expect(async () =>
        service.createUnit({ id: 'unit-new', name: 'Alpha Unit' }),
      ).rejects.toThrow(BadRequestException);

      // Second: unique name
      db.getUnitById.mockReturnValueOnce(null);
      db.getUnits.mockReturnValue([UNIT_ALPHA]);

      const result = service.createUnit({
        id: 'unit-new',
        name: 'Unique Name Here',
      });

      expect(result.id).toBe('unit-new');
      expect(db.addUnit).toHaveBeenCalledTimes(1);
    });

    it('after a failed updateUnit (duplicate name), a valid rename to unique name succeeds', async () => {
      // First attempt: duplicate name
      db.getUnitById.mockReturnValueOnce(UNIT_ALPHA);
      db.getUnits.mockReturnValueOnce([UNIT_ALPHA, UNIT_BETA]);

      await expect(async () =>
        service.updateUnit('unit-001', { name: 'Beta Unit' }),
      ).rejects.toThrow(BadRequestException);

      expect(db.updateUnit).not.toHaveBeenCalled();

      // Second attempt: unique name
      db.getUnitById
        .mockReturnValueOnce(UNIT_ALPHA)
        .mockReturnValueOnce({ ...UNIT_ALPHA, name: 'Unique Rename' });
      db.getUnits.mockReturnValueOnce([UNIT_ALPHA, UNIT_BETA]);

      service.updateUnit('unit-001', { name: 'Unique Rename' });

      expect(db.updateUnit).toHaveBeenCalledTimes(1);
    });
  });
});
