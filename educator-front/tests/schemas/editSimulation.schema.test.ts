import { describe, expect, it } from 'vitest';
import { ValidationError } from 'yup';
import i18n from '../../src/i18n';
import {
  getEditSimulationSchema,
  type EditSimulationFormValues,
} from '../../src/schemas/editSimulation.schema';

const t = i18n.getFixedT('en', 'classManagement');

// Saved assignment: start 02-01, close 02-28 (2026).
const schema = getEditSimulationSchema({
  t,
  originalStart: '2026-02-01',
  originalClose: '2026-02-28',
});

const valid: EditSimulationFormValues = {
  startDate: '2026-02-01',
  dueDate: '2026-02-15',
  closeDate: '2026-02-28',
};

/** Every message the schema raises for these values (empty when valid). */
const errorsFor = (overrides: Partial<EditSimulationFormValues>): string[] => {
  try {
    schema.validateSync({ ...valid, ...overrides }, { abortEarly: false });
    return [];
  } catch (error) {
    if (error instanceof ValidationError) return error.errors;
    throw error;
  }
};

describe('getEditSimulationSchema', () => {
  it('accepts dates in order within the saved limits', () => {
    expect(errorsFor({})).toEqual([]);
  });

  it('allows the dates to fall on the same day', () => {
    expect(
      errorsFor({
        startDate: '2026-02-10',
        dueDate: '2026-02-10',
        closeDate: '2026-02-10',
      })
    ).toEqual([]);
  });

  it.each([
    ['startDate', 'Start Date is required'],
    ['dueDate', 'Due Date is required'],
    ['closeDate', 'Close Date is required'],
  ] as const)('requires %s', (field, message) => {
    expect(errorsFor({ [field]: '' })).toContain(message);
  });

  it('rejects a value that is not YYYY-MM-DD', () => {
    expect(errorsFor({ dueDate: '02-15-2026' })).toContain(
      'Enter a valid date'
    );
  });

  it("doesn't let the start move earlier than it was saved", () => {
    expect(errorsFor({ startDate: '2026-01-31' })).toContain(
      "Start Date can't be earlier than 02-01-2026"
    );
  });

  it('keeps the start on or before the saved close date', () => {
    expect(
      errorsFor({ startDate: '2026-03-01', dueDate: '', closeDate: '' })
    ).toContain('Start Date must be on or before 02-28-2026');
  });

  it('keeps the due date between the start and close dates', () => {
    expect(errorsFor({ dueDate: '2026-01-31' })).toContain(
      'Due Date must be on or after the Start Date'
    );
    expect(
      errorsFor({ dueDate: '2026-02-20', closeDate: '2026-02-18' })
    ).toContain('Due Date must be on or before the Close Date');
  });

  it('keeps the close date on or after the due date', () => {
    expect(
      errorsFor({ dueDate: '2026-02-20', closeDate: '2026-02-18' })
    ).toContain('Close Date must be on or after the Due Date');
  });

  it("doesn't let the close move later than it was saved", () => {
    expect(errorsFor({ closeDate: '2026-03-01' })).toContain(
      "Close Date can't be later than 02-28-2026"
    );
  });

  it('skips the saved-date limits when the assignment had none', () => {
    const open = getEditSimulationSchema({
      t,
      originalStart: '',
      originalClose: '',
    });
    expect(() =>
      open.validateSync({
        startDate: '2020-01-01',
        dueDate: '2030-01-01',
        closeDate: '2031-01-01',
      })
    ).not.toThrow();
  });
});
