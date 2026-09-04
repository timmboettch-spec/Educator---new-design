"use client";

import { ChevronDown, Eye, SquarePen, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import React from "react";

export type Column<T> = {
  header: string | ReactNode;
  accessor?: keyof T;
  render?: (row: T) => React.ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
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
  /** Click anywhere on a data cell (not the Actions cell) to trigger this. */
  onRowClick?: (row: T) => void;
  renderActions?: (row: T) => React.ReactNode;
  renderSubRow?: (row: T) => React.ReactNode;
  rowClassName?: (row: T) => string;
  /** Width of the Actions column in any valid CSS grid track size. Default: "1fr" */
  actionColWidth?: string;
  /**
   * Opt-in grouping: when provided, rows are grouped under a full-width header
   * showing this label. Data must already be ordered so same-group rows are
   * contiguous. Grouping disables internal pagination (all rows render).
   */
  groupBy?: (row: T) => string;
  /** Custom render for the grouped header label (defaults to the raw key). */
  renderGroupHeader?: (groupKey: string) => ReactNode;
};

export default function ListTable<T extends { id?: string | number }>({
  columns,
  data,
  targetRowId,
  loading = false,
  emptyMessage = "No data found.",
  actionHeader = "Actions",
  prevLabel = "Prev",
  nextLabel = "Next",
  onView,
  onEdit,
  onDelete,
  onRowClick,
  renderActions,
  renderSubRow,
  rowClassName,
  actionColWidth = "1fr",
  groupBy,
  renderGroupHeader,
}: Props<T>) {
  const grouped = typeof groupBy === "function";
  const colTemplate = columns.map((col) => col.width ?? "1fr").join(" ");
  const gridTemplate = `${colTemplate} ${actionColWidth}`;
  const [currentPage, setCurrentPage] = useState(1);
  const [hoveredRowId, setHoveredRowId] = useState<string | number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const rowsPerPage = 10;

  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  useEffect(() => {
    setCurrentPage(1);
  }, [data]);

  useEffect(() => {
    if (targetRowId == null || data.length === 0) {
      return;
    }
    const targetId = String(targetRowId);
    const index = data.findIndex((row) => String(row.id ?? "") === targetId);
    if (index === -1) {
      return;
    }
    setCurrentPage(Math.floor(index / rowsPerPage) + 1);
  }, [targetRowId, data]);

  const totalPages = Math.ceil(data.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  // Grouping renders every row (no pagination) so school groups stay intact.
  const rowsToRender = grouped
    ? data
    : data.slice(startIndex, startIndex + rowsPerPage);

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
    for (let i = 0; i < sorted.length; i++) {
      result.push(sorted[i]);
      if (i < sorted.length - 1) {
        const gap = sorted[i + 1] - sorted[i];
        if (gap > 1) {
          result.push("...");
        }
      }
    }

    return result;
  };

  const visiblePages = getVisiblePages();

  const getAlignmentClass = (align?: "left" | "center" | "right") => {
    switch (align) {
      case "center":
        return "flex items-center justify-center";
      case "right":
        return "flex items-center justify-end";
      case "left":
        return "flex items-center justify-start";
      default:
        return "flex items-center justify-start";
    }
  };

  const cellPadding = (index: number) => (index === 0 ? "pl-3 pr-1" : "px-1");

  return (
    <div
      className={`w-full overflow-x-auto ${grouped ? "max-h-[70vh] overflow-y-auto" : ""}`}
    >
      <div
        style={{
          minWidth: `${columns.length * 120 + 100}px`,
          display: "grid",
          gridTemplateColumns: gridTemplate,
        }}
      >
        {/* ── Header row ── */}
        {columns.map((col, index) => (
          <div
            key={`h-${index}`}
            className={`bg-primary-500 text-white py-5 text-sm font-semibold min-w-0 overflow-hidden sticky top-0 z-20 ${index === 0 ? "rounded-l-2xl" : ""} ${cellPadding(index)}`}
          >
            <div className={`${getAlignmentClass(col.align)} min-h-full min-w-0`}>
              {col.header}
            </div>
          </div>
        ))}
        {/* Actions header */}
        <div className="bg-primary-500 text-white py-5 px-1 text-sm font-semibold flex items-center justify-center min-w-0 sticky top-0 z-20 rounded-r-2xl">
          {actionHeader}
        </div>

        {/* ── Loading skeleton rows ── */}
        {loading &&
          Array.from({ length: 5 }).map((_, i) => (
            <React.Fragment key={`sk-${i}`}>
              {columns.map((_, j) => (
                <div
                  key={`sk-${i}-${j}`}
                  className={`py-5 border-b min-w-0 overflow-hidden ${cellPadding(j)}`}
                >
                  <div className="flex items-center justify-start min-h-full">
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                  </div>
                </div>
              ))}
              <div className="py-5 px-1 border-b flex items-center justify-center min-w-0">
                <div className="h-4 bg-gray-200 rounded animate-pulse w-16" />
              </div>
            </React.Fragment>
          ))}

        {/* ── Data rows ── */}
        {!loading &&
          rowsToRender.length > 0 &&
          rowsToRender.map((row, i) => {
            const rowId = row.id ?? i;
            const isHovered = hoveredRowId === rowId;
            const extraClass = rowClassName ? rowClassName(row) : "";
            const rowBg = isHovered ? "bg-gray-100" : "";
            // Evaluate once to avoid calling renderSubRow twice.
            const subRowContent = renderSubRow ? renderSubRow(row) : null;
            // Full-width group header whenever the group key changes. Groups are
            // collapsible; the header sticks below the frozen column header while
            // scrolling so the current school stays visible.
            const groupKey = grouped ? groupBy!(row) : "";
            const isCollapsed = grouped && collapsedGroups.has(groupKey);
            const showGroupHeader =
              grouped &&
              (i === 0 || groupBy!(row) !== groupBy!(rowsToRender[i - 1]));

            return (
              <React.Fragment key={`row-${rowId}`}>
                {showGroupHeader && (
                  <div
                    style={{ gridColumn: "1 / -1" }}
                    className="px-3 py-2 sticky top-[60px] z-10 bg-white"
                  >
                    <button
                      type="button"
                      onClick={() => toggleGroup(groupKey)}
                      aria-expanded={!isCollapsed}
                      className="w-full flex items-center justify-between gap-2 bg-[#e9e9e9] text-[#5f6060] text-sm font-semibold rounded-lg pl-5 pr-4 py-2 text-left hover:bg-[#dcdcdc] transition-colors"
                    >
                      <span className="min-w-0 break-words">
                        {renderGroupHeader ? renderGroupHeader(groupKey) : groupKey}
                      </span>
                      <ChevronDown
                        size={16}
                        className={`shrink-0 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                )}
                {!isCollapsed && (
                  <>
                {/* Data cells */}
                {columns.map((col, index) => (
                  <div
                    key={`r-${rowId}-${index}`}
                    className={`py-5 border-b min-w-0 overflow-hidden transition-colors ${cellPadding(index)} ${rowBg} ${extraClass} ${onRowClick ? "cursor-pointer" : ""}`}
                    onMouseEnter={() => setHoveredRowId(rowId)}
                    onMouseLeave={() => setHoveredRowId(null)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    <div className={`${getAlignmentClass(col.align)} min-h-full min-w-0`}>
                      {col.render ? (
                        col.render(row)
                      ) : (
                        <span
                          style={{ wordBreak: "break-word", overflowWrap: "break-word" }}
                          title={String(row[col.accessor!] ?? "")}
                        >
                          {String(row[col.accessor!] ?? "")}
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
                        aria-label="View"
                        title="View"
                        className="p-1.5 rounded-md text-gray-500 hover:text-primary-500 hover:bg-[#e9e9e9] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                        onClick={() => onView?.(row)}
                      >
                        <Eye size={17} />
                      </button>
                      <button
                        type="button"
                        aria-label="Edit"
                        title="Edit"
                        className="p-1.5 rounded-md text-gray-500 hover:text-primary-500 hover:bg-[#e9e9e9] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                        onClick={() => onEdit?.(row)}
                      >
                        <SquarePen size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete"
                        title="Delete"
                        className="p-1.5 rounded-md text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                        onClick={() => onDelete?.(row)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>

                {/* Expanded sub-row — spans all columns */}
                {subRowContent && (
                  <div style={{ gridColumn: "1 / -1" }}>{subRowContent}</div>
                )}
                  </>
                )}
              </React.Fragment>
            );
          })}

        {/* ── Empty state ── */}
        {!loading && rowsToRender.length === 0 && (
          <div
            style={{ gridColumn: "1 / -1" }}
            className="px-4 py-8 text-center text-sm text-gray-500"
          >
            {emptyMessage}
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {!grouped && data.length > rowsPerPage && (
        <div className="flex flex-wrap justify-end items-center gap-1.5 px-4 py-3">
          <button
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            className="px-2.5 py-1 text-sm border rounded disabled:opacity-50"
            disabled={currentPage === 1}
          >
            {prevLabel}
          </button>
          <div className="flex flex-wrap gap-1.5">
            {visiblePages.map((page, index) =>
              page === "..." ? (
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
                  className={`px-2.5 py-1 text-sm border rounded ${
                    currentPage === page
                      ? "bg-primary-500 text-white border-primary-500"
                      : ""
                  }`}
                >
                  {page}
                </button>
              ),
            )}
          </div>
          <button
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            className="px-2.5 py-1 text-sm border rounded disabled:opacity-50"
            disabled={currentPage === totalPages}
          >
            {nextLabel}
          </button>
        </div>
      )}
    </div>
  );
}
