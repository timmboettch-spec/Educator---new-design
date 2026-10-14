import { act, renderHook } from '@testing-library/react';
import { useFormik } from 'formik';
import { describe, expect, it } from 'vitest';
import { useDateRangeFields } from '../../../src/hooks/useDateRangeFields';

interface Dates {
  startDate: string;
  dueDate: string;
  endDate: string;
}

const ORDER = ['startDate', 'dueDate', 'endDate'] as const;

const renderDates = (initialValues: Dates) =>
  renderHook(() => {
    const formik = useFormik<Dates>({
      initialValues,
      validate: (values) => (values.dueDate ? {} : { dueDate: 'Required' }),
      onSubmit: () => {},
    });
    return { formik, ...useDateRangeFields(formik, ORDER) };
  });

const pick = (
  result: ReturnType<typeof renderDates>['result'],
  name: keyof Dates,
  value: string
) => act(() => result.current.dateFieldProps(name).onChange(value));

describe('useDateRangeFields', () => {
  it('exposes the field name and current value', () => {
    const { result } = renderDates({
      startDate: '2026-10-01',
      dueDate: '',
      endDate: '',
    });
    expect(result.current.dateFieldProps('startDate')).toMatchObject({
      name: 'startDate',
      value: '2026-10-01',
      error: undefined,
    });
  });

  it('sets the picked date and marks only it touched', async () => {
    const { result } = renderDates({ startDate: '', dueDate: '', endDate: '' });
    await pick(result, 'startDate', '2026-10-05');
    expect(result.current.formik.values.startDate).toBe('2026-10-05');
    expect(result.current.formik.touched).toEqual({ startDate: true });
  });

  it('clears later dates that a new start passes', async () => {
    const { result } = renderDates({
      startDate: '2026-10-01',
      dueDate: '2026-10-05',
      endDate: '2026-10-10',
    });
    await pick(result, 'startDate', '2026-10-07');
    expect(result.current.formik.values).toEqual({
      startDate: '2026-10-07',
      dueDate: '',
      endDate: '2026-10-10',
    });
    expect(result.current.formik.touched).toEqual({
      startDate: true,
      dueDate: true,
    });
  });

  it('clears the end date when the due date moves past it', async () => {
    const { result } = renderDates({
      startDate: '2026-10-01',
      dueDate: '2026-10-05',
      endDate: '2026-10-10',
    });
    await pick(result, 'dueDate', '2026-10-12');
    expect(result.current.formik.values.endDate).toBe('');
  });

  it('clears the due date when the end date moves before it', async () => {
    const { result } = renderDates({
      startDate: '2026-10-01',
      dueDate: '2026-10-05',
      endDate: '2026-10-10',
    });
    await pick(result, 'endDate', '2026-10-03');
    expect(result.current.formik.values).toEqual({
      startDate: '2026-10-01',
      dueDate: '',
      endDate: '2026-10-03',
    });
  });

  it.each(['startDate', 'dueDate', 'endDate'] as const)(
    'clearing %s leaves the other dates as they are',
    async (name) => {
      const dates = {
        startDate: '2026-10-01',
        dueDate: '2026-10-05',
        endDate: '2026-10-10',
      };
      const { result } = renderDates(dates);
      await pick(result, name, '');
      expect(result.current.formik.values).toEqual({ ...dates, [name]: '' });
      expect(result.current.formik.touched).toEqual({ [name]: true });
    }
  );

  it('shows a field error only once it is touched or the form is submitted', async () => {
    const { result } = renderDates({ startDate: '', dueDate: '', endDate: '' });
    await act(() => result.current.formik.validateForm());
    expect(result.current.dateFieldProps('dueDate').error).toBeUndefined();

    await act(() => result.current.formik.submitForm());
    expect(result.current.dateFieldProps('dueDate').error).toBe('Required');
  });
});
