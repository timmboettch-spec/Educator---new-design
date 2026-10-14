import { describe, expect, it } from 'vitest';
import {
  buildGoogleClassroomDisabledLocallyUpdates,
  isGoogleClassroomEnabledFlag,
  isGoogleClassroomEnabledForStoredUser,
  isGoogleClassroomFeatureDisabledMessage,
  isSchoolGoogleClassroomEnabled,
  resolveEducatorGcSchoolOptions,
} from '../../../src/utils/googleClassroomAccess';

describe('googleClassroomAccess', () => {
  it('allows when flag is true or unset', () => {
    expect(isGoogleClassroomEnabledFlag(true)).toBe(true);
    expect(isGoogleClassroomEnabledFlag(undefined)).toBe(true);
  });

  it('blocks when flag is false', () => {
    expect(isGoogleClassroomEnabledFlag(false)).toBe(false);
  });

  describe('isSchoolGoogleClassroomEnabled', () => {
    it('returns true only for an explicit enable flag', () => {
      expect(
        isSchoolGoogleClassroomEnabled({ google_classroom_enabled: true })
      ).toBe(true);
      expect(
        isSchoolGoogleClassroomEnabled({ googleClassroomEnabled: true })
      ).toBe(true);
      expect(
        isSchoolGoogleClassroomEnabled({ google_classroom_enabled: false })
      ).toBe(false);
      expect(isSchoolGoogleClassroomEnabled({})).toBe(false);
    });
  });

  describe('isGoogleClassroomEnabledForStoredUser', () => {
    it('enables when any assigned school has GC on', () => {
      expect(
        isGoogleClassroomEnabledForStoredUser({
          google_classroom_enabled: false,
          school: { google_classroom_enabled: false },
          schools: [
            { id: 'a', google_classroom_enabled: false },
            { id: 'b', google_classroom_enabled: true },
          ],
        })
      ).toBe(true);
    });

    it('blocks when user and all schools explicitly disable GC', () => {
      expect(
        isGoogleClassroomEnabledForStoredUser({
          google_classroom_enabled: false,
          school: { google_classroom_enabled: false },
          schools: [{ id: 'a', google_classroom_enabled: false }],
        })
      ).toBe(false);
    });
  });

  it('detects feature-disabled API messages', () => {
    expect(
      isGoogleClassroomFeatureDisabledMessage(
        'Google Classroom is not enabled for this school'
      )
    ).toBe(true);
    expect(
      isGoogleClassroomFeatureDisabledMessage('reconnect google classroom')
    ).toBe(false);
  });

  describe('resolveEducatorGcSchoolOptions', () => {
    it('merges cookie school flags when redux schools omit GC metadata', () => {
      expect(
        resolveEducatorGcSchoolOptions(
          {
            schools: [{ id: 'primary', school_name: 'Primary' }],
            school: { id: 'primary', school_name: 'Primary' },
          },
          {
            schools: [
              {
                id: 'primary',
                school_name: 'Primary',
                google_classroom_enabled: false,
              },
              {
                id: 'gc-school',
                school_name: 'GC School',
                google_classroom_enabled: true,
              },
            ],
          }
        )
      ).toEqual([{ id: 'gc-school', school_name: 'GC School' }]);
    });
  });

  describe('buildGoogleClassroomDisabledLocallyUpdates', () => {
    it('no-ops when school id is missing', () => {
      expect(
        buildGoogleClassroomDisabledLocallyUpdates(
          { google_classroom_enabled: true },
          ''
        )
      ).toEqual({});
    });

    it('disables only the target school when another school still has GC', () => {
      const updates = buildGoogleClassroomDisabledLocallyUpdates(
        {
          google_classroom_enabled: true,
          schools: [
            { id: 'school-a', google_classroom_enabled: false },
            { id: 'school-b', google_classroom_enabled: true },
          ],
        },
        'school-b'
      );

      expect(updates.google_classroom_enabled).toBe(false);
      expect(updates.schools).toEqual([
        { id: 'school-a', google_classroom_enabled: false },
        {
          id: 'school-b',
          google_classroom_enabled: false,
          googleClassroomEnabled: false,
        },
      ]);
      expect(
        isGoogleClassroomEnabledForStoredUser({
          google_classroom_enabled: updates.google_classroom_enabled,
          schools: updates.schools,
        })
      ).toBe(false);
    });

    it('keeps GC enabled when another assigned school still has it', () => {
      const updates = buildGoogleClassroomDisabledLocallyUpdates(
        {
          google_classroom_enabled: true,
          schools: [
            { id: 'school-a', google_classroom_enabled: true },
            { id: 'school-b', google_classroom_enabled: true },
          ],
        },
        'school-a'
      );

      expect(updates.google_classroom_enabled).toBe(true);
      expect(
        isGoogleClassroomEnabledForStoredUser({
          google_classroom_enabled: updates.google_classroom_enabled,
          schools: updates.schools,
        })
      ).toBe(true);
    });

    it('patches the primary school record when ids match', () => {
      const updates = buildGoogleClassroomDisabledLocallyUpdates(
        {
          google_classroom_enabled: true,
          school: { id: 'school-a', google_classroom_enabled: true },
          schools: [{ id: 'school-a', google_classroom_enabled: true }],
        },
        'school-a'
      );

      expect(updates.school).toEqual({
        id: 'school-a',
        google_classroom_enabled: false,
        googleClassroomEnabled: false,
      });
      expect(updates.google_classroom_enabled).toBe(false);
    });

    it('falls back to a user-level disable when the school id is unknown', () => {
      expect(
        buildGoogleClassroomDisabledLocallyUpdates(
          {
            google_classroom_enabled: true,
            schools: [{ id: 'school-a', google_classroom_enabled: true }],
          },
          'missing-school'
        )
      ).toEqual({ google_classroom_enabled: false });
    });
  });
});
