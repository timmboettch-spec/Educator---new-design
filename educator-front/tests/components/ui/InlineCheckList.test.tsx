import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InlineCheckList } from '@/components/ui/InlineCheckList';

const OPTIONS = [
  { value: 'a', label: 'Avatar Secondary' },
  { value: 'b', label: 'Avatar Post-Secondary' },
  { value: 'c', label: 'Workstation Secondary' },
];

const Harness = ({
  initial = [],
  onChange = vi.fn(),
}: {
  initial?: string[];
  onChange?: (values: string[]) => void;
}) => {
  const [values, setValues] = useState(initial);
  return (
    <InlineCheckList
      legend="Products"
      options={OPTIONS}
      values={values}
      onChange={(next) => {
        setValues(next);
        onChange(next);
      }}
      searchPlaceholder="Search…"
      selectAllLabel="Select all"
      clearAllLabel="Clear all"
      noMatchesLabel="No matches"
    />
  );
};

describe('InlineCheckList', () => {
  it('toggles an option', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const box = screen.getByRole('checkbox', { name: 'Avatar Secondary' });
    await user.click(box);
    expect(box).toBeChecked();
    await user.click(box);
    expect(box).not.toBeChecked();
  });

  it('filters by search and selects or clears only the matches', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={['c']} onChange={onChange} />);

    await user.type(
      screen.getByRole('searchbox', { name: 'Search…' }),
      'avatar'
    );
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(onChange).toHaveBeenLastCalledWith(['c', 'a', 'b']);

    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onChange).toHaveBeenLastCalledWith(['c']);
  });

  it('says when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole('searchbox', { name: 'Search…' }), 'zzz');
    expect(screen.getByText('No matches')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select all' })).toBeDisabled();
  });
});
