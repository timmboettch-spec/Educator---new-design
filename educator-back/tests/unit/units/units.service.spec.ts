import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { UnitsService } from '../../../src/units/units.service';
import { SIMULATION_V2_REPOSITORY, UNIT_REPOSITORY } from '../../../src/database/tokens';
import { ICurrentUser } from '../../../src/common/interfaces';
import { DropdownUnitsReqDto } from '../../../src/units/dto/dropdown-units.dto';

describe('UnitsService', () => {
  let service: UnitsService;
  const findForDropdown = jest.fn();
  const unitRepository = { findForDropdown };
  const simulationV2Repository = { countSimulationByUnitId: jest.fn() };
  const currentUser = { userId: 'user-1' } as ICurrentUser;

  beforeEach(async () => {
    findForDropdown.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnitsService,
        { provide: UNIT_REPOSITORY, useValue: unitRepository },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationV2Repository },
      ],
    }).compile();

    service = module.get(UnitsService);
  });

  describe('findForDropdown', () => {
    it('returns the dropdown items with pagination meta on success', async () => {
      findForDropdown.mockResolvedValue({
        items: [{ unitId: 'uuid-1', id: 'cardiac-care', name: 'Cardiac Care' }],
        total: 1,
        page: 1,
        pageSize: 100,
      });
      const dto: DropdownUnitsReqDto = { page: 1, pageSize: 100, search: 'Cardiac' };

      const result = await service.findForDropdown(currentUser, dto);

      expect(findForDropdown).toHaveBeenCalledWith({ page: 1, pageSize: 100, search: 'Cardiac' });
      expect(result.data).toEqual([{ unitId: 'uuid-1', id: 'cardiac-care', name: 'Cardiac Care' }]);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        pageSize: 100,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
    });

    it('passes an empty items array through when nothing matches', async () => {
      findForDropdown.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });

      const result = await service.findForDropdown(currentUser, { page: 1, pageSize: 100 });

      expect(result.data).toEqual([]);
      expect(result.meta?.total).toBe(0);
    });

    it('wraps an unexpected repository error via handleError', async () => {
      findForDropdown.mockRejectedValue(new Error('db down'));

      await expect(
        service.findForDropdown(currentUser, { page: 1, pageSize: 100 }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });
});
