import { describe, expect, it } from 'vitest';
import {
  extractClassNameFromDetail,
  indexExistingClassesByCourseId,
  resolveLmsClassName,
  shouldRenameExistingClass,
  type LmsClassDetail,
} from '../../../src/utils/lmsClassName';

describe('extractClassNameFromDetail', () => {
  it('prefers NRPS title over label', () => {
    const detail: LmsClassDetail = {
      label: 'moodle',
      title: 'RealityworksLTITestbed',
    };
    expect(extractClassNameFromDetail(detail)).toBe('RealityworksLTITestbed');
  });

  it('falls back to label when title is missing', () => {
    const detail: LmsClassDetail = {
      label: 'RW-LTI-01',
    };
    expect(extractClassNameFromDetail(detail)).toBe('RW-LTI-01');
  });

  it('prefers context_title over context_label', () => {
    const detail: LmsClassDetail = {
      context_label: 'site',
      context_title: 'Course Full Title',
    };
    expect(extractClassNameFromDetail(detail)).toBe('Course Full Title');
  });
});

describe('resolveLmsClassName', () => {
  it('uses LTI launch course name when context IDs match', () => {
    const detail: LmsClassDetail = {
      contextId: '42',
      label: 'moodle',
      title: 'NRPS Title',
    };
    expect(
      resolveLmsClassName(detail, {
        courseId: '42',
        courseName: 'LTI Launch Title',
      }),
    ).toBe('LTI Launch Title');
  });

  it('uses NRPS title when LTI context ID does not match', () => {
    const detail: LmsClassDetail = {
      contextId: '42',
      label: 'moodle',
      title: 'NRPS Title',
    };
    expect(
      resolveLmsClassName(detail, {
        courseId: '99',
        courseName: 'Other Course',
      }),
    ).toBe('NRPS Title');
  });

  it('does not downgrade to label on repeat resolve with same detail', () => {
    const detail: LmsClassDetail = {
      contextId: '42',
      label: 'moodle',
      title: 'RealityworksLTITestbed',
    };
    const first = resolveLmsClassName(detail, { courseId: '42', courseName: 'RealityworksLTITestbed' });
    const second = resolveLmsClassName(detail);
    expect(first).toBe('RealityworksLTITestbed');
    expect(second).toBe('RealityworksLTITestbed');
  });
});

describe('indexExistingClassesByCourseId', () => {
  it('matches mapped class by lmsCourseId', () => {
    const index = indexExistingClassesByCourseId(
      [{ classId: 'class-1', className: 'moodle', lmsCourseId: '42' }],
      [],
    );
    expect(index.get('42')).toEqual({ classId: 'class-1', className: 'moodle' });
  });

  it('falls back to portal class lms_class_reference', () => {
    const index = indexExistingClassesByCourseId(
      [],
      [{ id: 'class-2', class_name: 'Old Name', lms_class_reference: '99' }],
    );
    expect(index.get('99')).toEqual({ classId: 'class-2', className: 'Old Name' });
  });
});

describe('shouldRenameExistingClass', () => {
  it('returns true when names differ case-insensitively', () => {
    expect(shouldRenameExistingClass('moodle', 'RealityworksLTITestbed')).toBe(true);
  });

  it('returns false when names already match', () => {
    expect(shouldRenameExistingClass('RealityworksLTITestbed', 'RealityworksLTITestbed')).toBe(false);
  });
});
