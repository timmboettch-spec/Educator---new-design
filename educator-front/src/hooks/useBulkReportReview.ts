import { useTranslation } from 'react-i18next';
import { toast } from '@/components/common/Toast';
import { useBulkReviewReportsMutation } from '@/redux/api/reports/reportsApi';
import { SimulationReportSelectorType } from '@/redux/api/reports/reports.types';
import {
  buildBulkReviewBody,
  getApiErrorMessage,
} from '@/redux/api/reports/reportsService';
import {
  markReportUnviewed,
  markReportViewed,
} from '@/redux/class/GetClassRedux';
import {
  clearLocalReportIsNew,
  setLocalReportIsNew,
} from '@/redux/class/SimsCompletedreportsRedux';
import {
  clearReportIsNew,
  setReportIsNew,
} from '@/redux/reports/EducatorReportsRedux';
import type { AppDispatch, RootState } from '@/store';
import { useAppDispatch } from '@/store/hooks';

interface ReviewArgs {
  type: SimulationReportSelectorType;
  // Report, student, simulation or class ids, per `type`.
  ids: string[];
  reviewed: boolean;
  // Class the reports belong to, for its unread count.
  classId: string;
}

/**
 * Only reports that were unread (not viewed here, not reviewed per the BE) count down the
 * class's unread total, so marking already-reviewed reports never over-decrements it.
 */
const markUnreadReportsViewed =
  (reportIds: string[], classId: string) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    const { GetClass, EducatorReports } = getState();
    const viewed = new Set(GetClass.viewedReportIds);
    const reviewedOnBe = new Set(
      EducatorReports.reports.filter((r) => r.isNew === false).map((r) => r.id)
    );
    const wereUnread = reportIds.filter(
      (id) => !viewed.has(id) && !reviewedOnBe.has(id)
    );
    if (wereUnread.length > 0) {
      dispatch(markReportViewed({ reportId: wereUnread, classId }));
    }
  };

/**
 * Only reports that were read (viewed here, or reviewed per the BE) become unread again, so
 * repeating "mark unreviewed" never inflates the class's unread count. Reads the store at
 * dispatch time instead of subscribing the hook to it.
 */
const markReadReportsUnviewed =
  (reportIds: string[], classId: string) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    const { GetClass, EducatorReports } = getState();
    const viewed = new Set(GetClass.viewedReportIds);
    const reviewedOnBe = new Set(
      EducatorReports.reports.filter((r) => r.isNew === false).map((r) => r.id)
    );
    const wereRead = reportIds.filter(
      (id) => viewed.has(id) || reviewedOnBe.has(id)
    );
    if (wereRead.length > 0) {
      dispatch(markReportUnviewed({ reportId: wereRead, classId }));
    }
  };

/**
 * Marks reports reviewed or unreviewed in one BE call, then mirrors the result into the
 * legacy report state so NEW badges and unread counts update without a refetch.
 * Resolves true when the request succeeded.
 */
export function useBulkReportReview() {
  const { t } = useTranslation('classManagement');
  const dispatch = useAppDispatch();
  const [bulkReview, { isLoading }] = useBulkReviewReportsMutation();

  const review = async ({
    type,
    ids,
    reviewed,
    classId,
  }: ReviewArgs): Promise<boolean> => {
    const body = buildBulkReviewBody(type, ids, reviewed);
    if (body.ids.length === 0) return false;

    try {
      // updatedIds are the report ids the BE changed, whatever `type` selected.
      const { updatedIds, notAccessibleIds } = await bulkReview(body).unwrap();

      if (updatedIds.length > 0) {
        if (reviewed) {
          dispatch(markUnreadReportsViewed(updatedIds, classId));
          dispatch(clearReportIsNew(updatedIds));
          dispatch(clearLocalReportIsNew(updatedIds));
        } else {
          dispatch(markReadReportsUnviewed(updatedIds, classId));
          dispatch(setReportIsNew(updatedIds));
          dispatch(setLocalReportIsNew(updatedIds));
        }
      }

      // One toast: the helper replaces the previous one, so a partial result is combined.
      const done =
        updatedIds.length > 0
          ? t(reviewed ? 'reportReview.reviewed' : 'reportReview.unreviewed', {
              count: updatedIds.length,
            })
          : '';
      const skipped =
        notAccessibleIds.length > 0
          ? t('reportReview.notAccessible', { count: notAccessibleIds.length })
          : '';
      if (done && skipped) toast.warning(`${done}. ${skipped}.`);
      else if (skipped) toast.error(skipped);
      else toast.success(done || t('reportReview.noneUpdated'));
      return true;
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('reportReview.error')));
      return false;
    }
  };

  return { review, isReviewing: isLoading };
}
