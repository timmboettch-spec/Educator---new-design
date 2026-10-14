import { useMemo } from 'react';
import type { ClassWithStudents } from '../types/Class_types';

/**
 * Looks up a class in the legacy full class list (`/api/classes/user`) by id.
 *
 * The paginated `/api/classes` rows carry only counts, so this supplies what
 * they lack (students, sims, school id for deep links) until dedicated
 * students/sims/reports APIs exist. When those land, replace this lookup.
 */
export function useLegacyClassLookup(allClasses: ClassWithStudents[]) {
  return useMemo(
    () => new Map(allClasses.map((cls) => [cls.id, cls])),
    [allClasses]
  );
}
