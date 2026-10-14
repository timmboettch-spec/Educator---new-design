import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();

vi.mock('../../../src/redux/api', () => ({
  default: {
    get: (...args: unknown[]) => apiGet(...args),
  },
}));

import { getStudentCodesExport } from '../../../src/redux/api/classes/studentCodesExport.api';
import { StudentCodesExportFormat } from '../../../src/redux/api/classes/classes.types';

describe('getStudentCodesExport', () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it.each([StudentCodesExportFormat.CSV, StudentCodesExportFormat.PDF])(
    'requests the %s export as a blob for the class',
    async (format) => {
      const blob = new Blob(['file']);
      apiGet.mockResolvedValueOnce({ data: blob, headers: {} });

      const result = await getStudentCodesExport('class-1', format);

      expect(apiGet).toHaveBeenCalledWith(
        '/api/classes/class-1/export-student-codes',
        { params: { format }, responseType: 'blob' }
      );
      expect(result).toBe(blob);
    }
  );

  it('passes the abort signal through so the download can be cancelled', async () => {
    apiGet.mockResolvedValueOnce({ data: new Blob(['file']), headers: {} });
    const { signal } = new AbortController();

    await getStudentCodesExport(
      'class-1',
      StudentCodesExportFormat.PDF,
      signal
    );

    expect(apiGet).toHaveBeenCalledWith(
      '/api/classes/class-1/export-student-codes',
      { params: { format: 'pdf' }, responseType: 'blob', signal }
    );
  });

  it('rejects when the request fails', async () => {
    apiGet.mockRejectedValueOnce(new Error('Network Error'));

    await expect(
      getStudentCodesExport('class-1', StudentCodesExportFormat.PDF)
    ).rejects.toThrow('Network Error');
  });
});
