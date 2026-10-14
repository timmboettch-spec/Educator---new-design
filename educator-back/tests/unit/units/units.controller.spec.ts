import { UnitsController } from '../../../src/units/units.controller';
import { UnitsService } from '../../../src/units/units.service';
import { ICurrentUser } from '../../../src/common/interfaces';
import { ResponseResult } from '../../../src/common/class/response.class';
import { DropdownUnitsReqDto } from '../../../src/units/dto/dropdown-units.dto';

describe('UnitsController', () => {
  let controller: UnitsController;
  const findForDropdown = jest.fn();
  const currentUser = { userId: 'user-1' } as ICurrentUser;

  beforeEach(() => {
    findForDropdown.mockReset();
    controller = new UnitsController({ findForDropdown } as unknown as UnitsService);
  });

  describe('findDropdown', () => {
    it('delegates straight to the service and returns its result unchanged', async () => {
      const dto: DropdownUnitsReqDto = { page: 1, pageSize: 100, search: 'Cardiac' };
      const expected = new ResponseResult({
        message: 'Units fetched successfully',
        data: [{ unitId: 'uuid-1', id: 'cardiac-care', name: 'Cardiac Care' }],
        meta: { total: 1, page: 1, pageSize: 100, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      });
      findForDropdown.mockResolvedValue(expected);

      const result = await controller.findDropdown(currentUser, dto);

      expect(findForDropdown).toHaveBeenCalledWith(currentUser, dto);
      expect(result).toBe(expected);
    });
  });
});
