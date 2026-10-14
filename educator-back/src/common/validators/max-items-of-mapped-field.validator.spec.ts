import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { MaxItemsOfMappedField } from './max-items-of-mapped-field.validator';

class SampleDto {
  @MaxItemsOfMappedField({ class: 'classIds', student: 'studentIds' }, 2)
  mode?: unknown;

  classIds?: unknown;

  studentIds?: unknown;
}

async function messagesFor(plain: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(SampleDto, plain));
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('MaxItemsOfMappedField', () => {
  it('passes when the mapped list is within the limit', async () => {
    expect(await messagesFor({ mode: 'class', classIds: ['a', 'b'] })).toEqual([]);
  });

  it('fails when the mapped list is over the limit, naming that list', async () => {
    expect(await messagesFor({ mode: 'class', classIds: ['a', 'b', 'c'] })).toEqual([
      VALIDATION_MSG.ARRAY_MAX_SIZE('classIds', 2),
    ]);
  });

  it('only checks the list the value points at', async () => {
    expect(
      await messagesFor({ mode: 'student', classIds: ['a', 'b', 'c'], studentIds: ['a'] }),
    ).toEqual([]);
  });

  it.each([
    ['an absent list', { mode: 'class' }],
    ['a non-array list', { mode: 'class', classIds: 'a,b,c' }],
    ['a value with no mapped field', { mode: 'school', classIds: ['a', 'b', 'c'] }],
    ['a non-string value', { mode: 5, classIds: ['a', 'b', 'c'] }],
    ['an absent value', { classIds: ['a', 'b', 'c'] }],
  ])('passes for %s', async (_label, plain) => {
    expect(await messagesFor(plain)).toEqual([]);
  });

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'does not resolve the inherited object key %s as a mapped field',
    async (value) => {
      expect(await messagesFor({ mode: value, classIds: ['a', 'b', 'c'] })).toEqual([]);
    },
  );
});
