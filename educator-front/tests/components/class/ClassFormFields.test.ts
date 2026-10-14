import { describe, expect, it } from 'vitest';
import { getSubmittableClassName } from '../../../src/components/class/ClassFormFields';

describe('getSubmittableClassName', () => {
  it('returns the sanitized name', () => {
    expect(getSubmittableClassName('  Bio & Chem (A/B)  ')).toEqual({
      className: 'Bio & Chem (A/B)',
    });
  });

  it('flags an empty name as required', () => {
    expect(getSubmittableClassName('   ')).toEqual({
      errorKey: 'form.errors.classNameRequired',
    });
  });

  it.each(['select*from Classes', 'function test cohort', "print('hi')"])(
    'flags unsafe content: %s',
    (name) => {
      expect(getSubmittableClassName(name)).toEqual({
        errorKey: 'form.errors.classNameUnsafeContent',
      });
    }
  );
});
