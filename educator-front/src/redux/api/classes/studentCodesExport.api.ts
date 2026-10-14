import api from '../../api';
import { exportStudentCodesByClassId } from './classes.endpoints';
import type { StudentCodesExportFormat } from './classes.types';

/**
 * Downloads a class's student codes file (CSV or PDF) through the shared axios
 * instance, so the bearer token and CSRF/401 handling apply. Not an RTK Query
 * endpoint: a Blob can't live in its serializable cache, and nothing reads it back.
 * Aborting `signal` cancels the request (axios rejects with a CanceledError).
 */
export const getStudentCodesExport = async (
  classId: string,
  format: StudentCodesExportFormat,
  signal?: AbortSignal
): Promise<Blob> => {
  const { data } = await api.get<Blob>(exportStudentCodesByClassId(classId), {
    params: { format },
    responseType: 'blob',
    signal,
  });
  return data;
};
