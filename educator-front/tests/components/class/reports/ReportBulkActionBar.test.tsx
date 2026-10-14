import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../src/test/testUtils';
import { ReportBulkActionBar } from '../../../../src/components/class/reports/ReportBulkActionBar';
import { SelectCheckbox } from '../../../../src/components/class/reports/SelectCheckbox';

const renderBar = (
  props: Partial<Parameters<typeof ReportBulkActionBar>[0]> = {}
) => {
  const onMarkSelected = vi.fn();
  const onMarkAll = vi.fn();
  renderWithProviders(
    <ReportBulkActionBar
      selectedCount={0}
      totalCount={3}
      onMarkSelected={onMarkSelected}
      onMarkAll={onMarkAll}
      {...props}
    />
  );
  return { onMarkSelected, onMarkAll };
};

describe('ReportBulkActionBar', () => {
  it('disables the selection actions until something is selected', () => {
    const { onMarkAll } = renderBar();

    expect(screen.getByText('0 selected')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mark reviewed' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Mark unreviewed' })
    ).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Mark all reviewed' }));
    expect(onMarkAll).toHaveBeenCalledWith(true);
  });

  it('marks the selection reviewed or unreviewed', () => {
    const { onMarkSelected, onMarkAll } = renderBar({ selectedCount: 2 });

    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark unreviewed' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Mark all unreviewed' })
    );

    expect(onMarkSelected.mock.calls).toEqual([[true], [false]]);
    expect(onMarkAll).toHaveBeenCalledWith(false);
  });

  it('disables every action while a review is running', () => {
    renderBar({ selectedCount: 1, busy: true });
    expect(screen.getByRole('toolbar')).toHaveAttribute('aria-busy', 'true');
    screen.getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
  });

  it('is labelled for assistive tech', () => {
    renderBar();
    expect(
      screen.getByRole('toolbar', { name: 'Bulk review actions' })
    ).toBeInTheDocument();
  });
});

describe('SelectCheckbox', () => {
  it('shows the partial state and does not bubble clicks to the row', () => {
    const onRowClick = vi.fn();
    const onChange = vi.fn();
    renderWithProviders(
      <div onClick={onRowClick}>
        <SelectCheckbox
          checked={false}
          indeterminate
          onChange={onChange}
          label="Select all reports"
        />
      </div>
    );

    const box = screen.getByRole('checkbox', { name: 'Select all reports' });
    expect((box as HTMLInputElement).indeterminate).toBe(true);
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalled();
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
