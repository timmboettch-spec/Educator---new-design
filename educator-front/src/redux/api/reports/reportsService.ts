import { compact } from '../classes/classesService';
import type {
  BulkReviewReportsReqDto,
  ListReportsReqDto,
  SimulationReportSelectorType,
} from './reports.types';

export { getApiErrorMessage } from '../classes/classesService';

/** Query params for the reports list; empty filters are left out rather than sent empty. */
export const buildListReportsParams = (
  filters: ListReportsReqDto
): ListReportsReqDto => compact({ ...filters });

/** Bulk-review body with blank and duplicate ids removed (selections can overlap across pages). */
export const buildBulkReviewBody = (
  type: SimulationReportSelectorType,
  ids: string[],
  reviewed: boolean
): BulkReviewReportsReqDto => ({
  type,
  ids: [...new Set(ids.map((id) => id.trim()).filter(Boolean))],
  reviewed,
});

/**
 * True for the BE 404 "Report not found", returned both for a missing report and one the
 * educator can't access, so callers can say it's no longer available.
 */
export const isReportNotFoundError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'status' in error &&
  error.status === 404;
