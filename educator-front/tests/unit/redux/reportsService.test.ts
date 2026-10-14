import { describe, expect, it } from 'vitest';
import {
  buildBulkReviewBody,
  buildListReportsParams,
  isReportNotFoundError,
} from '../../../src/redux/api/reports/reportsService';
import {
  ReportReviewStatus,
  ReportSortField,
  SimulationReportSelectorType,
} from '../../../src/redux/api/reports/reports.types';
import type { ListReportsReqDto } from '../../../src/redux/api/reports/reports.types';

// Filter state as a screen holds it: empty lists and an unset status mean "no filter".
const DEFAULTS: ListReportsReqDto = {
  page: 1,
  pageSize: 10,
  studentIds: [],
  classIds: [],
  schoolIds: [],
  simulationIds: [],
  reviewStatus: undefined,
  sortBy: ReportSortField.COMPLETED_AT,
  sortDirection: 'DESC',
};

describe('buildListReportsParams', () => {
  it('leaves out empty filters and keeps paging and sort', () => {
    expect(buildListReportsParams(DEFAULTS)).toEqual({
      page: 1,
      pageSize: 10,
      sortBy: 'completedAt',
      sortDirection: 'DESC',
    });
  });

  it('sends every filter that is set', () => {
    expect(
      buildListReportsParams({
        ...DEFAULTS,
        page: 3,
        studentIds: ['s1'],
        classIds: ['c1', 'c2'],
        schoolIds: ['sch-1'],
        simulationIds: ['cardiac-care-v2'],
        reviewStatus: ReportReviewStatus.READ,
        sortBy: ReportSortField.STUDENT_NAME,
        sortDirection: 'ASC',
      })
    ).toEqual({
      page: 3,
      pageSize: 10,
      studentIds: ['s1'],
      classIds: ['c1', 'c2'],
      schoolIds: ['sch-1'],
      simulationIds: ['cardiac-care-v2'],
      reviewStatus: 'read',
      sortBy: 'studentName',
      sortDirection: 'ASC',
    });
  });
});

describe('buildBulkReviewBody', () => {
  it('drops blank and duplicate ids', () => {
    expect(
      buildBulkReviewBody(
        SimulationReportSelectorType.STUDENT,
        ['s1', ' s2 ', '', 's1', '  '],
        false
      )
    ).toEqual({
      type: 'student',
      ids: ['s1', 's2'],
      reviewed: false,
    });
  });
});

describe('isReportNotFoundError', () => {
  it('is true only for a 404', () => {
    expect(
      isReportNotFoundError({
        status: 404,
        data: { message: 'Report not found' },
      })
    ).toBe(true);
    expect(isReportNotFoundError({ status: 403, data: {} })).toBe(false);
    expect(isReportNotFoundError(undefined)).toBe(false);
    expect(isReportNotFoundError('boom')).toBe(false);
  });
});
