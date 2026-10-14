import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListMyLibraryReqDto } from 'src/educator-simulations/dto/list-my-library.dto';

const errorsFor = async (query: Record<string, unknown>): Promise<string[]> => {
  const errors = await validate(plainToInstance(ListMyLibraryReqDto, query));
  return errors.map((error) => error.property);
};

describe('ListMyLibraryReqDto', () => {
  it('applies page 1 and pageSize 10 when nothing is given', async () => {
    const dto = plainToInstance(ListMyLibraryReqDto, {});

    expect(await validate(dto)).toEqual([]);
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(10);
  });

  it.each([{ page: '1', pageSize: '1' }, { page: '3', pageSize: '50' }, { page: '100000' }])(
    'accepts %p',
    async (query) => {
      expect(await errorsFor(query)).toEqual([]);
    },
  );

  it.each(['0', '-1', 'abc', '1.5', '', '100001', '1000000000000000000'])(
    'rejects page=%p',
    async (page) => {
      expect(await errorsFor({ page })).toEqual(['page']);
    },
  );

  it.each(['0', '-5', '51', 'abc', '2.5', ''])('rejects pageSize=%p', async (pageSize) => {
    expect(await errorsFor({ pageSize })).toEqual(['pageSize']);
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('reads lite=%s as %p', async (lite, expected) => {
    const dto = plainToInstance(ListMyLibraryReqDto, { lite });

    expect(await validate(dto)).toEqual([]);
    expect(dto.lite).toBe(expected);
  });

  it('leaves lite unset when it is omitted', () => {
    expect(plainToInstance(ListMyLibraryReqDto, {}).lite).toBeUndefined();
  });

  it.each(['abc', '1', '0', 'yes'])('rejects lite=%p', async (lite) => {
    expect(await errorsFor({ lite })).toEqual(['lite']);
  });

  describe('search', () => {
    it.each([
      ['cardiac', 'cardiac'],
      ['  cardiac   arrest ', 'cardiac arrest'],
      ['50%', '50%'],
    ])('reads search=%p as %p', async (search, expected) => {
      const dto = plainToInstance(ListMyLibraryReqDto, { search });

      expect(await validate(dto)).toEqual([]);
      expect(dto.search).toBe(expected);
    });

    it.each(['', '   ', '\t \n'])('treats a blank search (%p) as no search', async (search) => {
      const dto = plainToInstance(ListMyLibraryReqDto, { search });

      expect(await validate(dto)).toEqual([]);
      expect(dto.search).toBeUndefined();
    });

    it('leaves search unset when it is omitted', () => {
      expect(plainToInstance(ListMyLibraryReqDto, {}).search).toBeUndefined();
    });

    it('accepts 100 characters and rejects 101, measured after collapsing spaces', async () => {
      expect(await errorsFor({ search: 'a'.repeat(100) })).toEqual([]);
      expect(await errorsFor({ search: `  ${'a'.repeat(100)}  ` })).toEqual([]);
      expect(await errorsFor({ search: 'a'.repeat(101) })).toEqual(['search']);
    });

    it('rejects a repeated search parameter', async () => {
      expect(await errorsFor({ search: ['a', 'b'] })).toEqual(['search']);
    });
  });

  describe('multi-value filters', () => {
    it.each(['difficulty', 'unitId', 'targetAudience', 'productName'])(
      'reads a single %s as a one-element list',
      async (name) => {
        const dto = plainToInstance(ListMyLibraryReqDto, { [name]: 'Easy' });

        expect(await validate(dto)).toEqual([]);
        expect((dto as unknown as Record<string, unknown>)[name]).toEqual(['Easy']);
      },
    );

    it('keeps a repeated parameter as a list without splitting commas', async () => {
      const dto = plainToInstance(ListMyLibraryReqDto, { unitId: ['a, b', 'c'] });

      expect(await validate(dto)).toEqual([]);
      expect(dto.unitId).toEqual(['a, b', 'c']);
    });

    it.each(['difficulty', 'unitId', 'targetAudience', 'productName', 'modality', 'learnerLevel'])(
      'treats an empty, blank or all-blank %s as no filter',
      async (name) => {
        for (const value of ['', '   ', ['', '  ']]) {
          const dto = plainToInstance(ListMyLibraryReqDto, { [name]: value });

          expect(await validate(dto)).toEqual([]);
          expect((dto as unknown as Record<string, unknown>)[name]).toBeUndefined();
        }
      },
    );

    it.each(['difficulty', 'unitId', 'targetAudience', 'productName'])(
      'drops a blank entry among the values of %s',
      async (name) => {
        const dto = plainToInstance(ListMyLibraryReqDto, { [name]: ['Easy', '', ' '] });

        expect(await validate(dto)).toEqual([]);
        expect((dto as unknown as Record<string, unknown>)[name]).toEqual(['Easy']);
      },
    );

    it.each([
      ['modality', 'Avatar'],
      ['learnerLevel', 'Secondary'],
    ])('drops a blank entry among the values of %s', async (name, value) => {
      const dto = plainToInstance(ListMyLibraryReqDto, { [name]: [value, ''] });

      expect(await validate(dto)).toEqual([]);
      expect((dto as unknown as Record<string, unknown>)[name]).toEqual([value]);
    });

    it.each(['unitId', 'targetAudience', 'productName'])(
      'allows 20 values and refuses 21 for %s',
      async (name) => {
        const values = (n: number): string[] => Array.from({ length: n }, (_, i) => `v${i}`);

        expect(await errorsFor({ [name]: values(20) })).toEqual([]);
        expect(await errorsFor({ [name]: values(21) })).toEqual([name]);
      },
    );

    it.each(['unitId', 'targetAudience', 'productName'])(
      'allows 255 characters and refuses 256 for %s',
      async (name) => {
        expect(await errorsFor({ [name]: 'a'.repeat(255) })).toEqual([]);
        expect(await errorsFor({ [name]: 'a'.repeat(256) })).toEqual([name]);
      },
    );
  });

  describe('difficulty', () => {
    it('accepts Easy, Medium and Hard, alone or together', async () => {
      expect(await errorsFor({ difficulty: 'Easy' })).toEqual([]);
      expect(await errorsFor({ difficulty: ['Easy', 'Medium', 'Hard'] })).toEqual([]);
    });

    it('trims surrounding spaces and reads a repeated value once', async () => {
      const dto = plainToInstance(ListMyLibraryReqDto, { difficulty: [' Easy ', 'Easy', 'Hard'] });

      expect(await validate(dto)).toEqual([]);
      expect(dto.difficulty).toEqual(['Easy', 'Hard']);
    });

    it.each(['easy', 'EASY', 'hard', 'Impossible', 'Very Hard', 'Beginner'])(
      'rejects %p, which is not exactly Easy, Medium or Hard',
      async (value) => {
        expect(await errorsFor({ difficulty: value })).toEqual(['difficulty']);
        expect(await errorsFor({ difficulty: ['Easy', value] })).toEqual(['difficulty']);
      },
    );
  });

  describe('modality', () => {
    it('accepts Avatar and Workstation, alone or together', async () => {
      expect(await errorsFor({ modality: 'Avatar' })).toEqual([]);
      expect(await errorsFor({ modality: ['Avatar', 'Workstation'] })).toEqual([]);
    });

    it('reads a repeated value once instead of refusing it for length', async () => {
      const dto = plainToInstance(ListMyLibraryReqDto, {
        modality: ['Avatar', 'Avatar', 'Avatar'],
      });

      expect(await validate(dto)).toEqual([]);
      expect(dto.modality).toEqual(['Avatar']);
    });

    it('refuses an unknown value among valid ones', async () => {
      expect(await errorsFor({ modality: ['Avatar', 'Workstation', 'Hybrid'] })).toEqual([
        'modality',
      ]);
    });

    it.each(['Hybrid', 'avatar', 'WORKSTATION', 'true'])('refuses %p', async (modality) => {
      expect(await errorsFor({ modality })).toEqual(['modality']);
    });
  });

  describe('learnerLevel', () => {
    it('accepts Secondary and Post-Secondary, alone or together', async () => {
      expect(await errorsFor({ learnerLevel: 'Secondary' })).toEqual([]);
      expect(await errorsFor({ learnerLevel: ['Secondary', 'Post-Secondary'] })).toEqual([]);
    });

    it.each(['secondary', 'Primary', 'Post Secondary', 'POST-SECONDARY'])(
      'refuses %p',
      async (learnerLevel) => {
        expect(await errorsFor({ learnerLevel })).toEqual(['learnerLevel']);
      },
    );
  });
});
