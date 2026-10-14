/**
 * Re-export shared educator↔school helpers from common to avoid drift with auth/LMS.
 * Prefer importing from `src/common/utils/educator-school.util` in new code.
 */
export {
  educatorBelongsToSchool,
  getEducatorSchoolIds,
  isGoogleClassroomEnabledForEducator,
  mapEducatorSchoolsForAuth,
  mapSchoolToAuthDto,
  type EducatorSchoolAuthDto,
} from 'src/common/utils/educator-school.util';
