/**
 * Unit tests for LMS provisioning school context (multi-school educator launches)
 */

describe('LMS provision launch school resolution', () => {
  type EducatorLike = {
    id?: string;
    school?: { id: string } | null;
    schoolAssignments?: Array<{ school?: { id: string } }>;
  };

  function educatorBelongsToSchool(educator: EducatorLike, schoolId: string): boolean {
    if (educator.school?.id === schoolId) {
      return true;
    }
    return (
      educator.schoolAssignments?.some((assignment) => assignment.school?.id === schoolId) ?? false
    );
  }

  function resolveProvisionSchoolId(
    educator: EducatorLike,
    launchSchoolId?: string,
  ): string | null {
    const fromLaunch = launchSchoolId?.trim();
    if (fromLaunch) {
      if (!educatorBelongsToSchool(educator, fromLaunch)) {
        return null;
      }
      return fromLaunch;
    }
    return educator.school?.id ?? null;
  }

  it('prefers launch school when educator is assigned to it', () => {
    expect(
      resolveProvisionSchoolId(
        {
          school: { id: 'school-1' },
          schoolAssignments: [{ school: { id: 'school-2' } }],
        },
        'school-2',
      ),
    ).toBe('school-2');
  });

  it('rejects launch school when educator is not assigned to it', () => {
    expect(resolveProvisionSchoolId({ school: { id: 'school-1' } }, 'school-2')).toBeNull();
  });

  it('falls back to educator primary school when launch school is omitted', () => {
    expect(resolveProvisionSchoolId({ school: { id: 'school-1' } })).toBe('school-1');
  });

  it('returns null when neither launch nor primary school is available', () => {
    expect(resolveProvisionSchoolId({ school: null }, '')).toBeNull();
  });

  it('launch school differs from primary — class row must use launch school, not educator.school', () => {
    const primarySchoolId = 'dev-qa-school-01';
    const launchSchoolId = 'dev-canvas-school-01';
    const educator = {
      school: { id: primarySchoolId },
      schoolAssignments: [{ school: { id: launchSchoolId } }],
    };

    expect(resolveProvisionSchoolId(educator, launchSchoolId)).toBe(launchSchoolId);
    expect(resolveProvisionSchoolId(educator, launchSchoolId)).not.toBe(educator.school?.id);
  });
});
