import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { ICurrentUser } from 'src/common/interfaces';
import { FilterDropdownReqDto } from 'src/common/dtos/simulation.dto';
import { SimulationService } from 'src/simulation/simulation.service';

const educator = { userId: 'user-1', educatorId: 'edu-1' } as ICurrentUser;
const notAnEducator = { userId: 'user-2' } as ICurrentUser;

const makeDto = (o: Partial<FilterDropdownReqDto> = {}): FilterDropdownReqDto =>
  Object.assign(new FilterDropdownReqDto(), { page: 1, pageSize: 100 }, o);

describe('SimulationService filter dropdowns', () => {
  const simulationV2Repository = {
    findLibraryTargetAudienceDropdownPage: jest.fn(),
    findCatalogueTargetAudienceDropdownPage: jest.fn(),
    findLibraryProductNameDropdownPage: jest.fn(),
    findCatalogueProductNameDropdownPage: jest.fn(),
  };
  let service: SimulationService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new SimulationService(
      {} as never,
      {} as never,
      {} as never,
      simulationV2Repository as never,
      {} as never,
    );
  });

  const cases = [
    ['findLibraryTargetAudienceDropdown', 'findLibraryTargetAudienceDropdownPage'],
    ['findCatalogueTargetAudienceDropdown', 'findCatalogueTargetAudienceDropdownPage'],
    ['findLibraryProductNameDropdown', 'findLibraryProductNameDropdownPage'],
    ['findCatalogueProductNameDropdown', 'findCatalogueProductNameDropdownPage'],
  ] as const;

  describe.each(cases)('%s', (method, repoMethod) => {
    it('returns the values with the page meta', async () => {
      simulationV2Repository[repoMethod].mockResolvedValue({ items: ['A', 'B'], total: 2 });

      const result = await service[method](educator, makeDto());

      expect(result.data).toEqual(['A', 'B']);
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        pageSize: 100,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
    });

    it('reads the token educator, the page offset and the normalized search', async () => {
      simulationV2Repository[repoMethod].mockResolvedValue({ items: [], total: 0 });

      await service[method](educator, makeDto({ page: 2, pageSize: 50, search: 'High  School' }));

      expect(simulationV2Repository[repoMethod]).toHaveBeenCalledWith({
        educatorId: 'edu-1',
        search: 'high school',
        skip: 50,
        take: 50,
      });
    });

    it('refuses a caller that is not an educator without reading anything', async () => {
      await expect(service[method](notAnEducator, makeDto())).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(simulationV2Repository[repoMethod]).not.toHaveBeenCalled();
    });

    it('wraps an unexpected query failure', async () => {
      simulationV2Repository[repoMethod].mockRejectedValue(new Error('db down'));

      await expect(service[method](educator, makeDto())).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });
});
