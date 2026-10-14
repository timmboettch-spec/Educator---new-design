import { describe, expect, it } from 'vitest';
import i18n from '../../src/i18n';
import type { SimDateField } from '../../src/redux/api/classSimulations/classSimulationsService';
import { getSimDateEditSchema } from '../../src/schemas/simDateEdit.schema';

const t = i18n.getFixedT('en', 'classManagement');

// start 02-01, due 02-15, close 02-28 (2026)
const sim = {
  start_date: '2026-02-01',
  due_date: '2026-02-15',
  end_date: '2026-02-28',
};

const errorFor = (
  field: SimDateField,
  value: string,
  row: Partial<typeof sim> = {}
): string | null => {
  try {
    getSimDateEditSchema({ t, field, sim: { ...sim, ...row } }).validateSync(
      value
    );
    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

describe('getSimDateEditSchema', () => {
  it.each(['start_date', 'due_date', 'end_date'] as const)(
    'requires a %s',
    (field) => {
      expect(errorFor(field, '')).toBe('Enter a date.');
    }
  );

  it('rejects a date that is not a real calendar date', () => {
    expect(errorFor('due_date', '2026-02-31')).toBe('Enter a valid date.');
  });

  describe('start date', () => {
    it('accepts its own day up to the due date', () => {
      expect(errorFor('start_date', '2026-02-01')).toBeNull();
      expect(errorFor('start_date', '2026-02-15')).toBeNull();
    });

    it("can't move earlier than it is", () => {
      expect(errorFor('start_date', '2026-01-31')).toBe(
        "Can't be earlier than 02-01-2026."
      );
    });

    it('must be on or before the due date', () => {
      expect(errorFor('start_date', '2026-02-16')).toBe(
        'Must be on or before the due date (02-15-2026).'
      );
    });

    it('must be on or before the close date when there is no due date', () => {
      expect(errorFor('start_date', '2026-03-01', { due_date: '' })).toBe(
        'Must be on or before the close date (02-28-2026).'
      );
    });
  });

  describe('due date', () => {
    it('accepts the start and close days themselves', () => {
      expect(errorFor('due_date', '2026-02-01')).toBeNull();
      expect(errorFor('due_date', '2026-02-28')).toBeNull();
    });

    it('must be on or after the start date', () => {
      expect(errorFor('due_date', '2026-01-31')).toBe(
        'Must be on or after the start date (02-01-2026).'
      );
    });

    it('must be on or before the close date', () => {
      expect(errorFor('due_date', '2026-03-01')).toBe(
        'Must be on or before the close date (02-28-2026).'
      );
    });
  });

  describe('close date', () => {
    it('accepts the due day up to its own day', () => {
      expect(errorFor('end_date', '2026-02-15')).toBeNull();
      expect(errorFor('end_date', '2026-02-28')).toBeNull();
    });

    it('must be on or after the due date', () => {
      expect(errorFor('end_date', '2026-02-14')).toBe(
        'Must be on or after the due date (02-15-2026).'
      );
    });

    it('falls back to the start date when there is no due date', () => {
      expect(errorFor('end_date', '2026-02-02', { due_date: '' })).toBeNull();
      expect(errorFor('end_date', '2026-01-31', { due_date: '' })).toBe(
        'Must be on or after the start date (02-01-2026).'
      );
    });

    it("can't move later than it is", () => {
      expect(errorFor('end_date', '2026-03-01')).toBe(
        "Can't be later than 02-28-2026."
      );
    });
  });

  it('skips limits the row has no date for', () => {
    expect(
      errorFor('due_date', '2030-01-01', { start_date: '', end_date: '' })
    ).toBeNull();
  });

  it('reads MM-DD-YYYY row dates', () => {
    const legacy = {
      start_date: '02-01-2026',
      due_date: '02-15-2026',
      end_date: '02-28-2026',
    };
    expect(errorFor('due_date', '2026-02-10', legacy)).toBeNull();
    expect(errorFor('due_date', '2026-03-01', legacy)).toBe(
      'Must be on or before the close date (02-28-2026).'
    );
  });

  it('shows Spanish messages', () => {
    const tEs = i18n.getFixedT('es', 'classManagement');
    expect(() =>
      getSimDateEditSchema({ t: tEs, field: 'due_date', sim }).validateSync('')
    ).toThrow('Introduce una fecha.');
  });
});
