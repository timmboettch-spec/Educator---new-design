import {
  extractCourseIdFromNrpsUrl,
  parseNrpsMembershipContainer,
} from '../../../src/lms/utils/nrps.util';

describe('nrps.util', () => {
  describe('extractCourseIdFromNrpsUrl', () => {
    it('extracts course id from CourseSection URLs', () => {
      expect(
        extractCourseIdFromNrpsUrl(
          'https://moodle.example/mod/lti/services.php/CourseSection/100/bindings/1/memberships',
        ),
      ).toBe(100);
    });

    it('extracts course id from Context URLs', () => {
      expect(
        extractCourseIdFromNrpsUrl(
          'https://moodle.example/mod/lti/services.php/Context/55/bindings/1/memberships',
        ),
      ).toBe(55);
    });

    it('returns null for empty or unrelated URLs', () => {
      expect(extractCourseIdFromNrpsUrl('')).toBeNull();
      expect(extractCourseIdFromNrpsUrl('https://canvas.example/nrps')).toBeNull();
    });

    it('extracts course id from Canvas names_and_roles URLs', () => {
      expect(
        extractCourseIdFromNrpsUrl('http://canvas.docker/api/lti/courses/1/names_and_roles'),
      ).toBe(1);
      expect(
        extractCourseIdFromNrpsUrl(
          'https://school.instructure.com/api/lti/courses/123/names_and_roles?per_page=50',
        ),
      ).toBe(123);
    });
  });

  describe('parseNrpsMembershipContainer', () => {
    it('maps IMS NRPS fields into LmsRosterResponse', () => {
      const parsed = parseNrpsMembershipContainer({
        context: { id: '123', label: 'BIO101', title: 'Intro Biology' },
        members: [
          {
            user_id: 'u-1',
            name: 'Ada',
            email: 'ada@school.edu',
            roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
          },
        ],
      });

      expect(parsed.context).toEqual({
        id: '123',
        label: 'BIO101',
        title: 'Intro Biology',
      });
      expect(parsed.members).toEqual([
        {
          userId: 'u-1',
          name: 'Ada',
          email: 'ada@school.edu',
          roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
        },
      ]);
    });

    it('coerces numeric ids and filters non-string roles', () => {
      const parsed = parseNrpsMembershipContainer({
        context: { id: 7, label: 'LAB', title: 'Lab' },
        members: [
          {
            user_id: 42,
            name: 'Pat',
            email: null,
            roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner', 123, null],
          },
        ],
      });

      expect(parsed.context.id).toBe('7');
      expect(parsed.members[0].userId).toBe('42');
      expect(parsed.members[0].email).toBeNull();
      expect(parsed.members[0].roles).toEqual([
        'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
      ]);
    });

    it('returns empty members when members is missing', () => {
      const parsed = parseNrpsMembershipContainer({
        context: { id: '99', title: 'Empty Course' },
      });

      expect(parsed.context.title).toBe('Empty Course');
      expect(parsed.members).toEqual([]);
    });
  });
});
