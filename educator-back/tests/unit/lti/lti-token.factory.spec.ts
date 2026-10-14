/**
 * LTI token factory helper tests.
 *
 * Validates fake JWT structure used by LTI HTTP integration tests.
 * Not an end-to-end launch test — see tests/integration/lti/lti-http-endpoints.integration.spec.ts.
 */

import { LtiTokenFactory, decodeFakeJwt } from '../../integration/lti/helpers/lti-token.factory';

const ISSUER = 'https://moodle.test.edu';
const CLIENT_ID = 'test-client-id';

describe('LtiTokenFactory', () => {
  describe('Educator tokens', () => {
    it('should generate valid educator launch tokens', () => {
      const token = LtiTokenFactory.buildEducatorLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        email: 'educator@test.com',
        courseId: '42',
        courseTitle: 'Test Course',
      });

      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3);

      const payload = decodeFakeJwt(token);
      expect(payload.iss).toBe(ISSUER);
      expect(payload.aud).toBe(CLIENT_ID);
      expect(payload.email).toBe('educator@test.com');
      expect(payload['https://purl.imsglobal.org/spec/lti/claim/context']).toEqual({
        id: '42',
        title: 'Test Course',
        label: 'test',
      });
    });

    it('should include all required LTI 1.3 claims', () => {
      const token = LtiTokenFactory.buildEducatorLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        email: 'test@example.com',
        courseId: '100',
        courseTitle: 'Sample Course',
        nrpsUrl:
          'https://moodle.test.edu/mod/lti/services.php/CourseSection/100/bindings/1/memberships',
      });

      const payload = decodeFakeJwt(token);

      expect(payload.iss).toBe(ISSUER);
      expect(payload.aud).toBe(CLIENT_ID);
      expect(payload.sub).toBeDefined();
      expect(payload.exp).toBeDefined();
      expect(payload.iat).toBeDefined();
      expect(payload.nonce).toBeDefined();

      expect(payload['https://purl.imsglobal.org/spec/lti/claim/message_type']).toBe(
        'LtiResourceLinkRequest',
      );
      expect(payload['https://purl.imsglobal.org/spec/lti/claim/version']).toBe('1.3.0');
      expect(payload['https://purl.imsglobal.org/spec/lti/claim/roles']).toContain(
        'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
      );

      const context = payload['https://purl.imsglobal.org/spec/lti/claim/context'] as Record<
        string,
        unknown
      >;
      expect(context.id).toBe('100');
      expect(context.title).toBe('Sample Course');

      const nrps = payload[
        'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice'
      ] as Record<string, unknown>;
      expect(nrps.context_memberships_url).toContain('memberships');
    });

    it('should support custom claim values', () => {
      const customNonce = 'custom-nonce-123';
      const customSub = 'custom-sub-456';
      const customDeploymentId = 'deployment-789';

      const token = LtiTokenFactory.buildEducatorLaunchToken({
        nonce: customNonce,
        sub: customSub,
        deploymentId: customDeploymentId,
      });

      const payload = decodeFakeJwt(token);
      expect(payload.nonce).toBe(customNonce);
      expect(payload.sub).toBe(customSub);
      expect(payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id']).toBe(
        customDeploymentId,
      );
    });
  });

  describe('Student tokens', () => {
    it('should generate valid student launch tokens', () => {
      const token = LtiTokenFactory.buildStudentLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        email: 'student@test.com',
        courseId: '42',
      });

      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3);

      const payload = decodeFakeJwt(token);
      expect(payload.iss).toBe(ISSUER);
      expect(payload['https://purl.imsglobal.org/spec/lti/claim/roles']).toContain(
        'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
      );
    });

    it('should differentiate between educator and student roles', () => {
      const instructorToken = LtiTokenFactory.buildEducatorLaunchToken({
        roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
      });

      const learnerToken = LtiTokenFactory.buildStudentLaunchToken({
        roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
      });

      const instructorPayload = decodeFakeJwt(instructorToken);
      const learnerPayload = decodeFakeJwt(learnerToken);

      const instructorRoles = instructorPayload[
        'https://purl.imsglobal.org/spec/lti/claim/roles'
      ] as string[];
      const learnerRoles = learnerPayload[
        'https://purl.imsglobal.org/spec/lti/claim/roles'
      ] as string[];

      expect(instructorRoles.some((r) => r.includes('Instructor'))).toBe(true);
      expect(learnerRoles.some((r) => r.includes('Learner'))).toBe(true);
      expect(instructorRoles.some((r) => r.includes('Learner'))).toBe(false);
      expect(learnerRoles.some((r) => r.includes('Instructor'))).toBe(false);
    });
  });

  describe('Canvas tokens', () => {
    it('should generate Canvas educator tokens with NRPS names_and_roles URL', () => {
      const token = LtiTokenFactory.buildCanvasEducatorLaunchToken({
        email: 'teacher@school.edu',
        courseId: '123',
      });

      const payload = decodeFakeJwt(token);
      expect(payload.iss).toBe('https://canvas.test.instructure.com');
      expect(payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id']).toBeDefined();
      expect(payload.email).toBe('teacher@school.edu');

      const nrps = payload[
        'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice'
      ] as Record<string, unknown>;
      expect(nrps.context_memberships_url).toBe(
        'https://canvas.test.instructure.com/api/lti/courses/123/names_and_roles',
      );
    });

    it('should generate Canvas student tokens without NRPS claim', () => {
      const token = LtiTokenFactory.buildCanvasStudentLaunchToken();
      const payload = decodeFakeJwt(token);

      expect(payload.iss).toBe('https://canvas.test.instructure.com');
      expect(payload['https://purl.imsglobal.org/spec/lti/claim/roles']).toContain(
        'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
      );
      expect(
        payload['https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice'],
      ).toBeUndefined();
    });

    it('should support Canvas aud array + azp on educator tokens', () => {
      const token = LtiTokenFactory.buildCanvasEducatorLaunchToken({
        clientId: '10000000000099',
        audAsArray: true,
      });
      const payload = decodeFakeJwt(token);

      expect(payload.aud).toEqual(['10000000000099']);
      expect(payload.azp).toBe('10000000000099');
    });
  });

  describe('JWT structure', () => {
    it('should generate tokens with valid JWT structure', () => {
      const token = LtiTokenFactory.buildEducatorLaunchToken();
      const parts = token.split('.');

      expect(parts).toHaveLength(3);
      expect(parts[0]).toBeTruthy();
      expect(parts[1]).toBeTruthy();
      expect(parts[2]).toBeTruthy();
    });

    it('should use base64url encoding for token parts', () => {
      const token = LtiTokenFactory.buildEducatorLaunchToken({
        email: 'test+user@example.com',
      });

      expect(token).not.toContain('+');
      expect(token).not.toContain('/');
      expect(token).not.toMatch(/=+$/);
    });

    it('should generate unique nonces for each token', async () => {
      const token1 = LtiTokenFactory.buildEducatorLaunchToken();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const token2 = LtiTokenFactory.buildEducatorLaunchToken();

      const payload1 = decodeFakeJwt(token1);
      const payload2 = decodeFakeJwt(token2);

      expect(payload1.nonce).toBeDefined();
      expect(payload2.nonce).toBeDefined();
      expect(payload1.nonce).not.toBe(payload2.nonce);
    });

    it('should set expiration time in the future', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = LtiTokenFactory.buildEducatorLaunchToken();
      const payload = decodeFakeJwt(token);

      expect(typeof payload.exp).toBe('number');
      expect(payload.exp).toBeGreaterThan(now);
      expect(payload.exp).toBeLessThanOrEqual(now + 600);
    });
  });
});
