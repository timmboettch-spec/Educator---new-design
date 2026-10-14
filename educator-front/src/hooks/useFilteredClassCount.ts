import { useEffect } from 'react';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useTranslation } from 'react-i18next';
import { toast } from '../components/common/Toast';
import { useGetClassesQuery } from '../redux/api/classes/classesApi';
import {
  buildFilteredClassCountArg,
  type ClassListFilters,
} from '../redux/api/classes/classesService';

/**
 * How many classes match the list filters (search, panel filters and the
 * attention measure together), for the "Showing:" chip. Only requested while a
 * measure is active; `undefined` while loading or after a failure (toast).
 */
export function useFilteredClassCount(
  filters: ClassListFilters,
  enabled: boolean
): number | undefined {
  const { t } = useTranslation('classManagement');
  const { currentData, isError } = useGetClassesQuery(
    enabled && filters.measure ? buildFilteredClassCountArg(filters) : skipToken
  );
  const failedMessage = t('toast.attentionFilterFailed');

  useEffect(() => {
    if (isError) toast.error(failedMessage);
  }, [isError, failedMessage]);

  return currentData?.meta.total;
}
