import { Educator } from 'src/database/entities';
import {
  isGoogleClassroomEnabledForEducator,
  mapEducatorSchoolsForAuth,
} from 'src/common/utils/educator-school.util';

function buildEducator(overrides: Partial<Educator> = {}): Educator {
  return {
    id: 'educator-1',
    school: undefined,
    primarySchool: undefined,
    schoolAssignments: [],
    ...overrides,
  } as Educator;
}

describe('educator-school.util', () => {
  describe('mapEducatorSchoolsForAuth', () => {
    it('lists primary school first and omits inactive schools', () => {
      const educator = buildEducator({
        primarySchool: {
          id: 'school-primary',
          school_name: 'Primary',
          lms_enabled: false,
          google_classroom_enabled: false,
          is_active: true,
        } as Educator['primarySchool'],
        schoolAssignments: [
          {
            school: {
              id: 'school-secondary',
              school_name: 'Secondary GC',
              lms_enabled: false,
              google_classroom_enabled: true,
              is_active: true,
            },
          } as Educator['schoolAssignments'][number],
          {
            school: {
              id: 'school-primary',
              school_name: 'Primary',
              lms_enabled: false,
              google_classroom_enabled: false,
              is_active: true,
            },
          } as Educator['schoolAssignments'][number],
          {
            school: {
              id: 'school-inactive',
              school_name: 'Inactive',
              lms_enabled: false,
              google_classroom_enabled: true,
              is_active: false,
            },
          } as Educator['schoolAssignments'][number],
        ],
      });

      const schools = mapEducatorSchoolsForAuth(educator);

      expect(schools.map((school) => school.id)).toEqual([
        'school-primary',
        'school-secondary',
      ]);
      expect(schools[0].google_classroom_enabled).toBe(false);
      expect(schools[1].google_classroom_enabled).toBe(true);
    });
  });

  describe('isGoogleClassroomEnabledForEducator', () => {
    it('returns true when any assigned school has GC enabled', () => {
      const educator = buildEducator({
        primarySchool: {
          id: 'school-primary',
          school_name: 'Primary',
          lms_enabled: false,
          google_classroom_enabled: false,
          is_active: true,
        } as Educator['primarySchool'],
        schoolAssignments: [
          {
            school: {
              id: 'school-primary',
              school_name: 'Primary',
              lms_enabled: false,
              google_classroom_enabled: false,
              is_active: true,
            },
          } as Educator['schoolAssignments'][number],
          {
            school: {
              id: 'school-gc',
              school_name: 'GC School',
              lms_enabled: false,
              google_classroom_enabled: true,
              is_active: true,
            },
          } as Educator['schoolAssignments'][number],
        ],
      });

      expect(isGoogleClassroomEnabledForEducator(educator)).toBe(true);
    });

    it('returns false when no assigned school has GC enabled', () => {
      const educator = buildEducator({
        school: {
          id: 'school-primary',
          school_name: 'Primary',
          lms_enabled: false,
          google_classroom_enabled: false,
          is_active: true,
        } as Educator['school'],
      });

      expect(isGoogleClassroomEnabledForEducator(educator)).toBe(false);
    });
  });
});
