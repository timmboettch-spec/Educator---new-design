import { ReportListSortField, ReportModeType, ReportReviewStatus } from '../constants';
import type { ReportScoreJson } from './simulation-report.interface';

/** RE-192: `SimulationReportRepository.findReportsForListing()` filter/sort/pagination params. */
export interface IReportListingFilters {
  studentIds?: string[];
  classIds?: string[];
  schoolIds?: string[];
  simulationIds?: string[];
  reviewStatus?: ReportReviewStatus;
}

export interface IReportListingSort {
  field: ReportListSortField;
  direction: 'ASC' | 'DESC';
}

export interface IReportListingPagination {
  skip: number;
  take: number;
}

/** Raw row shape returned by the listing query's `getRawMany()` — typed columns only. */
export interface IReportListingRawRow {
  reportId: string;
  studentCode: string;
  studentName: string | null;
  scenarioId: string;
  simulationName: string | null;
  mode: ReportModeType | null;
  score: number | null;
  scoreJson: ReportScoreJson | null;
  performanceLabel: string | null;
  totalTimeSeconds: number | null;
  transcriptId: string | null;
  completedAt: Date;
  viewedAt: Date | null;
  viewedBy: string | null;
}

export interface IReportListingResult {
  rows: IReportListingRawRow[];
  total: number;
}
