import { useCallback, useState } from 'react';
import {
  ClassSortField,
  type SortDir,
} from '../redux/api/classes/classes.types';
import type { ClassWithStudents } from '../types/Class_types';

const toClassSortField = (
  field: keyof ClassWithStudents | null
): ClassSortField | undefined =>
  Object.values(ClassSortField).find((value) => value === field);

/**
 * Owns the class table's sort column/direction. Sorting is done by the BE, so
 * this exposes the header state plus the matching `sortBy`/`sortDir` params.
 * Each column cycles unsorted → ascending → descending → unsorted.
 */
export function useClassSort() {
  const [sortField, setSortField] = useState<keyof ClassWithStudents | null>(
    null
  );
  const [sortDirection, setSortDirection] = useState<SortDir | null>(null);

  const handleSort = useCallback(
    (field: keyof ClassWithStudents) => {
      if (sortField === field && sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortField === field) {
        setSortField(null);
        setSortDirection(null);
      } else {
        setSortField(field);
        setSortDirection('asc');
      }
    },
    [sortField, sortDirection]
  );

  return {
    sortField,
    sortDirection,
    handleSort,
    sortBy: toClassSortField(sortField),
    sortDir: sortDirection ?? undefined,
  };
}
