import React from "react";
import loginEn from "../../../locales/auth/login/en.json";
import loginEs from "../../../locales/auth/login/es.json";

interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

const TablePagination: React.FC<TablePaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
}) => {
  const from = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const to = Math.min(currentPage * itemsPerPage, totalItems);
  const t = (
    localStorage.getItem("app_language")?.toLowerCase() === "es"
      ? loginEs
      : loginEn
  ).simulationLibrary;

  return (
    <div className="flex items-center justify-between px-6 py-4">
      <span className="text-[11px] text-slate-400 uppercase tracking-wide">
        {t.paginationShowing} {from} {t.paginationTo} {to} {t.paginationOf}{" "}
        {totalItems} {t.paginationSimulations}
      </span>

      <div className="flex items-center gap-1">
        {/* Prev */}
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-30 transition-colors"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {(() => {
          const pages: (number | "ellipsis")[] = [];
          for (let i = 1; i <= totalPages; i++) {
            if (
              i === 1 ||
              i === totalPages ||
              (i >= currentPage - 1 && i <= currentPage + 1)
            ) {
              pages.push(i);
            } else if (pages[pages.length - 1] !== "ellipsis") {
              pages.push("ellipsis");
            }
          }
          return pages.map((p, i) =>
            p === "ellipsis" ? (
              <span
                key={`e-${i}`}
                className="w-8 h-8 flex items-center justify-center text-xs text-slate-400"
              >
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-semibold transition-colors ${
                  currentPage === p
                    ? "bg-primary-500 text-white shadow-sm"
                    : "border border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                {p}
              </button>
            ),
          );
        })()}

        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages || totalPages === 0}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-30 transition-colors"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TablePagination;
