import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import { ValidationError } from 'yup';
import i18n from '../../src/i18n';
import {
  getAssignSimulationsSchema,
  type AssignSimulationsFormValues,
} from '../../src/schemas/assignSimulations.schema';

const schema = getAssignSimulationsSchema(
  i18n.getFixedT('en', 'simulationAssignment')
);

const iso = (days: number) => dayjs().add(days, 'day').format('YYYY-MM-DD');

const valid: AssignSimulationsFormValues = {
  schoolId: 'school-1',
  classIds: ['class-1'],
  simulationIds: ['colostomy-care'],
  startDate: iso(1),
  dueDate: iso(10),
  endDate: iso(30),
};

/** Every message the schema raises for these values (empty when valid). */
const errorsFor = (
  overrides: Partial<AssignSimulationsFormValues>
): string[] => {
  try {
    schema.validateSync({ ...valid, ...overrides }, { abortEarly: false });
    return [];
  } catch (error) {
    if (error instanceof ValidationError) return error.errors;
    throw error;
  }
};

describe('assignSimulations schema', () => {
  it('accepts a complete assignment, including start = due = end = today', () => {
    expect(errorsFor({})).toEqual([]);
    expect(
      errorsFor({ startDate: iso(0), dueDate: iso(0), endDate: iso(0) })
    ).toEqual([]);
  });

  it('requires a school, a class, a simulation and all three dates', () => {
    expect(
      errorsFor({
        schoolId: '',
        classIds: [],
        simulationIds: [],
        startDate: '',
        dueDate: '',
        endDate: '',
      })
    ).toEqual([
      'Please select a school.',
      'Class is required',
      'Simulation Name is required',
      'Start date is required',
      'Due date is required',
      'End date is required',
    ]);
  });

  it('caps classes and simulations at the BE limits', () => {
    expect(
      errorsFor({
        classIds: Array.from({ length: 21 }, (_, i) => `c${i}`),
        simulationIds: Array.from({ length: 11 }, (_, i) => `s${i}`),
      })
    ).toEqual([
      'You can select up to 20 classes',
      'You can select up to 10 simulations',
    ]);
  });

  it('rejects a start date before today', () => {
    expect(errorsFor({ startDate: iso(-1) })).toEqual([
      "Start date can't be before today",
    ]);
  });

  it('keeps the due date between start and end', () => {
    expect(errorsFor({ dueDate: iso(0) })).toEqual([
      'Due date must be between Start and End date',
    ]);
    expect(errorsFor({ dueDate: iso(31) })).toEqual([
      'Due date must be between Start and End date',
    ]);
  });

  it('rejects an end date before the start date', () => {
    expect(errorsFor({ dueDate: iso(1), endDate: iso(0) })).toContain(
      "End date can't be before the start date"
    );
  });

  it('rejects a date that does not exist, with only that message', () => {
    const year = dayjs().year() + 1;
    expect(errorsFor({ dueDate: `${year}-02-31` })).toEqual([
      'Enter a valid date',
    ]);
    expect(errorsFor({ startDate: `${year}-13-01` })).toEqual([
      'Enter a valid date',
    ]);
  });

  it('rejects text that is not a YYYY-MM-DD date', () => {
    expect(errorsFor({ endDate: '12-15-2026' })).toContain(
      'Enter a valid date'
    );
  });
});
