import { useGetAttentionSummaryQuery } from '@/redux/api/classes/classesApi';

export interface ClassesNeedingAttention {
  status: 'loading' | 'failed' | 'succeeded';
  totalActive: number;
  needingCount: number;
  unreadCount: number;
  noStudentsCount: number;
  noSimsCount: number;
}

/**
 * Attention counts for the educator's active classes from GET /api/classes/user/attention-summary.
 * `needingCount` is the BE's distinct count: a class with several issues counts once.
 */
export function useClassesNeedingAttention(): ClassesNeedingAttention {
  const { data, isError, isSuccess } = useGetAttentionSummaryQuery();

  const unreadCount = data?.unreadReports ?? 0;
  const noStudentsCount = data?.noStudents ?? 0;
  const noSimsCount = data?.noAssignedSims ?? 0;

  let status: ClassesNeedingAttention['status'] = 'loading';
  if (isError) status = 'failed';
  else if (isSuccess) status = 'succeeded';

  return {
    status,
    totalActive: data?.totalClasses ?? 0,
    needingCount: data?.classesNeedingAttention ?? 0,
    unreadCount,
    noStudentsCount,
    noSimsCount,
  };
}
