import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Accordion } from '../../../src/components/common/Accordion';

describe('Accordion', () => {
  it('renders the bar but not the content while closed', () => {
    render(
      <Accordion title="School: Riverside" isOpen={false} onToggle={vi.fn()}>
        <p>Class list</p>
      </Accordion>
    );
    const bar = screen.getByRole('button', { name: 'School: Riverside' });
    expect(bar).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Class list')).not.toBeInTheDocument();
  });

  it('renders the content, linked to the bar, while open', () => {
    render(
      <Accordion title="School: Riverside" isOpen onToggle={vi.fn()}>
        <p>Class list</p>
      </Accordion>
    );
    const bar = screen.getByRole('button', { name: 'School: Riverside' });
    expect(bar).toHaveAttribute('aria-expanded', 'true');
    const content = screen.getByText('Class list').parentElement;
    expect(bar).toHaveAttribute('aria-controls', content?.id);
  });

  it('puts the bar in a heading, so screen readers can list the sections', () => {
    render(
      <Accordion title="School: Riverside" isOpen={false} onToggle={vi.fn()}>
        <p>Class list</p>
      </Accordion>
    );
    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'School: Riverside',
    });
    expect(heading).toContainElement(
      screen.getByRole('button', { name: 'School: Riverside' })
    );
  });

  it('uses the given heading level', () => {
    render(
      <Accordion
        title="School: Riverside"
        isOpen={false}
        onToggle={vi.fn()}
        headingLevel={3}
      >
        <p>Class list</p>
      </Accordion>
    );
    expect(
      screen.getByRole('heading', { level: 3, name: 'School: Riverside' })
    ).toBeInTheDocument();
  });

  it('announces the open content as a region named after the bar', () => {
    render(
      <Accordion title="School: Riverside" isOpen onToggle={vi.fn()}>
        <p>Class list</p>
      </Accordion>
    );
    expect(
      screen.getByRole('region', { name: 'School: Riverside' })
    ).toHaveTextContent('Class list');
  });

  it('calls onToggle when the bar is clicked', () => {
    const onToggle = vi.fn();
    render(
      <Accordion title="School: Riverside" isOpen={false} onToggle={onToggle}>
        <p>Class list</p>
      </Accordion>
    );
    fireEvent.click(screen.getByRole('button', { name: 'School: Riverside' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
