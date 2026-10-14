import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListClassesReqDto } from './classes.dto';

async function errorsFor(query: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(ListClassesReqDto, query);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors.map((e) => e.property);
}

describe('ListClassesReqDto endDateFrom', () => {
  it('accepts a request without endDateFrom', async () => {
    expect(await errorsFor({})).toEqual([]);
  });

  it('accepts a calendar date', async () => {
    expect(await errorsFor({ endDateFrom: '2026-06-15' })).toEqual([]);
  });

  it('accepts a leap day', async () => {
    expect(await errorsFor({ endDateFrom: '2028-02-29' })).toEqual([]);
  });

  it.each([
    'not-a-date',
    '2026-13-45',
    '15/06/2026',
    '',
    // Pass `IsDateString` but are not a plain calendar date, or do not exist:
    '2026-02-31',
    '2026-02-29',
    '2026-04-31',
    '2026-06-15T10:00:00Z',
    '20260615',
    '2026-W24-1',
    '2026-166',
    '2026-6-15',
  ])('rejects %p as an invalid endDateFrom', async (value) => {
    expect(await errorsFor({ endDateFrom: value })).toEqual(['endDateFrom']);
  });
});
