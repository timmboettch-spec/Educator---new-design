import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FilterDropdownReqDto } from 'src/common/dtos/simulation.dto';

const errorsFor = async (query: Record<string, unknown>): Promise<string[]> => {
  const errors = await validate(plainToInstance(FilterDropdownReqDto, query));
  return errors.map((error) => error.property);
};

describe('FilterDropdownReqDto', () => {
  it('applies page 1 and pageSize 100 when nothing is given', async () => {
    const dto = plainToInstance(FilterDropdownReqDto, {});

    expect(await validate(dto)).toEqual([]);
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(100);
    expect(dto.search).toBeUndefined();
  });

  it('accepts a page size up to 500 and refuses more', async () => {
    expect(await errorsFor({ pageSize: '500' })).toEqual([]);
    expect(await errorsFor({ pageSize: '501' })).toEqual(['pageSize']);
  });

  it.each(['0', '-1', 'abc', '1.5', ''])('rejects pageSize=%p', async (pageSize) => {
    expect(await errorsFor({ pageSize })).toEqual(['pageSize']);
  });

  it('keeps the shared page cap of 100000', async () => {
    expect(await errorsFor({ page: '100000' })).toEqual([]);
    expect(await errorsFor({ page: '100001' })).toEqual(['page']);
  });

  it.each([
    ['cardiac', 'cardiac'],
    ['  cardiac   arrest ', 'cardiac arrest'],
    ['50%', '50%'],
  ])('reads search=%p as %p', async (search, expected) => {
    const dto = plainToInstance(FilterDropdownReqDto, { search });

    expect(await validate(dto)).toEqual([]);
    expect(dto.search).toBe(expected);
  });

  it.each(['', '   ', '\t \n'])('treats a blank search (%p) as no search', async (search) => {
    const dto = plainToInstance(FilterDropdownReqDto, { search });

    expect(await validate(dto)).toEqual([]);
    expect(dto.search).toBeUndefined();
  });

  it('accepts 100 characters and refuses 101, measured after collapsing spaces', async () => {
    expect(await errorsFor({ search: 'a'.repeat(100) })).toEqual([]);
    expect(await errorsFor({ search: `  ${'a'.repeat(100)}  ` })).toEqual([]);
    expect(await errorsFor({ search: 'a'.repeat(101) })).toEqual(['search']);
  });

  it('rejects a repeated search parameter', async () => {
    expect(await errorsFor({ search: ['a', 'b'] })).toEqual(['search']);
  });
});
