import dayjs from 'dayjs';
import { describe, it, expect } from 'vitest';
import i18n from '../../src/i18n';
import { getClassFormSchema } from '../../src/schemas/classForm.schema';

const t = i18n.getFixedT('en', 'classManagement');

const today = dayjs().format('YYYY-MM-DD');
const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');
const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');

const validValues = {
  school_id: 'school-1',
  class_name: 'Biology 101',
  status: 'ACTIVE',
  start_date: today,
  end_date: tomorrow,
  total_no_of_students: '',
};

type SchemaOptions = Parameters<typeof getClassFormSchema>[0];

const buildSchema = (overrides: Partial<SchemaOptions> = {}) =>
  getClassFormSchema({
    t,
    modalMode: 'create',
    hasSchools: true,
    ...overrides,
  });

const getErrors = async (
  values: Record<string, unknown>,
  options?: Partial<SchemaOptions>
): Promise<string[]> => {
  try {
    await buildSchema(options).validate(values, { abortEarly: false });
    return [];
  } catch (err) {
    return (err as { errors: string[] }).errors;
  }
};

describe('getClassFormSchema', () => {
  it('accepts valid values', async () => {
    expect(await getErrors(validValues)).toEqual([]);
  });

  describe('school_id', () => {
    it('is required in create mode when the educator has schools', async () => {
      expect(await getErrors({ ...validValues, school_id: '' })).toContain(
        t('form.errors.schoolRequired')
      );
    });

    it('is optional when the educator has no schools', async () => {
      expect(
        await getErrors(
          { ...validValues, school_id: '' },
          { hasSchools: false }
        )
      ).toEqual([]);
    });

    it('is optional in edit mode', async () => {
      expect(
        await getErrors(
          { ...validValues, school_id: '' },
          { modalMode: 'edit' }
        )
      ).toEqual([]);
    });
  });

  describe('class_name', () => {
    it('is required', async () => {
      expect(await getErrors({ ...validValues, class_name: '' })).toContain(
        t('form.errors.classNameRequired')
      );
    });

    it('must be at least 3 characters', async () => {
      expect(await getErrors({ ...validValues, class_name: 'ab' })).toContain(
        t('form.errors.classNameMin')
      );
    });

    it('rejects script-like content', async () => {
      const errors = await getErrors({
        ...validValues,
        class_name: '<script>alert(1)</script>',
      });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('dates', () => {
    it('requires both dates', async () => {
      const errors = await getErrors({
        ...validValues,
        start_date: '',
        end_date: '',
      });
      expect(errors).toContain(t('form.errors.startDateRequired'));
      expect(errors).toContain(t('form.errors.endDateRequired'));
    });

    it('rejects a non YYYY-MM-DD format', async () => {
      expect(
        await getErrors({ ...validValues, start_date: '01-31-2026' })
      ).toContain(t('form.errors.dateFormat'));
    });

    it('rejects a past start date in create mode', async () => {
      expect(
        await getErrors({ ...validValues, start_date: yesterday })
      ).toContain(t('form.errors.startPast'));
    });

    it('allows a past start date in edit mode', async () => {
      expect(
        await getErrors(
          { ...validValues, start_date: yesterday },
          { modalMode: 'edit' }
        )
      ).toEqual([]);
    });

    it('requires the end date to be after the start date', async () => {
      expect(
        await getErrors({
          ...validValues,
          start_date: tomorrow,
          end_date: today,
        })
      ).toContain(t('form.errors.endAfterStart'));
    });
  });

  describe('total_no_of_students', () => {
    it('is optional', async () => {
      expect(await getErrors(validValues)).toEqual([]);
    });

    it('must be a whole number', async () => {
      expect(
        await getErrors({ ...validValues, total_no_of_students: '12a' })
      ).toContain(t('form.errors.studentCountNumeric'));
    });

    it('accepts a number', async () => {
      expect(
        await getErrors({ ...validValues, total_no_of_students: '25' })
      ).toEqual([]);
    });
  });
});
