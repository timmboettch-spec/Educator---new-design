import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Skeleton, SkeletonRows } from '../../../src/components/ui/Skeleton';

const renderInTable = (ui: React.ReactNode) =>
  render(
    <table>
      <tbody>{ui}</tbody>
    </table>
  );

describe('Skeleton', () => {
  it('is a decorative pulsing bar hidden from screen readers', () => {
    const { container } = render(<Skeleton />);
    const bar = container.firstElementChild;
    expect(bar).toHaveAttribute('aria-hidden', 'true');
    expect(bar).toHaveClass('animate-pulse');
  });

  it('lets callers override the default size and shape', () => {
    const { container } = render(
      <Skeleton className="h-7 w-40 rounded-full" />
    );
    const bar = container.firstElementChild;
    expect(bar).toHaveClass('h-7', 'w-40', 'rounded-full');
    expect(bar).not.toHaveClass('h-4', 'w-3/4', 'rounded');
  });
});

describe('SkeletonRows', () => {
  it('renders one table row per placeholder with a cell per column', () => {
    renderInTable(<SkeletonRows rows={3} columns={4} />);
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3);
    rows.forEach((row) => expect(row.querySelectorAll('td')).toHaveLength(4));
  });

  it('announces the label once, not once per row', () => {
    renderInTable(
      <SkeletonRows rows={3} columns={2} label="Loading students…" />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading students…');
  });

  it('has no status region when no label is given', () => {
    renderInTable(<SkeletonRows rows={2} columns={2} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('applies per-column bar and cell classes over the shared ones', () => {
    const { container } = renderInTable(
      <SkeletonRows
        rows={1}
        columns={[{ barClassName: 'w-4' }, { cellClassName: 'px-1' }]}
        rowClassName="border-t"
        cellClassName="px-4 py-5"
      />
    );
    const [first, second] = Array.from(container.querySelectorAll('td'));
    expect(screen.getByRole('row')).toHaveClass('border-t');
    expect(first).toHaveClass('px-4', 'py-5');
    expect(first?.querySelector('[aria-hidden]')).toHaveClass('w-4');
    expect(second).toHaveClass('px-1', 'py-5');
    expect(second).not.toHaveClass('px-4');
  });

  it('renders bare cells for a CSS grid parent in the grid layout', () => {
    const { container } = render(
      <div style={{ display: 'grid' }}>
        <SkeletonRows layout="grid" rows={2} columns={3} />
      </div>
    );
    const grid = container.firstElementChild;
    expect(screen.queryAllByRole('row')).toHaveLength(0);
    expect(grid?.children).toHaveLength(6);
  });
});
