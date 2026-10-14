import { beforeEach, describe, expect, it, vi } from 'vitest';

const patch = vi.fn();

vi.mock('../../../src/redux/api', () => ({
  default: {
    patch: (...args: unknown[]) => patch(...args),
    request: vi.fn(),
  },
}));

import { MarkReportViewed } from '../../../src/redux/class/SimsCompletedreportsRedux';

const REPORT_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('MarkReportViewed', () => {
  beforeEach(() => {
    patch.mockReset();
    patch.mockResolvedValue({ data: {} });
  });

  it('PATCHes the report and refetches the RTK Query reports list', async () => {
    const dispatch = vi.fn();
    await MarkReportViewed({ reportId: REPORT_ID, classId: 'c1' })(
      dispatch,
      () => ({}) as never,
      undefined
    );

    expect(patch).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`/${REPORT_ID}/viewed$`))
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'reportsApi/invalidateTags',
        payload: ['Reports'],
      })
    );
  });

  it('skips the API (and the refetch) for legacy non-UUID ids', async () => {
    const dispatch = vi.fn();
    await MarkReportViewed({ reportId: 'report-123', classId: 'c1' })(
      dispatch,
      () => ({}) as never,
      undefined
    );

    expect(patch).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'reportsApi/invalidateTags' })
    );
  });
});
