import { fireEvent, render, screen } from '@testing-library/react';
import { GraduationCap } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { ActivityTileCard } from '../../../src/components/ui/ActivityTileCard';

describe('ActivityTileCard', () => {
  it('renders the label and a locale-formatted value', () => {
    render(
      <ActivityTileCard label="Students" value={1234} icon={GraduationCap} />
    );
    expect(screen.getByText('Students')).toBeInTheDocument();
    expect(screen.getByText((1234).toLocaleString())).toBeInTheDocument();
  });

  it('is not a button without onClick', () => {
    render(
      <ActivityTileCard label="Students" value={3} icon={GraduationCap} />
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is a named button that calls onClick when clickable', () => {
    const onClick = vi.fn();
    render(
      <ActivityTileCard
        label="Active Classes"
        value={5}
        icon={GraduationCap}
        onClick={onClick}
        ariaLabel="Active Classes — view classes"
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Active Classes — view classes' })
    );
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
