import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GUIDED_PATH_ROLES,
  buildVisitedState,
  completedCacheKey,
  readCompletedCache,
  writeCompletedCache,
  readVisited,
} from '../../../src/redux/api/guidedPath/guidedPathService';
import { ROLE } from '../../../src/features/auth/model/roles';
import type {
  AdminStepKey,
  EducatorStepKey,
} from '../../../src/redux/api/guidedPath/guidedPath.types';

const EDUCATOR_KEYS: readonly EducatorStepKey[] = [
  'dashboard',
  'catalog',
  'classes',
  'library',
  'account',
];
const ADMIN_KEYS: readonly AdminStepKey[] = [
  'lms',
  'schools',
  'educators',
  'account',
];

describe('guidedPathService', () => {
  it('educators and district admins have a guided path', () => {
    expect(GUIDED_PATH_ROLES).toEqual([ROLE.EDUCATOR, ROLE.DISTRICT_ADMIN]);
  });

  describe('readVisited', () => {
    it('returns {} for missing or malformed state', () => {
      expect(readVisited(undefined, EDUCATOR_KEYS)).toEqual({});
      expect(readVisited({}, EDUCATOR_KEYS)).toEqual({});
      expect(readVisited({ visited: 'nope' }, EDUCATOR_KEYS)).toEqual({});
      expect(readVisited({ visited: ['dashboard'] }, EDUCATOR_KEYS)).toEqual(
        {}
      );
    });

    it('keeps only known steps that are exactly true', () => {
      expect(
        readVisited(
          {
            visited: {
              dashboard: true,
              classes: false,
              bogus: true,
              account: 1,
            },
          },
          EDUCATOR_KEYS
        )
      ).toEqual({ dashboard: true });
    });

    it("keeps only the given role's keys", () => {
      const state = {
        visited: { dashboard: true, lms: true, schools: true, account: true },
      };
      expect(readVisited(state, ADMIN_KEYS)).toEqual({
        lms: true,
        schools: true,
        account: true,
      });
      expect(readVisited(state, EDUCATOR_KEYS)).toEqual({
        dashboard: true,
        account: true,
      });
    });
  });

  describe('buildVisitedState', () => {
    it('is never empty, even from an empty state', () => {
      expect(buildVisitedState({}, ['dashboard'], EDUCATOR_KEYS)).toEqual({
        visited: { dashboard: true },
      });
    });

    it('keeps already-visited steps and unrelated keys (BE replaces, not merges)', () => {
      expect(
        buildVisitedState(
          { visited: { dashboard: true }, other: 1 },
          ['catalog', 'account'],
          EDUCATOR_KEYS
        )
      ).toEqual({
        other: 1,
        visited: { dashboard: true, catalog: true, account: true },
      });
    });

    it('builds admin state from admin keys', () => {
      expect(
        buildVisitedState({ visited: { lms: true } }, ['schools'], ADMIN_KEYS)
      ).toEqual({ visited: { lms: true, schools: true } });
    });
  });

  describe('completed cache', () => {
    beforeEach(() => window.localStorage.clear());
    afterEach(() => vi.restoreAllMocks());

    it('keys by user and role', () => {
      expect(completedCacheKey('u1', ROLE.EDUCATOR)).toBe(
        'rw_edu_guide_completed_u1_educator'
      );
    });

    it('reads back only what was written for that user and role', () => {
      writeCompletedCache('u1', ROLE.EDUCATOR);

      expect(readCompletedCache('u1', ROLE.EDUCATOR)).toBe(true);
      expect(readCompletedCache('u2', ROLE.EDUCATOR)).toBe(false);
      expect(readCompletedCache('u1', ROLE.DISTRICT_ADMIN)).toBe(false);
      expect(readCompletedCache(null, ROLE.EDUCATOR)).toBe(false);
      expect(readCompletedCache('u1', null)).toBe(false);
    });

    it('treats storage that throws as "not cached"', () => {
      vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });

      expect(() => writeCompletedCache('u1', ROLE.EDUCATOR)).not.toThrow();
      expect(readCompletedCache('u1', ROLE.EDUCATOR)).toBe(false);
    });
  });
});
