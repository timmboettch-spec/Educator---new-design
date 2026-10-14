import { act, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EditableDateCell } from '../../../../src/components/class/simsubtable/EditableDateCell';
import { renderWithProviders } from '../../../../src/test/testUtils';

type CellProps = Parameters<typeof EditableDateCell>[0];

/** Owns the open/closed state the way the table's hook does. */
function Harness({
  onSave = vi.fn(),
  ...props
}: Partial<CellProps> & { onSave?: CellProps['onSave'] }) {
  const [isEditing, setIsEditing] = useState(false);
  return (
    <table>
      <tbody>
        <tr>
          <EditableDateCell
            value="2026-01-20"
            fieldLabel="due date"
            simTitle="Cardiac Care"
            className="date-cell"
            isEditable
            isEditing={isEditing}
            isSaving={false}
            isDisabled={false}
            error={null}
            onEdit={() => setIsEditing(true)}
            onSave={onSave}
            onCancel={() => setIsEditing(false)}
            {...props}
          />
          <td>
            <button type="button">Elsewhere</button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

const dateButton = () =>
  screen.getByRole('button', {
    name: 'Edit due date for Cardiac Care, currently 01-20-2026',
  });
const dateInput = () => screen.getByLabelText('Edit due date for Cardiac Care');

describe('EditableDateCell', () => {
  it('shows the date as a button that opens a focused date input', () => {
    renderWithProviders(<Harness />);
    expect(dateButton()).toHaveTextContent('01-20-2026');
    expect(dateButton()).toHaveAttribute('title', 'Click to edit');

    fireEvent.click(dateButton());

    expect(dateInput()).toHaveFocus();
    expect(dateInput()).toHaveValue('2026-01-20');
  });

  it('reads MM-DD-YYYY dates into the input', () => {
    renderWithProviders(<Harness value="01-20-2026" />);
    fireEvent.click(dateButton());
    expect(dateInput()).toHaveValue('2026-01-20');
  });

  it('saves as soon as a date is picked', () => {
    const onSave = vi.fn();
    renderWithProviders(<Harness onSave={onSave} />);
    fireEvent.click(dateButton());

    fireEvent.change(dateInput(), { target: { value: '2026-01-25' } });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('2026-01-25');
  });

  it('does not save while the calendar is browsed to another month', () => {
    const onSave = vi.fn();
    renderWithProviders(<Harness onSave={onSave} />);
    fireEvent.click(dateButton());

    // Chrome moves the value with the month arrows, firing only `input`.
    fireEvent.input(dateInput(), { target: { value: '2026-02-20' } });
    fireEvent.input(dateInput(), { target: { value: '2026-03-20' } });
    expect(onSave).not.toHaveBeenCalled();

    // Picking a day commits it with `change`.
    fireEvent.change(dateInput(), { target: { value: '2026-03-05' } });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('2026-03-05');
  });

  it('waits for a full year while one is being typed', () => {
    const onSave = vi.fn();
    renderWithProviders(<Harness onSave={onSave} />);
    fireEvent.click(dateButton());

    for (const partial of ['0002-01-25', '0020-01-25', '0202-01-25']) {
      fireEvent.change(dateInput(), { target: { value: partial } });
    }
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(dateInput(), { target: { value: '2026-01-25' } });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('2026-01-25');
  });

  it('puts focus back on the date once a save closes the input', () => {
    function SavingHarness() {
      const [isEditing, setIsEditing] = useState(false);
      return (
        <Harness
          isEditing={isEditing}
          onEdit={() => setIsEditing(true)}
          onSave={() => setIsEditing(false)}
        />
      );
    }
    renderWithProviders(<SavingHarness />);
    fireEvent.click(dateButton());

    fireEvent.change(dateInput(), { target: { value: '2026-01-25' } });

    expect(dateButton()).toHaveFocus();
  });

  it('cancels on Escape and puts focus back on the date', () => {
    const onSave = vi.fn();
    renderWithProviders(<Harness onSave={onSave} />);
    fireEvent.click(dateButton());

    fireEvent.keyDown(dateInput(), { key: 'Escape' });

    expect(
      screen.queryByLabelText('Edit due date for Cardiac Care')
    ).not.toBeInTheDocument();
    expect(dateButton()).toHaveFocus();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('cancels when focus leaves, without pulling focus back', () => {
    renderWithProviders(<Harness />);
    fireEvent.click(dateButton());
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });

    act(() => elsewhere.focus());

    expect(
      screen.queryByLabelText('Edit due date for Cardiac Care')
    ).not.toBeInTheDocument();
    expect(elsewhere).toHaveFocus();
  });

  it('links the error to the input', () => {
    renderWithProviders(
      <Harness isEditing error="Must be on or before the close date." />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Must be on or before the close date.');
    expect(dateInput()).toHaveAttribute('aria-invalid', 'true');
    expect(dateInput()).toHaveAttribute('aria-describedby', alert.id);
  });

  it('holds the input while saving and announces it', () => {
    renderWithProviders(<Harness isEditing isSaving />);

    expect(dateInput()).toHaveAttribute('readonly');
    expect(dateInput()).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Saving…');
  });

  it('is plain text when not editable', () => {
    renderWithProviders(<Harness isEditable={false} />);

    expect(screen.getByText('01-20-2026').tagName).toBe('TD');
    expect(
      screen.queryByRole('button', { name: /Edit due date/ })
    ).not.toBeInTheDocument();
  });

  it('shows a dash for an empty date', () => {
    renderWithProviders(<Harness value="" />);
    expect(
      screen.getByRole('button', { name: /currently -$/ })
    ).toHaveTextContent('-');
  });

  describe('typed dates', () => {
    // Chrome fires `change` after each typed segment: typing 1 then 0 in the
    // day gives the 01st first, then the 10th.
    const typeDigit = (key: string, valueAfter: string) => {
      fireEvent.keyDown(dateInput(), { key });
      fireEvent.change(dateInput(), { target: { value: valueAfter } });
    };

    it("doesn't save while a date is being typed", () => {
      const onSave = vi.fn();
      renderWithProviders(<Harness onSave={onSave} />);
      fireEvent.click(dateButton());

      typeDigit('1', '2026-01-01');
      typeDigit('0', '2026-01-10');

      expect(onSave).not.toHaveBeenCalled();
    });

    it('saves the typed date when leaving the input', () => {
      const onSave = vi.fn();
      renderWithProviders(<Harness onSave={onSave} />);
      fireEvent.click(dateButton());
      typeDigit('1', '2026-01-01');
      typeDigit('0', '2026-01-10');

      fireEvent.blur(dateInput());

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith('2026-01-10');
    });

    it('saves the typed date on Enter', () => {
      const onSave = vi.fn();
      renderWithProviders(<Harness onSave={onSave} />);
      fireEvent.click(dateButton());
      typeDigit('1', '2026-01-01');
      typeDigit('0', '2026-01-10');

      fireEvent.keyDown(dateInput(), { key: 'Enter' });

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith('2026-01-10');
    });

    it('cancels when leaving with the date unchanged or cleared', () => {
      const onSave = vi.fn();
      renderWithProviders(<Harness onSave={onSave} />);

      fireEvent.click(dateButton());
      typeDigit('2', '2026-01-20');
      fireEvent.blur(dateInput());
      expect(
        screen.queryByLabelText('Edit due date for Cardiac Care')
      ).not.toBeInTheDocument();

      fireEvent.click(dateButton());
      fireEvent.keyDown(dateInput(), { key: 'Backspace' });
      fireEvent.change(dateInput(), { target: { value: '' } });
      fireEvent.blur(dateInput());
      expect(
        screen.queryByLabelText('Edit due date for Cardiac Care')
      ).not.toBeInTheDocument();

      expect(onSave).not.toHaveBeenCalled();
    });

    it('saves a calendar pick straight away once the input is clicked again', () => {
      const onSave = vi.fn();
      renderWithProviders(<Harness onSave={onSave} />);
      fireEvent.click(dateButton());
      typeDigit('1', '2026-01-01');

      fireEvent.pointerDown(dateInput());
      fireEvent.change(dateInput(), { target: { value: '2026-01-25' } });

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith('2026-01-25');
    });
  });

  it('does not save a picked date a second time when the input then blurs', () => {
    const onSave = vi.fn();
    renderWithProviders(<Harness onSave={onSave} />);
    fireEvent.click(dateButton());

    fireEvent.change(dateInput(), { target: { value: '2026-01-25' } });
    fireEvent.blur(dateInput());

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  describe('Enter', () => {
    it('cancels when the date was cleared', () => {
      const onSave = vi.fn();
      renderWithProviders(<Harness onSave={onSave} />);
      fireEvent.click(dateButton());
      fireEvent.keyDown(dateInput(), { key: 'Backspace' });
      fireEvent.change(dateInput(), { target: { value: '' } });

      fireEvent.keyDown(dateInput(), { key: 'Enter' });

      expect(onSave).not.toHaveBeenCalled();
      expect(
        screen.queryByLabelText('Edit due date for Cardiac Care')
      ).not.toBeInTheDocument();
    });

    it('cancels when the date is unchanged', () => {
      const onSave = vi.fn();
      renderWithProviders(<Harness onSave={onSave} />);
      fireEvent.click(dateButton());

      fireEvent.keyDown(dateInput(), { key: 'Enter' });

      expect(onSave).not.toHaveBeenCalled();
      expect(
        screen.queryByLabelText('Edit due date for Cardiac Care')
      ).not.toBeInTheDocument();
    });

    it('sends the same date again so a refused save can be retried', () => {
      const onSave = vi.fn();
      renderWithProviders(<Harness onSave={onSave} />);
      fireEvent.click(dateButton());
      fireEvent.keyDown(dateInput(), { key: '5' });
      fireEvent.change(dateInput(), { target: { value: '2026-01-25' } });

      fireEvent.keyDown(dateInput(), { key: 'Enter' });
      fireEvent.keyDown(dateInput(), { key: 'Enter' });

      expect(onSave).toHaveBeenCalledTimes(2);
    });
  });

  it("can't be opened while another date is saving", () => {
    const onEdit = vi.fn();
    renderWithProviders(<Harness isDisabled onEdit={onEdit} />);

    expect(dateButton()).toBeDisabled();
    fireEvent.click(dateButton());
    expect(onEdit).not.toHaveBeenCalled();
  });
});
