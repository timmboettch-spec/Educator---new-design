import { ChevronLeft, ChevronRight } from 'lucide-react';
import React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './DropdownMenu';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (itemsPerPage: number) => void;
  itemsPerPageOptions?: number[];
  loading?: boolean;
  hideResultsInfo?: boolean;
  hideItemsPerPage?: boolean;
  className?: string;
  prevLabel?: string;
  nextLabel?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  itemsPerPageOptions = [10, 20, 50, 100],
  loading = false,
  hideResultsInfo = false,
  hideItemsPerPage = false,
  className,
  prevLabel,
  nextLabel,
}) => {
  // Calculate the range of items being displayed
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  // Generate page numbers to display
  const getPageNumbers = (): (number | string)[] => {
    if (totalPages <= 1) return [1];

    // Always show: page 1, last page, current page and its immediate neighbors
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
          result.push('...');
        }
        // gap === 1: consecutive pages, no separator needed
      }
    }

    return result;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div
      className={`flex items-center justify-end p-6 bg-background-pagination border-t border-gray-50 gap-1.5 ${className ?? ''}`}
    >
      {/* Left: Results Info */}
      {!hideResultsInfo && (
        <p className="text-body-sm text-text-secondary font-medium mr-4">
          Results:{' '}
          <span className="text-text-primary font-bold">
            {startItem} - {endItem}
          </span>{' '}
          of <span className="text-text-primary font-bold">{totalItems}</span>
        </p>
      )}

      {/* Pagination Controls */}
      {/* Previous Button */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1 || loading}
        className={
          prevLabel
            ? 'px-3 py-1 text-sm rounded-md bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 transition-all'
            : 'w-10 h-10 flex items-center justify-center rounded-lg bg-background-white border border-gray-200 shadow-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 transition-all'
        }
      >
        {prevLabel ? (
          prevLabel
        ) : (
          <ChevronLeft size={18} className="text-text-secondary" />
        )}
      </button>

      {/* Page Numbers */}
      {pageNumbers.map((page, index) => {
        if (page === '...') {
          return (
            <div
              key={`ellipsis-${index}`}
              className="w-9 h-9 flex items-center justify-center text-text-placeholder font-medium text-[15px]"
            >
              ...
            </div>
          );
        }

        const pageNum = page as number;
        const isActive = pageNum === currentPage;

        return (
          <button
            key={pageNum}
            onClick={() => onPageChange(pageNum)}
            disabled={loading}
            className={`w-8 h-8 flex items-center justify-center rounded-lg text-[15px] font-medium transition-all ${
              isActive
                ? 'bg-primary text-white shadow-md shadow-primary/20'
                : 'bg-background-white border border-gray-200 text-text-secondary hover:bg-gray-50 shadow-sm'
            } disabled:cursor-not-allowed`}
          >
            {pageNum}
          </button>
        );
      })}

      {/* Next Button */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages || loading}
        className={
          nextLabel
            ? 'px-3 py-1 text-sm rounded-md bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 transition-all'
            : 'w-10 h-10 flex items-center justify-center rounded-lg bg-white border border-gray-200 shadow-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 transition-all'
        }
      >
        {nextLabel ? (
          nextLabel
        ) : (
          <ChevronRight size={18} className="text-text-secondary" />
        )}
      </button>

      {/* Items Per Page Dropdown */}
      {!hideItemsPerPage && (
        <div className="flex items-center gap-2 ml-2">
          <span className="text-body-sm text-text-secondary font-medium">
            Records per page:
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-[70px] h-9 px-3 flex items-center justify-between gap-2 rounded-lg bg-background-white border border-gray-200 shadow-sm hover:bg-gray-50 transition-all">
                <span className="text-body-sm font-medium text-text-primary">
                  {itemsPerPage}
                </span>
                <ChevronRight
                  size={14}
                  className="text-text-placeholder rotate-90"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[70px] min-w-[70px]">
              {itemsPerPageOptions.map((option) => (
                <DropdownMenuItem
                  key={option}
                  onClick={() => onItemsPerPageChange(option)}
                  className={`justify-center text-body-sm ${
                    option === itemsPerPage
                      ? 'bg-primary/10 text-primary font-medium'
                      : ''
                  }`}
                >
                  {option}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
};
