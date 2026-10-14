import { ILike } from 'typeorm';
import { UnitRepository } from '../../../src/database/repositories/unit.repository';

describe('UnitRepository', () => {
  const findAndCount = jest.fn();

  const repo = { findAndCount };

  const repository = new UnitRepository(repo as never);

  beforeEach(() => {
    findAndCount.mockReset();
  });

  describe('findForDropdown', () => {
    it('defaults to page 1 and the dropdown default page size when none are given', async () => {
      findAndCount.mockResolvedValue([
        [{ unitId: 'uuid-1', id: 'cardiac-care', name: 'Cardiac Care' }],
        1,
      ]);

      const result = await repository.findForDropdown({});

      expect(findAndCount).toHaveBeenCalledWith({
        where: {},
        select: { unitId: true, id: true, name: true },
        order: { name: 'ASC' },
        skip: 0,
        take: 100,
      });
      expect(result).toEqual({
        items: [{ unitId: 'uuid-1', id: 'cardiac-care', name: 'Cardiac Care' }],
        total: 1,
        page: 1,
        pageSize: 100,
      });
    });

    it('derives skip from the given page and pageSize', async () => {
      findAndCount.mockResolvedValue([[], 0]);

      await repository.findForDropdown({ page: 3, pageSize: 20 });

      expect(findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 40, take: 20 }),
      );
    });

    it('filters by a case-insensitive, trimmed name search when provided', async () => {
      findAndCount.mockResolvedValue([[], 0]);

      await repository.findForDropdown({ search: '  Cardiac  ' });

      expect(findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { name: ILike('%Cardiac%') } }),
      );
    });

    it('omits the name filter when search is blank/undefined', async () => {
      findAndCount.mockResolvedValue([[], 0]);

      await repository.findForDropdown({ search: '   ' });

      expect(findAndCount).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });
  });
});
