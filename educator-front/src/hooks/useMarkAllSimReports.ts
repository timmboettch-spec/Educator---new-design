import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/common/Toast';
import { useLazyGetReportsQuery } from '@/redux/api/reports/reportsApi';
import { SimulationReportSelectorType } from '@/redux/api/reports/reports.types';
import {
  buildListReportsParams,
  getApiErrorMessage,
} from '@/redux/api/reports/reportsService';
import { useBulkReportReview } from './useBulkReportReview';

// The list API rejects pageSize > 50; larger classes are walked page by page.
const ID_PAGE_SIZE = 50;

/**
 * "Mark all reports reviewed / unreviewed" for one simulation in one class.
 * Bulk review by SIMULATION id has no class filter and would hit every class the sim is
 * assigned to, so this collects the class's report ids from the list API and reviews those.
 */
export function useMarkAllSimReports() {
  const { t } = useTranslation('classManagement');
  const [fetchReports] = useLazyGetReportsQuery();
  const { review, isReviewing } = useBulkReportReview();
  const [isCollecting, setIsCollecting] = useState(false);

  const collectReportIds = async (classId: string, simulationId: string) => {
    const ids: string[] = [];
    let page = 1;
    let hasNextPage = true;
    while (hasNextPage) {
      const { data, meta } = await fetchReports(
        buildListReportsParams({
          classIds: [classId],
          simulationIds: [simulationId],
          page,
          pageSize: ID_PAGE_SIZE,
        })
      ).unwrap();
      ids.push(...data.map((r) => r.reportId));
      hasNextPage = meta.hasNextPage;
      page += 1;
    }
    return ids;
  };

  /** Resolves true when the review request succeeded. */
  const markAll = async (
    classId: string,
    simulationId: string,
    reviewed: boolean
  ): Promise<boolean> => {
    if (!classId || !simulationId) return false;

    let ids: string[];
    setIsCollecting(true);
    try {
      ids = await collectReportIds(classId, simulationId);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('reportReview.error')));
      return false;
    } finally {
      setIsCollecting(false);
    }

    if (ids.length === 0) {
      toast.info(t('reportReview.noneUpdated'));
      return false;
    }
    return review({
      type: SimulationReportSelectorType.REPORT,
      ids,
      reviewed,
      classId,
    });
  };

  return { markAll, isMarking: isCollecting || isReviewing };
}
