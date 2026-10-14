import { ClassScopeConstants } from '../constants/class.constants';
import { CommonStatus } from '../enums/status.enum';

/** SQL predicate for a "live" class — the one scope shared by the class list, attention counts and activity overview. */
export function liveClassScopeSql(classAlias: string): string {
  return `(
    ${classAlias}.is_active = true
    AND ${classAlias}.deleted_at IS NULL
    AND (${classAlias}.school_id IS NULL OR EXISTS (
      SELECT 1 FROM schools sch WHERE sch.id = ${classAlias}.school_id AND sch.is_active = true
    ))
    AND (
      ${classAlias}.origin IS NULL
      OR ${classAlias}.origin <> '${ClassScopeConstants.GOOGLE_CLASSROOM_ORIGIN}'
      OR (
        ${classAlias}.status <> '${CommonStatus.ARCHIEVED}'
        AND EXISTS (SELECT 1 FROM google_course_mappings gcm WHERE gcm.class_id = ${classAlias}.id)
      )
    )
  )`;
}

/** A live class whose `status` is ACTIVE — the scope of the counts (activity overview, attention) and their drill-downs. */
export function activeClassScopeSql(classAlias: string): string {
  return `(${liveClassScopeSql(classAlias)} AND ${classAlias}.status = '${CommonStatus.ACTIVE}')`;
}
