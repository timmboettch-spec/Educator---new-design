import { useState } from 'react';
import { useReportSelection } from '@/hooks/useReportSelection';
import { useBulkReportReview } from '@/hooks/useBulkReportReview';
import { SimulationReportSelectorType } from '@/redux/api/reports/reports.types';

interface ReportTableReviewOptions {
  // Paged table: selection spans pages and "mark all" reviews the whole class server-side.
  paged?: boolean;
  // Replaces the default "mark all", e.g. to scope it to one simulation's reports.
  onMarkAll?: (reviewed: boolean) => Promise<boolean>;
}

/**
 * Selection plus bulk review for one report table. Selections are sent as report ids;
 * "mark all" sends every report in the table, or the whole class when the table is paged.
 */
export function useReportTableReview(
  reportIds: string[],
  classId: string,
  { paged = false, onMarkAll }: ReportTableReviewOptions = {}
) {
  const selection = useReportSelection(reportIds, { keepOffscreen: paged });
  const { review, isReviewing } = useBulkReportReview();
  // A custom mark-all runs its own requests; track it so the toolbar stays busy until done.
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const runMarkAll = (
    markAllFn: (reviewed: boolean) => Promise<boolean>,
    reviewed: boolean
  ) => {
    if (isMarkingAll) return;
    setIsMarkingAll(true);
    void markAllFn(reviewed)
      .then((ok) => {
        if (ok) selection.clear();
      })
      .finally(() => setIsMarkingAll(false));
  };

  const mark = async (
    type: SimulationReportSelectorType,
    ids: string[],
    reviewed: boolean
  ) => {
    const ok = await review({
      type,
      ids,
      reviewed,
      classId,
    });
    if (ok) selection.clear();
  };

  return {
    selection,
    isReviewing: isReviewing || isMarkingAll,
    markSelected: (reviewed: boolean) =>
      void mark(
        SimulationReportSelectorType.REPORT,
        selection.selectedIds,
        reviewed
      ),
    markAll: (reviewed: boolean) =>
      onMarkAll
        ? runMarkAll(onMarkAll, reviewed)
        : void (paged
            ? mark(SimulationReportSelectorType.CLASS, [classId], reviewed)
            : mark(SimulationReportSelectorType.REPORT, reportIds, reviewed)),
  };
}
