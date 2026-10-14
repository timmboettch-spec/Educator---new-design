import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListClassSimulationsReqDto } from 'src/class-simulations/dto/list-class-simulations.dto';
import { ClassSimulationSortField } from 'src/common/constants';

const CLASS_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

const errorsFor = async (query: Record<string, unknown>): Promise<string[]> => {
  const errors = await validate(
    plainToInstance(ListClassSimulationsReqDto, { classId: CLASS_ID, ...query }),
  );
  return errors.map((error) => error.property);
};

describe('ListClassSimulationsReqDto', () => {
  it('accepts just a classId and applies the pagination defaults', async () => {
    const dto = plainToInstance(ListClassSimulationsReqDto, { classId: CLASS_ID });
    expect(await validate(dto)).toEqual([]);
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(10);
    expect(dto.sortBy).toBeUndefined();
    expect(dto.sortDir).toBeUndefined();
  });

  it('requires classId', async () => {
    const errors = await validate(plainToInstance(ListClassSimulationsReqDto, {}));
    expect(errors.map((error) => error.property)).toEqual(['classId']);
  });

  it.each(['not-a-uuid', '', '123'])('rejects classId=%p', async (classId) => {
    expect(await errorsFor({ classId })).toEqual(['classId']);
  });

  it.each(Object.values(ClassSimulationSortField))('accepts sortBy=%s', async (sortBy) => {
    expect(await errorsFor({ sortBy })).toEqual([]);
  });

  it.each(['asc', 'desc'])('accepts sortDir=%s', async (sortDir) => {
    expect(await errorsFor({ sortDir })).toEqual([]);
  });

  it('accepts sortDir without sortBy (it applies to the default simName sort)', async () => {
    expect(await errorsFor({ sortDir: 'desc' })).toEqual([]);
  });

  it.each(['assignmentStatus', 'sim_name', 'SIMNAME', ''])('rejects sortBy=%p', async (sortBy) => {
    expect(await errorsFor({ sortBy })).toEqual(['sortBy']);
  });

  it.each(['up', 'ASC', 'DESC', ''])('rejects sortDir=%p', async (sortDir) => {
    expect(await errorsFor({ sortDir })).toEqual(['sortDir']);
  });

  it('accepts the pagination boundaries page=1, pageSize=1 and pageSize=50', async () => {
    expect(await errorsFor({ page: '1', pageSize: '1' })).toEqual([]);
    expect(await errorsFor({ page: '1', pageSize: '50' })).toEqual([]);
  });

  it.each([['0'], ['-1'], ['1.5'], ['abc']])('rejects page=%p', async (page) => {
    expect(await errorsFor({ page })).toEqual(['page']);
  });

  it.each([['0'], ['51'], ['2.5'], ['abc']])('rejects pageSize=%p', async (pageSize) => {
    expect(await errorsFor({ pageSize })).toEqual(['pageSize']);
  });
});
