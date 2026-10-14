import React from 'react';

interface PageHeaderProps {
  title: string;
  sub_text?: string;
  actionButton?: React.ReactNode;
  /** Shared slot for summary/stat cards, rendered below the title row (e.g. ProgressCard tiles). */
  summaryCards?: React.ReactNode;
  /**
   * Optional content that sits in the header's empty middle band, beside the
   * title — used by the list pages' compact "needing attention" tiles so they
   * don't add a full-width row (and extra scroll) below the header. Drops to
   * its own full-width row below the title on small screens.
   */
  centerContent?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  sub_text,
  actionButton,
  centerContent,
  summaryCards,
}) => {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-[28px] font-semibold text-primary-500 break-words">
            {title}
          </h1>
          <p className="text-xs sm:text-[14px] font-normal text-[#6A7181] break-words">
            {sub_text}
          </p>
        </div>

        {centerContent && (
          <div className="order-last w-full lg:order-none lg:w-auto lg:flex-1 lg:max-w-xl lg:px-2">
            {centerContent}
          </div>
        )}

        {actionButton && <div className="flex-shrink-0">{actionButton}</div>}
      </div>

      {summaryCards && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-4">
          {summaryCards}
        </div>
      )}
    </div>
  );
};
