import { BadRequestException } from '@nestjs/common';
import { LmsConfigStatus, LmsToolType, LmsType } from '../../../src/common/enums/lms.enum';
import { LmsSchoolConfig } from '../../../src/database/entities';
import {
  assertNrpsUrlAllowed,
  assertSafeLmsOutboundUrl,
  collectAllowedLmsHosts,
  isBlockedLmsOutboundHost,
  isNrpsUrlAllowed,
} from '../../../src/lms/utils/lms-url.util';

function buildConfig(overrides: Partial<LmsSchoolConfig> = {}): LmsSchoolConfig {
  return {
    id: 'config-1',
    schoolId: 'school-1',
    toolType: LmsToolType.EDUCATOR,
    lmsType: LmsType.MOODLE,
    issuer: 'https://moodle.example.edu',
    clientId: 'client-1',
    deploymentId: null,
    authEndpoint: 'https://moodle.example.edu/mod/lti/auth.php',
    tokenEndpoint: 'https://moodle.example.edu/mod/lti/token.php',
    jwksUrl: 'https://moodle.example.edu/mod/lti/certs.php',
    platformPrivateKeyPem: null,
    platformKeyId: null,
    status: LmsConfigStatus.ACTIVE,
    sharePii: true,
    lmsBaseUrl: 'https://moodle.example.edu',
    lmsApiToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as LmsSchoolConfig;
}

describe('lms-url.util NRPS allowlist', () => {
  describe('collectAllowedLmsHosts', () => {
    it('collects hosts from issuer, endpoints, and base URL', () => {
      const hosts = collectAllowedLmsHosts(buildConfig());
      expect(hosts.has('moodle.example.edu')).toBe(true);
    });
  });

  describe('isBlockedLmsOutboundHost', () => {
    it.each([
      'localhost',
      'metadata.google.internal',
      '127.0.0.1',
      '10.0.0.5',
      '192.168.1.1',
      '172.16.0.1',
      '169.254.169.254',
      '::1',
    ])('blocks %s', (host) => {
      expect(isBlockedLmsOutboundHost(host)).toBe(true);
    });

    it('allows public LMS hostnames', () => {
      expect(isBlockedLmsOutboundHost('moodle.example.edu')).toBe(false);
      expect(isBlockedLmsOutboundHost('canvas.instructure.com')).toBe(false);
    });
  });

  describe('assertSafeLmsOutboundUrl', () => {
    it('rejects non-HTTPS URLs', () => {
      expect(() => assertSafeLmsOutboundUrl('http://moodle.example.edu/nrps')).toThrow(
        BadRequestException,
      );
    });

    it('rejects private/metadata IP literals', () => {
      expect(() => assertSafeLmsOutboundUrl('https://169.254.169.254/latest/meta-data')).toThrow(
        BadRequestException,
      );
    });

    it('allows HTTPS public hosts', () => {
      expect(() =>
        assertSafeLmsOutboundUrl('https://moodle.example.edu/mod/lti/services.php/1/memberships'),
      ).not.toThrow();
    });
  });

  describe('assertNrpsUrlAllowed', () => {
    const config = buildConfig();

    it('allows NRPS URL on an allowlisted LMS host', () => {
      expect(() =>
        assertNrpsUrlAllowed(
          'https://moodle.example.edu/mod/lti/services.php/42/memberships',
          config,
        ),
      ).not.toThrow();
      expect(
        isNrpsUrlAllowed('https://moodle.example.edu/mod/lti/services.php/42/memberships', config),
      ).toBe(true);
    });

    it('rejects NRPS URL on an external host', () => {
      expect(() => assertNrpsUrlAllowed('https://evil.example/steal', config)).toThrow(
        BadRequestException,
      );
      expect(isNrpsUrlAllowed('https://evil.example/steal', config)).toBe(false);
    });

    it('rejects HTTP even when host matches config', () => {
      expect(() =>
        assertNrpsUrlAllowed(
          'http://moodle.example.edu/mod/lti/services.php/1/memberships',
          config,
        ),
      ).toThrow(BadRequestException);
    });
  });
});
