'use client';

import { Eye, SquarePen, Trash2 } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import React from 'react';

import { SkeletonRows } from '../ui/Skeleton';
import { SKELETON_INITIAL_ROW_COUNT } from '../../utils/constants/skeleton';

export type Column<T> = {
  header: string | ReactNode;
  accessor?: keyof T;
  render?: (row: T) => React.ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
  headerClassName?: string;
};

export type Props<T> = {
  columns: Column<T>[];
  data: T[];
  targetRowId?: string | number | null;
  loading?: boolean;
  emptyMessage?: string;
  actionHeader?: string;
  prevLabel?: string;
  nextLabel?: string;
  onView?: (row: T) => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  renderActions?: (row: T) => React.ReactNode;
  renderSubRow?: (row: T) => React.ReactNode;
  rowClassName?: (row: T) => string;
  /** Width of the Actions column in any valid CSS grid track size. Default: "1fr" */
  actionColWidth?: string;
  /** Hides the header row, e.g. when a shared `ListTableHeader` is rendered above several tables. */
  hideHeader?: boolean;
  /** Client-side pagination (10 rows per page). Turn off for server/infinite-loaded data. Default: true */
  paginated?: boolean;
};

const getGridTemplate = <T,>(columns: Column<T>[], actionColWidth: string) =>
  `${columns.map((col) => col.width ?? '1fr').join(' ')} ${actionColWidth}`;

/** The table grid's minimum width, below which it scrolls horizontally. */
export const getMinWidth = <T,>(columns: Column<T>[]) =>
  `${columns.length * 120 + 100}px`;

const getAlignmentClass = (align?: 'left' | 'center' | 'right') => {
  switch (align) {
    case 'center':
      return 'flex items-center justify-center';
    case 'right':
      return 'flex items-center justify-end';
    default:
      return 'flex items-center justify-start';
  }
};

const cellPadding = (index: number) => (index === 0 ? 'pl-3 pr-1' : 'px-1');

type HeaderCellsProps<T> = {
  columns: Column<T>[];
  actionHeader: string;
};

function HeaderCells<T>({ columns, actionHeader }: HeaderCellsProps<T>) {
  return (
    <>
      {columns.map((col, index) => (
        <div
          key={`h-${index}`}
          className={`bg-primary-500 text-white py-5 text-sm font-semibold min-w-0 overflow-hidden sticky top-0 z-20 ${
            index === 0 ? 'rounded-l-2xl' : ''
          } ${cellPadding(index)}`}
        >
          <div className={`${getAlignmentClass(col.align)} min-h-full min-w-0`}>
            {col.header}
          </div>
        </div>
      ))}
      <div className="bg-primary-500 text-white py-5 px-1 text-sm font-semibold flex items-center justify-center min-w-0 sticky top-0 z-20 rounded-r-2xl">
        {actionHeader}
      </div>
    </>
  );
}

export type ListTableHeaderProps<T> = {
  columns: Column<T>[];
  actionHeader?: string;
  actionColWidth?: string;
  className?: string;
};

/**
 * A standalone header row using the same grid as `ListTable`, so one header
 * can sit above several `ListTable hideHeader` bodies and keep columns aligned.
 */
export function ListTableHeader<T>({
  columns,
  actionHeader = 'Actions',
  actionColWidth = '1fr',
  className = '',
}: ListTableHeaderProps<T>) {
  return (
    <div
      className={className}
      style={{
        minWidth: getMinWidth(columns),
        display: 'grid',
        gridTemplateColumns: getGridTemplate(columns, actionColWidth),
      }}
    >
      <HeaderCells columns={columns} actionHeader={actionHeader} />
    </div>
  );
}

export default function ListTable<T extends { id?: string | number }>({
  columns,
  data,
  targetRowId,
  loading = false,
  emptyMessage = 'No data found.',
  actionHeader = 'Actions',
  prevLabel = 'Prev',
  nextLabel = 'Next',
  onView,
  onEdit,
  onDelete,
  renderActions,
  renderSubRow,
  rowClassName,
  actionColWidth = '1fr',
  hideHeader = false,
  paginated = true,
}: Props<T>) {
  const gridTemplate = getGridTemplate(columns, actionColWidth);
  const [currentPage, setCurrentPage] = useState(1);
  const [hoveredRowId, setHoveredRowId] = useState<string | number | null>(
    null
  );
  const rowsPerPage = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [data]);

  useEffect(() => {
    if (!paginated || targetRowId == null || data.length === 0) {
      return;
    }
    const targetId = String(targetRowId);
    const index = data.findIndex((row) => String(row.id ?? '') === targetId);
    if (index === -1) {
      return;
    }
    setCurrentPage(Math.floor(index / rowsPerPage) + 1);
  }, [paginated, targetRowId, data]);

  const totalPages = Math.ceil(data.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const visibleData = paginated
    ? data.slice(startIndex, startIndex + rowsPerPage)
    : data;

  const getVisiblePages = (): (number | string)[] => {
    if (totalPages <= 1) return [1];

    const pageSet = new Set<number>();
    pageSet.add(1);
    pageSet.add(totalPages);
    if (currentPage - 1 >= 1) pageSet.add(currentPage - 1);
    pageSet.add(currentPage);
    if (currentPage + 1 <= totalPages) pageSet.add(currentPage + 1);

    const sorted = Array.from(pageSet).sort((a, b) => a - b);

    const result: (number | string)[] = [];
    sorted.forEach((page, i) => {
      const prev = sorted[i - 1];
      if (prev !== undefined && page - prev > 1) {
        result.push('...');
      }
      result.push(page);
    });

    return result;
  };

  const visiblePages = getVisiblePages();

  return (
    <div className="w-full overflow-x-auto">
      <div
        style={{
          minWidth: getMinWidth(columns),
          display: 'grid',
          gridTemplateColumns: gridTemplate,
        }}
      >
        {/* ── Header row ── */}
        {!hideHeader && (
          <HeaderCells columns={columns} actionHeader={actionHeader} />
        )}

        {/* ── Loading skeleton rows ── */}
        {loading && (
          <SkeletonRows
            layout="grid"
            rows={SKELETON_INITIAL_ROW_COUNT}
            columns={[
              ...columns.map((_, j) => ({
                cellClassName: `justify-start overflow-hidden ${cellPadding(j)}`,
              })),
              { cellClassName: 'justify-center px-1', barClassName: 'w-16' },
            ]}
            cellClassName="py-5 border-b min-w-0 flex items-center"
          />
        )}

        {/* ── Data rows ── */}
        {!loading &&
          visibleData.length > 0 &&
          visibleData.map((row, i) => {
            const rowId = row.id ?? i;
            const isHovered = hoveredRowId === rowId;
            const extraClass = rowClassName ? rowClassName(row) : '';
            const rowBg = isHovered ? 'bg-gray-100' : '';
            // Evaluate once to avoid calling renderSubRow twice.
            const subRowContent = renderSubRow ? renderSubRow(row) : null;

            return (
              <React.Fragment key={`row-${rowId}`}>
                {/* Data cells */}
                {columns.map((col, index) => (
                  <div
                    key={`r-${rowId}-${index}`}
                    className={`py-5 border-b min-w-0 overflow-hidden transition-colors ${cellPadding(index)} ${rowBg} ${extraClass}`}
                    onMouseEnter={() => setHoveredRowId(rowId)}
                    onMouseLeave={() => setHoveredRowId(null)}
                  >
                    <div
                      className={`${getAlignmentClass(col.align)} min-h-full min-w-0`}
                    >
                      {col.render ? (
                        col.render(row)
                      ) : (
                        <span
                          style={{
                            wordBreak: 'break-word',
                            overflowWrap: 'break-word',
                          }}
                          title={String(row[col.accessor!] ?? '')}
                        >
                          {String(row[col.accessor!] ?? '')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {/* Actions cell */}
                <div
                  className={`py-5 px-1 border-b flex items-center justify-center gap-3 shrink-0 min-w-0 transition-colors ${rowBg} ${extraClass}`}
                  onMouseEnter={() => setHoveredRowId(rowId)}
                  onMouseLeave={() => setHoveredRowId(null)}
                >
                  {renderActions ? (
                    renderActions(row)
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-label="view"
                        className="p-1.5 rounded-md text-gray-500 hover:text-primary-500 hover:bg-[#e9e9e9] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1"
                        onClick={() => onView?.(row)}
                      >
                        <Eye size={17} />
                      </button>
                      <button
                        type="button"
                        aria-label="edit"
                        className="p-1.5 rounded-md text-gray-500 hover:text-primary-500 hover:bg-[#e9e9e9] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1"
                        onClick={() => onEdit?.(row)}
                      >
                        <SquarePen size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label="delete"
                        className="p-1.5 rounded-md text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
                        onClick={() => onDelete?.(row)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>

                {/* Expanded sub-row — spans all columns */}
                {subRowContent && (
                  <div style={{ gridColumn: '1 / -1' }}>{subRowContent}</div>
                )}
              </React.Fragment>
            );
          })}

        {/* ── Empty state ── */}
        {!loading && visibleData.length === 0 && (
          <div
            style={{ gridColumn: '1 / -1' }}
            className="px-4 py-8 text-center text-sm text-gray-500"
          >
            {emptyMessage}
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {paginated && data.length > rowsPerPage && (
        <div className="flex flex-wrap justify-end items-center gap-1.5 px-4 py-3">
          <button
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            className="px-2.5 py-1 text-sm border rounded disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1"
            disabled={currentPage === 1}
          >
            {prevLabel}
          </button>
          <div className="flex flex-wrap gap-1.5">
            {visiblePages.map((page, index) =>
              page === '...' ? (
                <span
                  key={index}
                  className="px-1 py-1 text-sm text-gray-500 select-none"
                >
                  ...
                </span>
              ) : (
                <button
                  key={index}
                  onClick={() => setCurrentPage(page as number)}
                  aria-current={currentPage === page ? 'page' : undefined}
                  className={`px-2.5 py-1 text-sm border rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1 ${
                    currentPage === page
                      ? 'bg-primary-500 text-white border-primary-500'
                      : ''
                  }`}
                >
                  {page}
                </button>
              )
            )}
          </div>
          <button
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            className="px-2.5 py-1 text-sm border rounded disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1"
            disabled={currentPage === totalPages}
          >
            {nextLabel}
          </button>
        </div>
      )}
    </div>
  );
}
