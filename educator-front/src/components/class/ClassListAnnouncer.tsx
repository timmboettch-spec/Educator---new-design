import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SortDir } from '../../redux/api/classes/classes.types';
import type { ClassWithStudents } from '../../types/Class_types';

export interface ClassListAnnouncerProps {
  /** Classes matching the list query; `undefined` while it loads. */
  resultCount: number | undefined;
  sortField: keyof ClassWithStudents | null;
  sortDirection: SortDir | null;
}

/**
 * Screen-reader-only live regions for the class list: the result count when a
 * search or filter change settles, and the sort order when it changes.
 */
export function ClassListAnnouncer({
  resultCount,
  sortField,
  sortDirection,
}: ClassListAnnouncerProps) {
  const { t } = useTranslation('classManagement');
  // Only announce "sorting cleared" after the user has sorted at all.
  const [hasSorted, setHasSorted] = useState(false);
  useEffect(() => {
    if (sortField) setHasSorted(true);
  }, [sortField]);

  const columnLabel = () => {
    switch (sortField) {
      case 'class_name':
        return t('table.headers.className');
      case 'students':
        return t('table.headers.students');
      case 'sims':
        return t('table.headers.sims');
      case 'reports':
        return t('table.headers.reports');
      case 'status':
        return t('table.headers.status');
      default:
        return null;
    }
  };

  let sortMessage = '';
  const label = columnLabel();
  if (label && sortDirection) {
    sortMessage =
      sortDirection === 'asc'
        ? t('table.sortAnnouncement.ascending', { label })
        : t('table.sortAnnouncement.descending', { label });
  } else if (!sortField && hasSorted) {
    sortMessage = t('table.sortAnnouncement.cleared');
  }

  return (
    <>
      <p role="status" className="sr-only">
        {resultCount === undefined
          ? ''
          : t('table.resultCount', { count: resultCount })}
      </p>
      <p role="status" className="sr-only">
        {sortMessage}
      </p>
    </>
  );
}
