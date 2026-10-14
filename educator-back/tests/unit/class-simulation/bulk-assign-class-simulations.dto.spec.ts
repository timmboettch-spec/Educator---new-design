import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BulkAssignClassSimulationsReqDto } from 'src/class-simulations/dto/bulk-assign-class-simulations.dto';
import { ClassSimulationAssignmentConstants } from 'src/common/constants';
import { createValidationPipe } from 'src/common/pipes/validation.pipe';

const SCHOOL_ID = '43637818-250a-4579-ad73-de15e51a92f8';
const CLASS_A = '4bfcf191-c608-4552-af95-a479209b5e72';
const CLASS_B = '9c1d2e3f-4a5b-4c6d-8e7f-a1b2c3d4e5f6';
const { MAX_CLASSES, MAX_SIMULATIONS } = ClassSimulationAssignmentConstants.BULK;

const validBody = (): Record<string, unknown> => ({
  schoolId: SCHOOL_ID,
  classIds: [CLASS_A, CLASS_B],
  simulationIds: ['sim-001', 'sim-002'],
  startDate: '09-01-2026',
  dueDate: '10-16-2026',
  endDate: '12-15-2026',
});

/** v4 UUIDs differing only in the last block, so arrays of them stay unique. */
const uuid = (n: number): string => `4bfcf191-c608-4552-af95-${n.toString(16).padStart(12, '0')}`;

const errorsFor = async (overrides: Record<string, unknown>): Promise<string[]> => {
  const errors = await validate(
    plainToInstance(BulkAssignClassSimulationsReqDto, { ...validBody(), ...overrides }),
  );
  return errors.map((error) => error.property);
};

describe('BulkAssignClassSimulationsReqDto', () => {
  it('accepts a valid MM-DD-YYYY payload', async () => {
    expect(await errorsFor({})).toEqual([]);
  });

  it('accepts ISO dates, with or without a time part', async () => {
    expect(
      await errorsFor({
        startDate: '2026-09-01',
        dueDate: '2026-10-16T00:00:00.000Z',
        endDate: '2026-12-15',
      }),
    ).toEqual([]);
  });

  it('trims simulation ids', async () => {
    const dto = plainToInstance(BulkAssignClassSimulationsReqDto, {
      ...validBody(),
      simulationIds: ['  sim-001 ', 'sim-002'],
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.simulationIds).toEqual(['sim-001', 'sim-002']);
  });

  it.each(['schoolId', 'classIds', 'simulationIds', 'startDate', 'dueDate', 'endDate'])(
    'requires %s',
    async (field) => {
      const body = validBody();
      delete body[field];
      const errors = await validate(plainToInstance(BulkAssignClassSimulationsReqDto, body));
      expect(errors.map((error) => error.property)).toEqual([field]);
    },
  );

  it.each(['not-a-uuid', '', 123])('rejects schoolId=%p', async (schoolId) => {
    expect(await errorsFor({ schoolId })).toEqual(['schoolId']);
  });

  it.each([
    ['a non-array', CLASS_A],
    ['an empty array', []],
    ['a non-UUID entry', [CLASS_A, 'class-2']],
    ['duplicate ids', [CLASS_A, CLASS_A]],
  ])('rejects classIds as %s', async (_label, classIds) => {
    expect(await errorsFor({ classIds })).toEqual(['classIds']);
  });

  it.each([
    ['a non-array', 'sim-001'],
    ['an empty array', []],
    ['a non-string entry', ['sim-001', 42]],
    ['a blank entry', ['sim-001', '   ']],
    ['duplicate ids (after trimming)', ['sim-001', ' sim-001']],
  ])('rejects simulationIds as %s', async (_label, simulationIds) => {
    expect(await errorsFor({ simulationIds })).toEqual(['simulationIds']);
  });

  it(`accepts exactly ${MAX_CLASSES} classes and rejects ${MAX_CLASSES + 1}`, async () => {
    const ids = Array.from({ length: MAX_CLASSES + 1 }, (_, i) => uuid(i));
    expect(await errorsFor({ classIds: ids.slice(0, MAX_CLASSES), simulationIds: ['s'] })).toEqual(
      [],
    );
    expect(await errorsFor({ classIds: ids, simulationIds: ['s'] })).toEqual(['classIds']);
  });

  it(`accepts exactly ${MAX_SIMULATIONS} simulations and rejects ${MAX_SIMULATIONS + 1}`, async () => {
    const simulationIds = Array.from({ length: MAX_SIMULATIONS + 1 }, (_, i) => `sim-${i}`);
    expect(
      await errorsFor({
        classIds: [CLASS_A],
        simulationIds: simulationIds.slice(0, MAX_SIMULATIONS),
      }),
    ).toEqual([]);
    expect(await errorsFor({ classIds: [CLASS_A], simulationIds })).toEqual(['simulationIds']);
  });

  it('caps a request at 20 classes × 10 simulations (200 pairs)', () => {
    expect(MAX_CLASSES).toBe(20);
    expect(MAX_SIMULATIONS).toBe(10);
  });

  it('accepts the largest request (20 × 10)', async () => {
    const classIds = Array.from({ length: MAX_CLASSES }, (_, i) => uuid(i));
    const simulationIds = Array.from({ length: MAX_SIMULATIONS }, (_, i) => `sim-${i}`);
    expect(await errorsFor({ classIds, simulationIds })).toEqual([]);
  });

  describe('id case (review F1)', () => {
    it('lowercases and trims schoolId and classIds', async () => {
      const dto = plainToInstance(BulkAssignClassSimulationsReqDto, {
        ...validBody(),
        schoolId: ` ${SCHOOL_ID.toUpperCase()} `,
        classIds: [CLASS_A.toUpperCase(), ` ${CLASS_B} `],
      });
      expect(await validate(dto)).toEqual([]);
      expect(dto.schoolId).toBe(SCHOOL_ID);
      expect(dto.classIds).toEqual([CLASS_A, CLASS_B]);
    });

    it('rejects the same class sent in two letter cases as a duplicate', async () => {
      expect(await errorsFor({ classIds: [CLASS_A, CLASS_A.toUpperCase()] })).toEqual(['classIds']);
    });

    it('leaves simulation ids case-sensitive (only trimmed)', async () => {
      const dto = plainToInstance(BulkAssignClassSimulationsReqDto, {
        ...validBody(),
        simulationIds: ['Sim-001', 'sim-001'],
      });
      expect(await validate(dto)).toEqual([]);
      expect(dto.simulationIds).toEqual(['Sim-001', 'sim-001']);
    });
  });

  it.each(['2026/09/01', '9-1-2026', '01-09-26', 'tomorrow', '', 20260901])(
    'rejects startDate=%p',
    async (startDate) => {
      expect(await errorsFor({ startDate })).toEqual(['startDate']);
    },
  );

  it.each(['02-31-2026', '13-01-2026', '2026-02-30', '02-29-2027'])(
    'rejects impossible calendar date %p',
    async (dueDate) => {
      expect(await errorsFor({ dueDate })).toEqual(['dueDate']);
    },
  );

  it('accepts a leap day', async () => {
    expect(
      await errorsFor({ startDate: '02-29-2028', dueDate: '02-29-2028', endDate: '2028-02-29' }),
    ).toEqual([]);
  });

  it('is rejected by the global ValidationPipe when the legacy reduceToken is sent', async () => {
    const pipe = createValidationPipe();
    await expect(
      pipe.transform(
        { ...validBody(), reduceToken: 0 },
        { type: 'body', metatype: BulkAssignClassSimulationsReqDto },
      ),
    ).rejects.toThrow();
  });
});
