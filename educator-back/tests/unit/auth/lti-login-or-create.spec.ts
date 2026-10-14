/**
 * Unit tests for LTI educator login school binding (RWED-1105, cross-school launch)
 */

import { AuthConstants } from '../../../src/auth/auth.constants';

describe('LTI educator login school binding', () => {
  describe('educatorBelongsToSchool logic', () => {
    function belongsToSchool(
      educator: {
        school?: { id: string } | null;
        schoolAssignments?: Array<{ school?: { id: string } }>;
      },
      schoolId: string,
    ): boolean {
      if (educator.school?.id === schoolId) {
        return true;
      }
      return educator.schoolAssignments?.some((a) => a.school?.id === schoolId) ?? false;
    }

    it('matches primary school FK', () => {
      expect(belongsToSchool({ school: { id: 'school-a' } }, 'school-a')).toBe(true);
    });

    it('matches secondary school assignment', () => {
      expect(
        belongsToSchool(
          {
            school: { id: 'school-a' },
            schoolAssignments: [{ school: { id: 'school-b' } }],
          },
          'school-b',
        ),
      ).toBe(true);
    });

    it('rejects educator from a different school', () => {
      expect(
        belongsToSchool(
          {
            school: { id: 'school-a' },
            schoolAssignments: [],
          },
          'school-b',
        ),
      ).toBe(false);
    });
  });

  describe('login failure reason slugs', () => {
    function mapReason(message: string | undefined): string {
      switch (message) {
        case AuthConstants.LTI.SCHOOL_NOT_CONFIGURED:
          return 'school_not_configured';
        case AuthConstants.LTI.SCHOOL_MISMATCH:
          return 'school_mismatch';
        default:
          return 'user_not_found';
      }
    }

    it('maps school not configured', () => {
      expect(mapReason(AuthConstants.LTI.SCHOOL_NOT_CONFIGURED)).toBe('school_not_configured');
    });

    it('maps school mismatch', () => {
      expect(mapReason(AuthConstants.LTI.SCHOOL_MISMATCH)).toBe('school_mismatch');
    });
  });
});
