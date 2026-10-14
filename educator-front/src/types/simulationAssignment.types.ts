/** What the assign modal needs to know about a class it can select. */
export interface AssignableClass {
  id: string;
  name: string;
  /** As the BE sends it (YYYY-MM-DD or MM-DD-YYYY). */
  startDate: string;
  endDate: string;
  studentsCount: number;
}

/** The class the assign modal was opened from, with its school group. */
export interface AssignContextClass extends AssignableClass {
  /** The school's id, or the BE's `unassigned` group for a class without one. */
  schoolId: string;
  schoolName: string;
}
