import {
  extractLaunchCourseContext,
  extractStudentLaunchCourseIds,
  extractCustomSimulationId,
} from './lti-launch-context.util';

describe('LTI Launch Context Utilities', () => {
  describe('extractCustomSimulationId', () => {
    it('should extract custom_simulation_id from custom claim', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          custom_simulation_id: 'sim-abc-123',
        },
      };

      expect(extractCustomSimulationId(payload)).toBe('sim-abc-123');
    });

    it('should extract simulation_id from custom claim', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          simulation_id: 'sim-xyz-456',
        },
      };

      expect(extractCustomSimulationId(payload)).toBe('sim-xyz-456');
    });

    it('should extract sim_id from custom claim', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          sim_id: 'sim-short-789',
        },
      };

      expect(extractCustomSimulationId(payload)).toBe('sim-short-789');
    });

    it('should prioritize custom_simulation_id over simulation_id', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          custom_simulation_id: 'priority-sim',
          simulation_id: 'fallback-sim',
        },
      };

      expect(extractCustomSimulationId(payload)).toBe('priority-sim');
    });

    it('should extract from top-level payload if custom claim is missing', () => {
      const payload = {
        custom_simulation_id: 'top-level-sim',
      };

      expect(extractCustomSimulationId(payload)).toBe('top-level-sim');
    });

    it('should return null when no simulation_id is present', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          other_param: 'value',
        },
      };

      expect(extractCustomSimulationId(payload)).toBeNull();
    });

    it('should return null for empty payload', () => {
      expect(extractCustomSimulationId({})).toBeNull();
    });

    it('should ignore empty strings and whitespace-only values', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          custom_simulation_id: '',
          simulation_id: '   ',
          sim_id: 'valid-sim',
        },
      };

      expect(extractCustomSimulationId(payload)).toBe('valid-sim');
    });

    it('should handle numeric simulation IDs', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          custom_simulation_id: 12345,
        },
      };

      expect(extractCustomSimulationId(payload)).toBe('12345');
    });

    it('should handle bigint simulation IDs', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          custom_simulation_id: BigInt('999999999999999'),
        },
      };

      expect(extractCustomSimulationId(payload)).toBe('999999999999999');
    });

    it('should trim whitespace from extracted values', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          custom_simulation_id: '  sim-with-spaces  ',
        },
      };

      expect(extractCustomSimulationId(payload)).toBe('sim-with-spaces');
    });
  });

  describe('extractLaunchCourseContext', () => {
    it('should extract course from context.id (preferred)', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/context': {
          id: 'course-123',
          title: 'Biology 101',
        },
      };

      const context = extractLaunchCourseContext(payload);
      expect(context.courseId).toBe('course-123');
      expect(context.courseTitle).toBe('Biology 101');
      expect(context.source).toBe('context.id');
    });

    it('should fall back to lis.course_section_sourcedid if context.id is missing', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/context': {
          title: 'Math 201',
        },
        'https://purl.imsglobal.org/spec/lti/claim/lis': {
          course_section_sourcedid: 'lis-course-456',
        },
      };

      const context = extractLaunchCourseContext(payload);
      expect(context.courseId).toBe('lis-course-456');
      expect(context.courseTitle).toBe('Math 201');
      expect(context.source).toBe('lis.course_sourcedid');
    });

    it('should fall back to custom.courseid if standard claims are missing', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          courseid: 'custom-course-789',
          coursename: 'Chemistry Advanced',
        },
      };

      const context = extractLaunchCourseContext(payload);
      expect(context.courseId).toBe('custom-course-789');
      expect(context.courseTitle).toBe('Chemistry Advanced');
      expect(context.source).toBe('custom.course_id');
    });

    it('should default to empty strings when no course info is found', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/custom': {},
      };

      const context = extractLaunchCourseContext(payload);
      expect(context.courseId).toBe('');
      expect(context.courseTitle).toBe('');
      expect(context.source).toBe('none');
    });

    it('should use "LMS Class" as default title when context.id exists but title is missing', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/context': {
          id: 'course-no-title',
        },
      };

      const context = extractLaunchCourseContext(payload);
      expect(context.courseTitle).toBe('LMS Class');
    });
  });

  describe('extractStudentLaunchCourseIds', () => {
    it('should extract and deduplicate course IDs in priority order', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/context': {
          id: 'course-primary',
        },
        'https://purl.imsglobal.org/spec/lti/claim/lis': {
          course_section_sourcedid: 'course-lis',
        },
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          courseid: 'course-custom',
        },
      };

      const courseIds = extractStudentLaunchCourseIds(payload);
      expect(courseIds).toEqual(['course-primary', 'course-lis', 'course-custom']);
    });

    it('should deduplicate identical course IDs', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/context': {
          id: 'course-123',
        },
        'https://purl.imsglobal.org/spec/lti/claim/lis': {
          course_section_sourcedid: 'course-123', // duplicate
        },
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          courseid: 'course-456',
        },
      };

      const courseIds = extractStudentLaunchCourseIds(payload);
      expect(courseIds).toEqual(['course-123', 'course-456']);
    });

    it('should skip empty and whitespace-only values', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/context': {
          id: '',
        },
        'https://purl.imsglobal.org/spec/lti/claim/lis': {
          course_section_sourcedid: '   ',
        },
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          courseid: 'valid-course',
        },
      };

      const courseIds = extractStudentLaunchCourseIds(payload);
      expect(courseIds).toEqual(['valid-course']);
    });

    it('should return empty array when no course IDs are found', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/custom': {},
      };

      const courseIds = extractStudentLaunchCourseIds(payload);
      expect(courseIds).toEqual([]);
    });

    it('should handle numeric course IDs', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/context': {
          id: 12345,
        },
      };

      const courseIds = extractStudentLaunchCourseIds(payload);
      expect(courseIds).toEqual(['12345']);
    });

    it('should handle legacy Moodle course ID keys', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          moodlecourseid: 'moodle-legacy-1',
        },
      };

      const courseIds = extractStudentLaunchCourseIds(payload);
      expect(courseIds).toEqual(['moodle-legacy-1']);
    });
  });
});
