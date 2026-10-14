import { readFilterDropdownPage } from 'src/common/utils/simulation.util';
import { FilterDropdownReqDto } from 'src/common/dtos/simulation.dto';

const makeDto = (o: Partial<FilterDropdownReqDto> = {}): FilterDropdownReqDto =>
  Object.assign(new FilterDropdownReqDto(), o);

describe('readFilterDropdownPage', () => {
  const read = jest.fn();

  beforeEach(() => {
    read.mockReset();
    read.mockResolvedValue({ items: ['a'], total: 1 });
  });

  it('turns page and pageSize into skip and take', async () => {
    await readFilterDropdownPage('edu-1', makeDto({ page: 3, pageSize: 20 }), read);

    expect(read).toHaveBeenCalledWith({
      educatorId: 'edu-1',
      search: undefined,
      skip: 40,
      take: 20,
    });
  });

  it('normalizes the search to lower case with collapsed spaces', async () => {
    await readFilterDropdownPage('edu-1', makeDto({ search: 'Cardiac   ARREST' }), read);

    expect(read).toHaveBeenCalledWith(expect.objectContaining({ search: 'cardiac arrest' }));
  });

  it('passes no search when the request has none', async () => {
    await readFilterDropdownPage('edu-1', makeDto(), read);

    expect(read).toHaveBeenCalledWith(expect.objectContaining({ search: undefined }));
  });

  it('builds the page meta from the total the query reports', async () => {
    read.mockResolvedValue({ items: ['a', 'b'], total: 45 });

    const result = await readFilterDropdownPage('edu-1', makeDto({ page: 3, pageSize: 20 }), read);

    expect(result.items).toEqual(['a', 'b']);
    expect(result.meta).toEqual({
      total: 45,
      page: 3,
      pageSize: 20,
      totalPages: 3,
      hasNextPage: false,
      hasPrevPage: true,
    });
  });

  it('reports an empty page with total 0', async () => {
    read.mockResolvedValue({ items: [], total: 0 });

    const result = await readFilterDropdownPage('edu-1', makeDto({ page: 1, pageSize: 20 }), read);

    expect(result.items).toEqual([]);
    expect(result.meta.total).toBe(0);
    expect(result.meta.hasNextPage).toBe(false);
  });

  it('lets a failing query propagate', async () => {
    read.mockRejectedValue(new Error('db down'));

    await expect(readFilterDropdownPage('edu-1', makeDto(), read)).rejects.toThrow('db down');
  });
});
