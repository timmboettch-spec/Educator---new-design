import {
  extractLaunchCourseContext,
  extractStudentLaunchCourseIds,
} from '../../../src/lti/lti-launch-context.util';

describe('lti-launch-context.util', () => {
  describe('extractLaunchCourseContext', () => {
    it('extracts from context.id (highest priority)', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/context': {
          id: '42',
          title: 'Biology 101',
        },
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          courseid: '99', // Should be ignored when context.id exists
        },
      };

      const result = extractLaunchCourseContext(payload);

      expect(result.courseId).toBe('42');
      expect(result.courseTitle).toBe('Biology 101');
      expect(result.source).toBe('context.id');
    });

    it('falls back to lis.course_section_sourcedid', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/lis': {
          course_section_sourcedid: 'BIOL-101-01',
        },
        'https://purl.imsglobal.org/spec/lti/claim/context': {
          title: 'Biology Section 1',
        },
      };

      const result = extractLaunchCourseContext(payload);

      expect(result.courseId).toBe('BIOL-101-01');
      expect(result.courseTitle).toBe('Biology Section 1');
      expect(result.source).toBe('lis.course_sourcedid');
    });

    it('falls back to custom.courseid', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          courseid: '123',
          coursename: 'Custom Course',
        },
      };

      const result = extractLaunchCourseContext(payload);

      expect(result.courseId).toBe('123');
      expect(result.courseTitle).toBe('Custom Course');
      expect(result.source).toBe('custom.course_id');
    });

    it('handles legacy Moodle moodlecourseid', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          moodlecourseid: '456',
        },
      };

      const result = extractLaunchCourseContext(payload);

      expect(result.courseId).toBe('456');
      expect(result.source).toBe('custom.course_id');
    });

    it('coerces numeric Canvas-style context.id to string', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/context': {
          id: 10000000000001,
          title: 'Canvas Course',
        },
      };

      const result = extractLaunchCourseContext(payload);

      expect(result.courseId).toBe('10000000000001');
      expect(result.courseTitle).toBe('Canvas Course');
      expect(result.source).toBe('context.id');
    });

    it('uses default title when none provided', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/context': {
          id: '789',
        },
      };

      const result = extractLaunchCourseContext(payload);

      expect(result.courseId).toBe('789');
      expect(result.courseTitle).toBe('LMS Class');
    });

    it('returns empty when no course context found', () => {
      const payload = {};

      const result = extractLaunchCourseContext(payload);

      expect(result.courseId).toBe('');
      expect(result.courseTitle).toBe('');
      expect(result.source).toBe('none');
    });
  });

  describe('extractStudentLaunchCourseIds', () => {
    it('returns deduplicated course IDs in priority order', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/context': {
          id: '42',
        },
        'https://purl.imsglobal.org/spec/lti/claim/lis': {
          course_section_sourcedid: '42', // Duplicate
        },
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          courseid: '99',
        },
      };

      const result = extractStudentLaunchCourseIds(payload);

      expect(result).toEqual(['42', '99']);
    });

    it('handles legacy Moodle course ID claims', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          moodle_course_id: '123',
        },
      };

      const result = extractStudentLaunchCourseIds(payload);

      expect(result).toContain('123');
    });

    it('returns empty array when no course IDs found', () => {
      const payload = {};

      const result = extractStudentLaunchCourseIds(payload);

      expect(result).toEqual([]);
    });

    it('filters out empty strings', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/context': {
          id: '',
        },
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          courseid: '42',
        },
      };

      const result = extractStudentLaunchCourseIds(payload);

      expect(result).toEqual(['42']);
    });
  });
});
