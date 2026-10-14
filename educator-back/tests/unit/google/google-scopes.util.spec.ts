import { GOOGLE_CLASSROOM_DEFAULT_SCOPES } from '../../../src/google/google.constants';
import {
  findMissingGoogleClassroomScopes,
  hasAllRequiredGoogleClassroomScopes,
  parseGoogleGrantedScopes,
} from '../../../src/google/utils/google-scopes.util';

describe('google-scopes.util', () => {
  const fullGrant = GOOGLE_CLASSROOM_DEFAULT_SCOPES.join(' ');

  it('parses space-delimited granted scopes', () => {
    expect([...parseGoogleGrantedScopes('openid  email\nscope-a')].sort()).toEqual([
      'email',
      'openid',
      'scope-a',
    ]);
  });

  it('treats empty/missing grant as all required missing', () => {
    expect(findMissingGoogleClassroomScopes(null)).toEqual([...GOOGLE_CLASSROOM_DEFAULT_SCOPES]);
    expect(findMissingGoogleClassroomScopes('')).toEqual([...GOOGLE_CLASSROOM_DEFAULT_SCOPES]);
    expect(hasAllRequiredGoogleClassroomScopes(null)).toBe(false);
  });

  it('returns no missing scopes when the full default set is granted', () => {
    expect(findMissingGoogleClassroomScopes(fullGrant)).toEqual([]);
    expect(hasAllRequiredGoogleClassroomScopes(fullGrant)).toBe(true);
  });

  it('lists declined Classroom scopes when consent is partial', () => {
    const partial = 'openid email https://www.googleapis.com/auth/classroom.courses';
    const missing = findMissingGoogleClassroomScopes(partial);
    expect(missing).toContain('https://www.googleapis.com/auth/classroom.rosters');
    expect(missing).toContain(
      'https://www.googleapis.com/auth/classroom.coursework.students',
    );
    expect(hasAllRequiredGoogleClassroomScopes(partial)).toBe(false);
  });
});
