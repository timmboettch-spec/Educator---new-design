import { Fragment } from 'react';

import { cn } from '../../lib/utils';

interface SkeletonProps {
  /** Size/shape overrides, e.g. `w-16` or `h-7 w-40 rounded-full`. */
  className?: string;
}

/** A pulsing placeholder bar. Decorative only; announce loading separately. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('h-4 w-3/4 bg-gray-200 rounded animate-pulse', className)}
    />
  );
}

/** How one placeholder column looks, so it can mirror the real cell. */
export interface SkeletonColumn {
  /** Classes for the bar (shape/width/alignment). */
  barClassName?: string;
  /** Classes for the cell, merged over the shared `cellClassName`. */
  cellClassName?: string;
}

interface SkeletonRowsProps {
  rows: number;
  /** A column count (all alike), or one entry per column. */
  columns: number | SkeletonColumn[];
  /**
   * `table` renders `<tr>`/`<td>` for a `<tbody>`; `grid` renders bare cells
   * for a CSS grid parent that already defines the column tracks.
   */
  layout?: 'table' | 'grid';
  /** Screen-reader text announced once while the rows are shown. */
  label?: string;
  /** `table` layout only; a grid row has no element of its own. */
  rowClassName?: string;
  /** Classes shared by every cell (padding, borders). */
  cellClassName?: string;
}

/**
 * Placeholder rows shown while a table's data loads. Pass per-column shapes
 * so the placeholders line up with the real cells.
 */
export function SkeletonRows({
  rows,
  columns,
  layout = 'table',
  label,
  rowClassName,
  cellClassName,
}: SkeletonRowsProps) {
  const columnList: SkeletonColumn[] =
    typeof columns === 'number'
      ? Array.from({ length: columns }, () => ({}))
      : columns;
  const Cell = layout === 'table' ? 'td' : 'div';

  const renderCells = (rowIndex: number) =>
    columnList.map((column, j) => (
      <Cell key={j} className={cn(cellClassName, column.cellClassName)}>
        {label && rowIndex === 0 && j === 0 && (
          <span role="status" className="sr-only">
            {label}
          </span>
        )}
        <Skeleton className={column.barClassName} />
      </Cell>
    ));

  return (
    <>
      {Array.from({ length: rows }, (_, i) =>
        layout === 'table' ? (
          <tr key={`skeleton-${i}`} className={rowClassName}>
            {renderCells(i)}
          </tr>
        ) : (
          <Fragment key={`skeleton-${i}`}>{renderCells(i)}</Fragment>
        )
      )}
    </>
  );
}
