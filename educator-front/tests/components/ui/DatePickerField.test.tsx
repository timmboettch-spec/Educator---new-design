import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DatePickerField } from '../../../src/components/ui/DatePickerField';

const renderField = (
  props: Partial<React.ComponentProps<typeof DatePickerField>> = {}
) => {
  const onChange = vi.fn();
  render(
    <DatePickerField
      label="Start Date"
      name="startDate"
      value="2026-09-01"
      onChange={onChange}
      {...props}
    />
  );
  return onChange;
};

/** The native date input, which carries the label. */
const dateInput = () => screen.getByLabelText(/^Start Date/);

describe('DatePickerField', () => {
  it('labels the native date input and shows the date as MM-DD-YYYY', () => {
    renderField();
    expect(dateInput()).toHaveAttribute('type', 'date');
    expect(dateInput()).toHaveValue('2026-09-01');
    expect(dateInput()).toHaveAttribute('aria-required', 'true');
    expect(screen.getByDisplayValue('09-01-2026')).toBeInTheDocument();
  });

  it('passes the min/max bounds and reports the picked date', () => {
    const onChange = renderField({ min: '2026-08-01', max: '2026-12-31' });
    expect(dateInput()).toHaveAttribute('min', '2026-08-01');
    expect(dateInput()).toHaveAttribute('max', '2026-12-31');

    fireEvent.change(dateInput(), { target: { value: '2026-10-15' } });
    expect(onChange).toHaveBeenCalledWith('2026-10-15');
  });

  it('leaves out empty bounds', () => {
    renderField({ min: '', max: '' });
    expect(dateInput()).not.toHaveAttribute('min');
    expect(dateInput()).not.toHaveAttribute('max');
  });

  it('shows the error and links it to the input', () => {
    renderField({ error: 'Start date is required' });
    expect(dateInput()).toHaveAttribute('aria-invalid', 'true');
    expect(dateInput()).toHaveAccessibleDescription('Start date is required');
  });

  it('can be disabled', () => {
    renderField({ disabled: true });
    expect(dateInput()).toBeDisabled();
  });
});
