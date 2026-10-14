import type { Class, ClassFormValues } from '../types/Class_types';
import { computeClassStatus } from './classUtils';

export interface UpdateClassData {
  class_name: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIEVED';
  start_date: string;
  end_date: string;
  school_id?: string;
}

export type UpdateClassResult =
  { noChange: true } | { noChange: false; data: UpdateClassData };

/**
 * Diffs the edit form against the currently selected class. Returns
 * `{ noChange: true }` when nothing meaningful changed, otherwise the payload
 * to send to the update-class mutation.
 */
export function buildUpdateClassPayload(
  values: ClassFormValues,
  selectedClass: Class
): UpdateClassResult {
  const originalStatus =
    selectedClass.status === 'ARCHIEVED' || selectedClass.status === 'INACTIVE'
      ? selectedClass.status
      : computeClassStatus(selectedClass.start_date, selectedClass.end_date);
  const originalSchoolId = selectedClass.school_id ?? '';
  const isSame =
    values.class_name === selectedClass.class_name &&
    values.status === originalStatus &&
    values.start_date === selectedClass.start_date?.split('T')[0] &&
    values.end_date === selectedClass.end_date?.split('T')[0] &&
    (values.school_id ?? '') === originalSchoolId;

  if (isSame) {
    return { noChange: true };
  }

  return {
    noChange: false,
    data: {
      class_name: values.class_name,
      status: values.status as UpdateClassData['status'],
      start_date: values.start_date,
      end_date: values.end_date,
      ...(values.school_id ? { school_id: values.school_id } : {}),
    },
  };
}
