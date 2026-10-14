import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { ICurrentUser } from 'src/common/interfaces';
import { FilterDropdownReqDto } from 'src/common/dtos/simulation.dto';
import { UnitsService } from 'src/units/units.service';

const educator = { userId: 'user-1', educatorId: 'edu-1' } as ICurrentUser;
const notAnEducator = { userId: 'user-2' } as ICurrentUser;

const makeDto = (o: Partial<FilterDropdownReqDto> = {}): FilterDropdownReqDto =>
  Object.assign(new FilterDropdownReqDto(), { page: 1, pageSize: 100 }, o);

describe('UnitsService scope dropdowns', () => {
  const unitRepository = {
    findLibraryDropdownPage: jest.fn(),
    findCatalogueDropdownPage: jest.fn(),
  };
  let service: UnitsService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new UnitsService(unitRepository as never, {} as never);
  });

  const cases = [
    ['findLibraryDropdown', 'findLibraryDropdownPage'],
    ['findCatalogueDropdown', 'findCatalogueDropdownPage'],
  ] as const;

  describe.each(cases)('%s', (method, repoMethod) => {
    it('returns the units with the page meta', async () => {
      const items = [{ id: 'adult-health', name: 'Adult Health' }];
      unitRepository[repoMethod].mockResolvedValue({ items, total: 1 });

      const result = await service[method](educator, makeDto());

      expect(result.data).toEqual(items);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        pageSize: 100,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
    });

    it('reads the token educator, the page offset and the normalized search', async () => {
      unitRepository[repoMethod].mockResolvedValue({ items: [], total: 0 });

      await service[method](
        educator,
        makeDto({ page: 3, pageSize: 25, search: ' Adult   HEALTH ' }),
      );

      expect(unitRepository[repoMethod]).toHaveBeenCalledWith({
        educatorId: 'edu-1',
        search: 'adult health',
        skip: 50,
        take: 25,
      });
    });

    it('refuses a caller that is not an educator without reading anything', async () => {
      await expect(service[method](notAnEducator, makeDto())).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(unitRepository[repoMethod]).not.toHaveBeenCalled();
    });

    it('wraps an unexpected query failure', async () => {
      unitRepository[repoMethod].mockRejectedValue(new Error('db down'));

      await expect(service[method](educator, makeDto())).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });
});
