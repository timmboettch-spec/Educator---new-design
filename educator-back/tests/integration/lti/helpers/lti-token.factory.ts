/**
 * LTI Token Factory for Integration Tests
 *
 * Generates fake LTI 1.3 launch tokens with realistic claim structure.
 * Tokens are unsigned (mock JWT format) since cryptographic verification
 * is mocked at the service layer.
 */

import {
  buildCanvasEducatorLaunchPayload,
  buildCanvasStudentLaunchPayload,
} from '../../../unit/lms/fixtures/canvas-lti-launch.fixtures';

export class LtiTokenFactory {
  /**
   * Build an unsigned fake JWT for educator launch testing.
   * Returns a base64url-encoded header.payload.signature string.
   */
  static buildEducatorLaunchToken(
    opts: {
      issuer?: string;
      sub?: string;
      email?: string;
      roles?: string[];
      courseId?: string;
      courseTitle?: string;
      nrpsUrl?: string;
      clientId?: string;
      deploymentId?: string;
      nonce?: string;
      iat?: number;
      exp?: number;
    } = {},
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const issuer = opts.issuer ?? 'https://moodle.test.edu';
    const clientId = opts.clientId ?? 'test-client-id';
    const roles = opts.roles ?? ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'];

    const payload: Record<string, unknown> = {
      iss: issuer,
      sub: opts.sub ?? 'moodle-user-123',
      aud: clientId,
      exp: opts.exp ?? now + 300,
      iat: opts.iat ?? now,
      nonce: opts.nonce ?? `test-nonce-${Date.now()}`,
      'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
      'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
      'https://purl.imsglobal.org/spec/lti/claim/roles': roles,
      'https://purl.imsglobal.org/spec/lti/claim/context': {
        id: opts.courseId ?? '42',
        title: opts.courseTitle ?? 'Test Course',
        label: 'test',
      },
    };

    if (opts.deploymentId) {
      payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id'] = opts.deploymentId;
    }

    if (opts.email) {
      payload.email = opts.email;
    }

    // Default to including NRPS URL unless explicitly set to empty string
    if (opts.nrpsUrl !== '') {
      payload['https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice'] = {
        context_memberships_url:
          opts.nrpsUrl ?? 'https://moodle.test.edu/mod/lti/services.php/nrps',
      };
    }

    return encodeFakeJwt(payload);
  }

  /**
   * Build an unsigned fake JWT for student launch testing.
   */
  static buildStudentLaunchToken(
    opts: {
      issuer?: string;
      sub?: string;
      email?: string;
      roles?: string[];
      courseId?: string;
      courseTitle?: string;
      clientId?: string;
      deploymentId?: string;
      nonce?: string;
      iat?: number;
      exp?: number;
    } = {},
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const issuer = opts.issuer ?? 'https://moodle.test.edu';
    const clientId = opts.clientId ?? 'test-client-id';
    const roles = opts.roles ?? ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'];

    const payload: Record<string, unknown> = {
      iss: issuer,
      sub: opts.sub ?? 'moodle-student-456',
      aud: clientId,
      exp: opts.exp ?? now + 300,
      iat: opts.iat ?? now,
      nonce: opts.nonce ?? `test-nonce-${Date.now()}`,
      'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
      'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
      'https://purl.imsglobal.org/spec/lti/claim/roles': roles,
      'https://purl.imsglobal.org/spec/lti/claim/context': {
        id: opts.courseId ?? '42',
        title: opts.courseTitle ?? 'Test Course',
        label: 'test',
      },
    };

    if (opts.deploymentId) {
      payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id'] = opts.deploymentId;
    }

    if (opts.email) {
      payload.email = opts.email;
    }

    return encodeFakeJwt(payload);
  }

  /**
   * Canvas Test-env educator launch token (unsigned).
   * Defaults: canvas.test.instructure.com issuer, Canvas NRPS URL, deployment_id.
   */
  static buildCanvasEducatorLaunchToken(
    opts: {
      issuer?: string;
      sub?: string;
      email?: string;
      name?: string;
      roles?: string[];
      courseId?: string;
      courseTitle?: string;
      courseLabel?: string;
      nrpsUrl?: string;
      clientId?: string;
      audAsArray?: boolean;
      deploymentId?: string | null;
      nonce?: string;
      iat?: number;
      exp?: number;
    } = {},
  ): string {
    return encodeFakeJwt(buildCanvasEducatorLaunchPayload(opts));
  }

  /**
   * Canvas Test-env student launch token (unsigned).
   */
  static buildCanvasStudentLaunchToken(
    opts: {
      issuer?: string;
      sub?: string;
      email?: string;
      name?: string;
      roles?: string[];
      courseId?: string;
      courseTitle?: string;
      courseLabel?: string;
      clientId?: string;
      audAsArray?: boolean;
      deploymentId?: string | null;
      nonce?: string;
      iat?: number;
      exp?: number;
    } = {},
  ): string {
    return encodeFakeJwt(buildCanvasStudentLaunchPayload(opts));
  }

  /**
   * Build an unsigned fake JWT for Deep Linking request testing.
   */
  static buildDeepLinkingRequestToken(
    opts: {
      issuer?: string;
      sub?: string;
      email?: string;
      roles?: string[];
      courseId?: string;
      courseTitle?: string;
      clientId?: string;
      deploymentId?: string;
      deepLinkReturnUrl?: string;
      acceptTypes?: string[];
      acceptMultiple?: boolean;
      dataToken?: string;
      nonce?: string;
      iat?: number;
      exp?: number;
    } = {},
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const issuer = opts.issuer ?? 'https://moodle.test.edu';
    const clientId = opts.clientId ?? 'test-client-id';
    const roles = opts.roles ?? ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'];

    const payload: Record<string, unknown> = {
      iss: issuer,
      sub: opts.sub ?? 'moodle-user-123',
      aud: clientId,
      exp: opts.exp ?? now + 300,
      iat: opts.iat ?? now,
      nonce: opts.nonce ?? `test-nonce-${Date.now()}`,
      'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiDeepLinkingRequest',
      'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
      'https://purl.imsglobal.org/spec/lti/claim/roles': roles,
      'https://purl.imsglobal.org/spec/lti/claim/context': {
        id: opts.courseId ?? '42',
        title: opts.courseTitle ?? 'Test Course',
        label: 'test',
      },
      'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings': {
        deep_link_return_url:
          opts.deepLinkReturnUrl ?? 'https://moodle.test.edu/mod/lti/contentitem/return.php',
        accept_types: opts.acceptTypes ?? ['ltiResourceLink'],
        accept_multiple: opts.acceptMultiple ?? true,
        ...(opts.dataToken && { data: opts.dataToken }),
      },
    };

    if (opts.deploymentId) {
      payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id'] = opts.deploymentId;
    }

    if (opts.email) {
      payload.email = opts.email;
    }

    return encodeFakeJwt(payload);
  }

  /**
   * Build a student launch token with custom simulation_id parameter.
   */
  static buildStudentLaunchWithSimulation(
    opts: {
      issuer?: string;
      sub?: string;
      email?: string;
      roles?: string[];
      courseId?: string;
      simulationId: string;
      resourceLinkId?: string;
      clientId?: string;
      deploymentId?: string;
    },
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const issuer = opts.issuer ?? 'https://moodle.test.edu';
    const clientId = opts.clientId ?? 'test-client-id';
    const roles = opts.roles ?? ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'];

    const payload: Record<string, unknown> = {
      iss: issuer,
      sub: opts.sub ?? 'moodle-student-456',
      aud: clientId,
      exp: now + 300,
      iat: now,
      nonce: `test-nonce-${Date.now()}`,
      'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
      'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
      'https://purl.imsglobal.org/spec/lti/claim/roles': roles,
      'https://purl.imsglobal.org/spec/lti/claim/context': {
        id: opts.courseId ?? '42',
        title: 'Test Course',
        label: 'test',
      },
      'https://purl.imsglobal.org/spec/lti/claim/resource_link': {
        id: opts.resourceLinkId ?? `resource-link-${Date.now()}`,
      },
      'https://purl.imsglobal.org/spec/lti/claim/custom': {
        custom_simulation_id: opts.simulationId,
      },
    };

    if (opts.deploymentId) {
      payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id'] = opts.deploymentId;
    }

    if (opts.email) {
      payload.email = opts.email;
    }

    return encodeFakeJwt(payload);
  }
}

/**
 * Encode a payload as a fake JWT (header.payload.signature).
 * Not cryptographically signed - used only for testing.
 */
function encodeFakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-kid' })).toString(
    'base64url',
  );
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.test-signature`;
}

/**
 * Decode a fake JWT for testing purposes.
 * Returns the payload only.
 */
export function decodeFakeJwt(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2) {
    throw new Error('Invalid fake JWT');
  }
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
}
