/** SQL predicate for classes owned or co-instructed by the given educator id placeholder. */
export function ownerOrCoInstructorSql(
  classAlias: string,
  educatorIdPlaceholder = ':educatorId',
): string {
  return `(${classAlias}.educator_id = ${educatorIdPlaceholder} OR EXISTS (
    SELECT 1 FROM class_educators ce
    WHERE ce.class_id = ${classAlias}.id AND ce.educator_id = ${educatorIdPlaceholder}
  ))`;
}
