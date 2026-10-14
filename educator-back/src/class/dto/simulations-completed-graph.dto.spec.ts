import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SimulationsCompletedGraphReqDto } from './simulations-completed-graph.dto';

const uuid = (n: number): string =>
  `3fa85f64-5717-4562-b3fc-2c963f66af${String(n).padStart(2, '0')}`;
const uuids = (count: number): string[] => Array.from({ length: count }, (_, i) => uuid(i));

async function errorsFor(query: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(SimulationsCompletedGraphReqDto, query);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors.map((e) => e.property);
}

describe('SimulationsCompletedGraphReqDto compareBy', () => {
  it('accepts a request without compareBy', async () => {
    expect(await errorsFor({})).toEqual([]);
  });

  it.each(['school', 'class', 'student'])('accepts compareBy=%s', async (level) => {
    expect(await errorsFor({ compareBy: level })).toEqual([]);
  });

  it('rejects an invalid compareBy value', async () => {
    expect(await errorsFor({ compareBy: 'teacher', schoolIds: [uuid(1)] })).toEqual(['compareBy']);
  });

  it('rejects compareBy combined with forSchool', async () => {
    const errors = await errorsFor({ compareBy: 'school', forSchool: uuid(1) });
    expect(errors).toEqual(expect.arrayContaining(['compareBy', 'forSchool']));
  });

  it('rejects compareBy combined with forClass', async () => {
    const errors = await errorsFor({ compareBy: 'class', forClass: uuid(1) });
    expect(errors).toEqual(expect.arrayContaining(['compareBy', 'forClass']));
  });

  it.each([
    ['compareBy', 'school', 'forSchool'],
    ['compareBy', 'class', 'forClass'],
  ])(
    'reports the %s=%s conflict on both sides, so the message is order-independent',
    async (_p, level, other) => {
      const errors = await errorsFor({ compareBy: level, [other]: uuid(1) });
      expect(errors.sort()).toEqual(['compareBy', other].sort());
    },
  );

  it('accepts compareBy with the filters, months and allTime', async () => {
    expect(
      await errorsFor({
        compareBy: 'class',
        classIds: [uuid(1)],
        schoolIds: [uuid(2)],
        studentIds: [uuid(3)],
        months: 6,
      }),
    ).toEqual([]);
    expect(await errorsFor({ compareBy: 'school', schoolIds: [uuid(1)], allTime: true })).toEqual(
      [],
    );
  });

  it('accepts 15 ids and rejects 16 in the list matching compareBy', async () => {
    expect(await errorsFor({ compareBy: 'school', schoolIds: uuids(15) })).toEqual([]);
    expect(await errorsFor({ compareBy: 'school', schoolIds: uuids(16) })).toEqual(['compareBy']);
  });

  it('does not apply the compare cap to a list that does not match compareBy', async () => {
    expect(
      await errorsFor({ compareBy: 'school', schoolIds: [uuid(1)], studentIds: uuids(40) }),
    ).toEqual([]);
  });

  it('does not apply the compare cap when compareBy is absent', async () => {
    expect(await errorsFor({ schoolIds: uuids(16) })).toEqual([]);
  });
});
