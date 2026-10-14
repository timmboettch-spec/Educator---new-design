import { describe, expect, it } from 'vitest';
import { isGoogleClassroomEnabledFlag } from '../../../src/utils/googleClassroomAccess';

describe('AppRouter Google Classroom deep-link gate', () => {
  it('allows educators when flag is true or unset', () => {
    expect(isGoogleClassroomEnabledFlag(true)).toBe(true);
    expect(isGoogleClassroomEnabledFlag(undefined)).toBe(true);
  });

  it('blocks educators when flag is false', () => {
    expect(isGoogleClassroomEnabledFlag(false)).toBe(false);
  });
});
