import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SimsTableHeader } from '../../../../src/components/class/simsubtable/SimsTableHeader';
import { ClassSimulationSortField } from '../../../../src/redux/api/classSimulations/classSimulations.types';
import { renderWithProviders } from '../../../../src/test/testUtils';

const renderHeader = (
  props: Partial<Parameters<typeof SimsTableHeader>[0]> = {}
) => {
  const onSort = vi.fn();
  renderWithProviders(
    <table>
      <SimsTableHeader
        sortKey={null}
        sortDir={null}
        onSort={onSort}
        {...props}
      />
    </table>
  );
  return { onSort };
};

describe('SimsTableHeader', () => {
  it('sorts from the keyboard with a native button per sortable column', () => {
    const { onSort } = renderHeader();
    const button = screen.getByRole('button', { name: /Start Date/ });

    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(onSort).toHaveBeenCalledWith(ClassSimulationSortField.START_DATE);
    // Sim name, the three dates, started, completed and average.
    expect(screen.getAllByRole('button')).toHaveLength(7);
  });

  it('exposes the current sort direction with aria-sort', () => {
    renderHeader({
      sortKey: ClassSimulationSortField.DUE_DATE,
      sortDir: 'desc',
    });
    expect(
      screen.getByRole('columnheader', { name: /Due Date/ })
    ).toHaveAttribute('aria-sort', 'descending');
    expect(
      screen.getByRole('columnheader', { name: /Start Date/ })
    ).toHaveAttribute('aria-sort', 'none');
    expect(
      screen.getByRole('button', { name: 'Due Date, sorted descending' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Start Date, not sorted' })
    ).toBeInTheDocument();
  });

  it('sorts the count columns by their API field', () => {
    const { onSort } = renderHeader();
    fireEvent.click(screen.getByRole('button', { name: /Started/ }));
    fireEvent.click(screen.getByRole('button', { name: /Completed/ }));
    fireEvent.click(screen.getByRole('button', { name: /Average/ }));
    expect(onSort.mock.calls).toEqual([
      [ClassSimulationSortField.STARTED_COUNT],
      [ClassSimulationSortField.COMPLETED_COUNT],
      [ClassSimulationSortField.AVERAGE_SCORE],
    ]);
  });

  it('does not make the non-sortable columns interactive', () => {
    renderHeader();
    expect(
      screen.getByRole('columnheader', { name: 'Assignment Status' })
    ).not.toHaveAttribute('aria-sort');
    expect(
      screen.queryByRole('button', { name: /Assignment Status/ })
    ).not.toBeInTheDocument();
  });

  it('keeps the sim name header fixed while the table scrolls sideways', () => {
    renderHeader();
    expect(screen.getByRole('columnheader', { name: /Sim Name/ })).toHaveClass(
      'sticky',
      'left-0'
    );
  });
});
