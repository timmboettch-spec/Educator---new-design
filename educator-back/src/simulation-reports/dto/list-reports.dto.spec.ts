import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListReportsReqDto } from './list-reports.dto';

async function validateQuery(query: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(ListReportsReqDto, query);
  const errors = await validate(dto);
  return errors.map((e) => e.property);
}

describe('ListReportsReqDto validation (RE-192)', () => {
  it('accepts an empty query (every field optional)', async () => {
    expect(await validateQuery({})).toEqual([]);
  });

  it('accepts a fully populated, valid query', async () => {
    const errors = await validateQuery({
      studentIds: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
      classIds: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
      schoolIds: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
      simulationIds: ['cardiac-care-v2'],
      reviewStatus: 'unread',
      sortBy: 'completedAt',
      sortDirection: 'DESC',
      page: 1,
      pageSize: 10,
    });
    expect(errors).toEqual([]);
  });

  it('rejects a non-UUID studentIds entry', async () => {
    expect(await validateQuery({ studentIds: ['not-a-uuid'] })).toContain('studentIds');
  });

  it('rejects an invalid reviewStatus value', async () => {
    expect(await validateQuery({ reviewStatus: 'archived' })).toContain('reviewStatus');
  });

  it('rejects an invalid sortBy value', async () => {
    expect(await validateQuery({ sortBy: 'studentAge' })).toContain('sortBy');
  });

  it('rejects an invalid sortDirection value', async () => {
    expect(await validateQuery({ sortDirection: 'UP' })).toContain('sortDirection');
  });
});
