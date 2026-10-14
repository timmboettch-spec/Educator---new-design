import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AdminService } from 'src/student-backend/modules/admin/admin.service';
import { ClassSimulationService } from 'src/class-simulations/class-simulation.service';
import { VoiceProfilesService } from 'src/voice-profiles/voice-profiles.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LoggerService } from 'src/common/services';
import {
  SIMULATION_ACTION_REPOSITORY,
  SIMULATION_GRADING_RUBRIC_ITEM_REPOSITORY,
  SIMULATION_ORDER_LINKED_ACTION_REPOSITORY,
  SIMULATION_ORDER_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  TRANSCRIPT_REPOSITORY,
  UNIT_REPOSITORY,
} from 'src/database/tokens';
import {
  createMockDataSource,
  createMockSimulationChildRepository,
  createMockSimulationOrderLinkedActionRepository,
  createMockSimulationRepository,
  createMockClassSimulationService,
  createMockUnitRepository,
} from '../../common/utils/mock-factory';

const mockLoggerService = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  fatal: jest.fn(),
};

// ---------------------------------------------------------------------------
// Shared mock factory
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fixtures — shaped like the `units` table row (src/database/entities/unit.entity.ts)
// ---------------------------------------------------------------------------
const UNIT_ALPHA = {
  unitId: 'uuid-alpha',
  id: 'unit-001',
  name: 'Alpha Unit',
  category: 'AI Only',
  imageUrl: '',
};
const UNIT_BETA = {
  unitId: 'uuid-beta',
  id: 'unit-002',
  name: 'Beta Unit',
  category: 'AI Only',
  imageUrl: '',
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------
describe('Unit Duplicate Validation — AdminService', () => {
  let service: AdminService;
  let unitRepository: ReturnType<typeof createMockUnitRepository>;

  beforeEach(async () => {
    unitRepository = createMockUnitRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: VoiceProfilesService,
          useValue: {
            resolveForScenario: jest.fn().mockResolvedValue(null),
            assertValidForScenarioWrite: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: DataSource, useValue: createMockDataSource() },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: UNIT_REPOSITORY, useValue: unitRepository },
        { provide: SIMULATION_V2_REPOSITORY, useValue: createMockSimulationRepository() },
        { provide: TRANSCRIPT_REPOSITORY, useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: { findDetailRowByReportId: jest.fn() } },
        { provide: SIMULATION_ACTION_REPOSITORY, useValue: createMockSimulationChildRepository() },
        { provide: SIMULATION_ORDER_REPOSITORY, useValue: createMockSimulationChildRepository() },
        {
          provide: SIMULATION_ORDER_LINKED_ACTION_REPOSITORY,
          useValue: createMockSimulationOrderLinkedActionRepository(),
        },
        {
          provide: SIMULATION_GRADING_RUBRIC_ITEM_REPOSITORY,
          useValue: createMockSimulationChildRepository(),
        },
        { provide: ClassSimulationService, useValue: createMockClassSimulationService() },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    jest.clearAllMocks();

    // AdminService looks up duplicate names via findUniqueByName (case-insensitive,
    // trimmed) rather than scanning find() results itself — delegate to whatever
    // list each test configures via unitRepository.find.mockResolvedValue(...).
    unitRepository.findUniqueByName.mockImplementation(async (name: string) => {
      const list = (await unitRepository.find()) as Array<{ name: string }>;
      const needle = (name || '').trim().toLowerCase();
      return list.find((u) => u.name.trim().toLowerCase() === needle) ?? null;
    });
  });

  // =========================================================================
  // createUnit — duplicate ID
  // =========================================================================
  describe('createUnit — duplicate ID checks', () => {
    it('throws BadRequestException when unit ID already exists', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(UNIT_ALPHA as never); // ID exists

      await expect(async () =>
        service.createUnit({ id: 'unit-001', name: 'Different Name' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('error message mentions the duplicate ID', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(UNIT_ALPHA as never);

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
      unitRepository.findByBusinessId.mockResolvedValue(null); // ID is free
      unitRepository.find.mockResolvedValue([UNIT_ALPHA, UNIT_BETA] as never);

      await expect(async () =>
        service.createUnit({ id: 'unit-new', name: 'Alpha Unit' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for case-insensitive duplicate name (lowercase input)', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(null);
      unitRepository.find.mockResolvedValue([UNIT_ALPHA] as never);

      await expect(async () =>
        service.createUnit({ id: 'unit-new', name: 'alpha unit' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for case-insensitive duplicate name (uppercase input)', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(null);
      unitRepository.find.mockResolvedValue([UNIT_ALPHA] as never);

      await expect(async () =>
        service.createUnit({ id: 'unit-new', name: 'ALPHA UNIT' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for case-insensitive duplicate with mixed case', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(null);
      unitRepository.find.mockResolvedValue([UNIT_ALPHA] as never);

      await expect(async () =>
        service.createUnit({ id: 'unit-new', name: 'aLpHa UnIt' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('error message mentions the duplicate name', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(null);
      unitRepository.find.mockResolvedValue([UNIT_BETA] as never);

      await expect(async () =>
        service.createUnit({ id: 'unit-new', name: 'Beta Unit' }),
      ).rejects.toThrow(/Unit with name "Beta Unit" already exists/i);
    });

    it('error message says "Unit name must be unique"', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(null);
      unitRepository.find.mockResolvedValue([UNIT_BETA] as never);

      await expect(async () =>
        service.createUnit({ id: 'unit-new', name: 'Beta Unit' }),
      ).rejects.toThrow(/Unit name must be unique/i);
    });

    it('throws BadRequestException when name is empty string', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(null);
      unitRepository.find.mockResolvedValue([]);

      await expect(async () => service.createUnit({ id: 'unit-new', name: '' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when name is whitespace-only', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(null);
      unitRepository.find.mockResolvedValue([]);

      await expect(async () => service.createUnit({ id: 'unit-new', name: '   ' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when name is missing', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(null);
      unitRepository.find.mockResolvedValue([]);

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
      unitRepository.findByBusinessId.mockResolvedValue(null);
      unitRepository.find.mockResolvedValue([UNIT_ALPHA, UNIT_BETA] as never);

      const result = await service.createUnit({
        id: 'unit-003',
        name: 'Gamma Unit',
      });

      expect(result.id).toBe('unit-003');
      expect(result.name).toBe('Gamma Unit');
      expect(unitRepository.create).toHaveBeenCalledTimes(1);
      expect(unitRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'unit-003', name: 'Gamma Unit' }),
      );
    });

    it('unit is created with default category "AI Only" when not specified', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(null);
      unitRepository.find.mockResolvedValue([]);

      const result = await service.createUnit({
        id: 'unit-x',
        name: 'New Unit',
      });

      expect(result.category).toBe('AI Only');
    });

    it('does NOT call create when validation fails', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(UNIT_ALPHA as never); // ID conflict

      await expect(async () =>
        service.createUnit({ id: 'unit-001', name: 'Alpha Unit' }),
      ).rejects.toThrow(BadRequestException);

      expect(unitRepository.create).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // updateUnit — duplicate name
  // =========================================================================
  describe('updateUnit — duplicate name checks', () => {
    it('throws BadRequestException when renaming to a name used by another unit', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(UNIT_ALPHA as never);
      unitRepository.find.mockResolvedValue([UNIT_ALPHA, UNIT_BETA] as never);

      await expect(async () =>
        service.updateUnit('unit-001', { name: 'Beta Unit' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for case-insensitive duplicate on update', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(UNIT_ALPHA as never);
      unitRepository.find.mockResolvedValue([UNIT_ALPHA, UNIT_BETA] as never);

      await expect(async () =>
        service.updateUnit('unit-001', { name: 'beta unit' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for UPPERCASE duplicate during update', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(UNIT_ALPHA as never);
      unitRepository.find.mockResolvedValue([UNIT_ALPHA, UNIT_BETA] as never);

      await expect(async () =>
        service.updateUnit('unit-001', { name: 'BETA UNIT' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('error message mentions the conflicting name', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(UNIT_ALPHA as never);
      unitRepository.find.mockResolvedValue([UNIT_ALPHA, UNIT_BETA] as never);

      await expect(async () =>
        service.updateUnit('unit-001', { name: 'Beta Unit' }),
      ).rejects.toThrow(/Unit with name "Beta Unit" already exists/i);
    });

    it('throws BadRequestException when name is cleared to empty string', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(UNIT_ALPHA as never);

      await expect(async () => service.updateUnit('unit-001', { name: '' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when name is set to whitespace only', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(UNIT_ALPHA as never);

      await expect(async () => service.updateUnit('unit-001', { name: '   ' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('does NOT call update (data layer) when validation fails', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(UNIT_ALPHA as never);
      unitRepository.find.mockResolvedValue([UNIT_ALPHA, UNIT_BETA] as never);

      await expect(async () =>
        service.updateUnit('unit-001', { name: 'Beta Unit' }),
      ).rejects.toThrow(BadRequestException);

      expect(unitRepository.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // updateUnit — no false positives (regression)
  // =========================================================================
  describe('updateUnit — no false positives (regression)', () => {
    it('allows keeping the same name on the same unit without error', async () => {
      unitRepository.findByBusinessId
        .mockResolvedValueOnce(UNIT_ALPHA as never) // existence check
        .mockResolvedValueOnce(UNIT_ALPHA as never); // return after update
      unitRepository.find.mockResolvedValue([UNIT_ALPHA, UNIT_BETA] as never);

      await service.updateUnit('unit-001', {
        name: 'Alpha Unit',
      });

      expect(unitRepository.update).toHaveBeenCalledWith(
        { id: 'unit-001' },
        expect.objectContaining({ name: 'Alpha Unit' }),
      );
    });

    it('allows renaming to a completely new unique name', async () => {
      unitRepository.findByBusinessId
        .mockResolvedValueOnce(UNIT_ALPHA as never)
        .mockResolvedValueOnce({ ...UNIT_ALPHA, name: 'Alpha Renamed' } as never);
      unitRepository.find.mockResolvedValue([UNIT_ALPHA, UNIT_BETA] as never);

      await service.updateUnit('unit-001', { name: 'Alpha Renamed' });

      expect(unitRepository.update).toHaveBeenCalledWith(
        { id: 'unit-001' },
        expect.objectContaining({ name: 'Alpha Renamed' }),
      );
    });

    it('skips name check entirely when name field is not in the update payload', async () => {
      unitRepository.findByBusinessId
        .mockResolvedValueOnce(UNIT_ALPHA as never) // existence check
        .mockResolvedValueOnce(UNIT_ALPHA as never); // return after update

      // Updating imageUrl only — no name field
      await service.updateUnit('unit-001', {
        imageUrl: '/updated-image.jpg',
      });

      expect(unitRepository.update).toHaveBeenCalledWith(
        { id: 'unit-001' },
        expect.objectContaining({ imageUrl: '/updated-image.jpg' }),
      );
      // find (used for the name-duplicate check) should NOT have been called — no name in payload
      expect(unitRepository.find).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when unit does not exist', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(null);

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
      unitRepository.findByBusinessId.mockResolvedValue(null);
      unitRepository.find.mockResolvedValue([]); // empty list → no duplicates

      await service.createUnit({ id: 'unit-new', name: 'Brand New Unit' });

      expect(unitRepository.create).toHaveBeenCalledTimes(1);

      // Second call: same name now exists
      unitRepository.findByBusinessId.mockResolvedValue(null); // different ID
      unitRepository.find.mockResolvedValue([{ id: 'unit-new', name: 'Brand New Unit' }] as never);

      await expect(async () =>
        service.createUnit({ id: 'unit-another', name: 'Brand New Unit' }),
      ).rejects.toThrow(BadRequestException);

      // create should still have been called only once (first call)
      expect(unitRepository.create).toHaveBeenCalledTimes(1);
    });

    it('rejects createUnit with same ID as existing unit even if name is unique', async () => {
      unitRepository.findByBusinessId.mockResolvedValue(UNIT_ALPHA as never); // ID collision
      unitRepository.find.mockResolvedValue([UNIT_ALPHA] as never);

      await expect(async () =>
        service.createUnit({
          id: 'unit-001',
          name: 'Completely Different Name',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(unitRepository.create).not.toHaveBeenCalled();
    });

    it('after a failed createUnit (name conflict), a valid createUnit with different name succeeds', async () => {
      // First: name conflict
      unitRepository.findByBusinessId.mockResolvedValueOnce(null);
      unitRepository.find.mockResolvedValue([UNIT_ALPHA] as never);

      await expect(async () =>
        service.createUnit({ id: 'unit-new', name: 'Alpha Unit' }),
      ).rejects.toThrow(BadRequestException);

      // Second: unique name
      unitRepository.findByBusinessId.mockResolvedValueOnce(null);
      unitRepository.find.mockResolvedValue([UNIT_ALPHA] as never);

      const result = await service.createUnit({
        id: 'unit-new',
        name: 'Unique Name Here',
      });

      expect(result.id).toBe('unit-new');
      expect(unitRepository.create).toHaveBeenCalledTimes(1);
    });

    it('after a failed updateUnit (duplicate name), a valid rename to unique name succeeds', async () => {
      // First attempt: duplicate name
      unitRepository.findByBusinessId.mockResolvedValueOnce(UNIT_ALPHA as never);
      unitRepository.find.mockResolvedValueOnce([UNIT_ALPHA, UNIT_BETA] as never);

      await expect(async () =>
        service.updateUnit('unit-001', { name: 'Beta Unit' }),
      ).rejects.toThrow(BadRequestException);

      expect(unitRepository.update).not.toHaveBeenCalled();

      // Second attempt: unique name
      unitRepository.findByBusinessId
        .mockResolvedValueOnce(UNIT_ALPHA as never)
        .mockResolvedValueOnce({ ...UNIT_ALPHA, name: 'Unique Rename' } as never);
      unitRepository.find.mockResolvedValueOnce([UNIT_ALPHA, UNIT_BETA] as never);

      await service.updateUnit('unit-001', { name: 'Unique Rename' });

      expect(unitRepository.update).toHaveBeenCalledTimes(1);
    });
  });
});
