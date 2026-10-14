import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SortableHeader from '../../../src/components/common/SortableHeader';

const renderHeader = (
  props: Partial<Parameters<typeof SortableHeader>[0]> = {}
) => {
  const onSort = vi.fn();
  render(
    <SortableHeader
      label="Name"
      field="name"
      sortField={null}
      sortDirection={null}
      onSort={onSort}
      {...props}
    />
  );
  return onSort;
};

describe('SortableHeader', () => {
  it('stays out of the tab order by default, as existing tables expect', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: 'Name' })).toHaveAttribute(
      'tabindex',
      '-1'
    );
  });

  it('can join the tab order and carry its sort state in its name', () => {
    renderHeader({ focusable: true, ariaLabel: 'Name, sorted ascending' });
    const button = screen.getByRole('button', {
      name: 'Name, sorted ascending',
    });
    expect(button).not.toHaveAttribute('tabindex');
  });

  it('sorts by its field when activated', () => {
    const onSort = renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(onSort).toHaveBeenCalledWith('name');
  });
});
