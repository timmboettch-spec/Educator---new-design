import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { LtiJwtService } from '../../../src/lti/lti-jwt.service';
import { LmsConfigService } from '../../../src/lms/services/lms-config.service';
import { LmsSchoolConfig } from '../../../src/lms/entity/lms-school-config.entity';
import { LmsConfigStatus, LmsToolType, LmsType } from '../../../src/common/enums/lms.enum';
import * as jose from 'jose';
import type { JWTPayload } from 'jose';

function mockJwtVerifyResult(payload: JWTPayload): Awaited<ReturnType<typeof jose.jwtVerify>> {
  return {
    payload,
    protectedHeader: { alg: 'RS256', kid: 'test-kid' },
  } as Awaited<ReturnType<typeof jose.jwtVerify>>;
}

describe('LtiJwtService', () => {
  let service: LtiJwtService;
  let lmsConfigService: jest.Mocked<LmsConfigService>;

  const mockSchoolConfig: LmsSchoolConfig = {
    id: 'config-1',
    schoolId: 'school-1',
    toolType: LmsToolType.EDUCATOR,
    lmsType: LmsType.MOODLE,
    issuer: 'https://moodle.test.edu',
    clientId: 'test-client-id',
    deploymentId: null,
    authEndpoint: 'https://moodle.test.edu/mod/lti/auth.php',
    tokenEndpoint: 'https://moodle.test.edu/mod/lti/token.php',
    jwksUrl: 'https://moodle.test.edu/mod/lti/certs.php',
    platformPrivateKeyPem: 'fake-pem',
    platformKeyId: 'test-kid',
    status: LmsConfigStatus.ACTIVE,
    sharePii: true,
    lmsBaseUrl: 'https://moodle.test.edu',
    lmsApiToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockLmsConfigService = {
      findByIssuer: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LtiJwtService,
        {
          provide: LmsConfigService,
          useValue: mockLmsConfigService,
        },
      ],
    }).compile();

    service = module.get<LtiJwtService>(LtiJwtService);
    lmsConfigService = module.get(LmsConfigService);
  });

  describe('verifyIdToken', () => {
    it('should reject missing id_token', async () => {
      await expect(service.verifyIdToken('', 'https://moodle.test.edu')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject malformed JWT', async () => {
      await expect(service.verifyIdToken('not.a.jwt', 'https://moodle.test.edu')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject JWT with missing issuer', async () => {
      // Create a JWT with no iss claim (just base64 encode a payload, no signature)
      const payload = { sub: 'user123' };
      const fakeToken = `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;

      await expect(service.verifyIdToken(fakeToken)).rejects.toThrow('Missing issuer');
    });

    it('should reject JWT from unknown issuer', async () => {
      lmsConfigService.findByIssuer.mockResolvedValue(null);

      const payload = { iss: 'https://unknown.platform', sub: 'user123' };
      const fakeToken = `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;

      await expect(service.verifyIdToken(fakeToken)).rejects.toThrow('Unknown LTI platform issuer');
    });

    it('should reject JWT with invalid signature', async () => {
      lmsConfigService.findByIssuer.mockResolvedValue(mockSchoolConfig);

      // Create a token with valid structure but invalid/missing signature
      // jose.jwtVerify will fail because we can't hit the real JWKS
      const payload = {
        iss: 'https://moodle.test.edu',
        sub: 'user123',
        aud: 'test-client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
      };
      const header = { alg: 'RS256', kid: 'test-kid' };
      const fakeToken = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.fakesignature`;

      await expect(service.verifyIdToken(fakeToken)).rejects.toThrow(UnauthorizedException);
    });

    it('should reject JWT missing LTI message_type', async () => {
      lmsConfigService.findByIssuer.mockResolvedValue(mockSchoolConfig);

      const validPayload = {
        iss: 'https://moodle.test.edu',
        sub: 'user123',
        aud: 'test-client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        // Missing message_type
      };

      // Create a well-formed JWT structure for quickDecode to work
      const header = { alg: 'RS256', kid: 'test-kid' };
      const fakeToken = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(validPayload)).toString('base64url')}.fakesignature`;

      // Mock jwtVerify to return payload missing message_type
      jest.spyOn(jose, 'jwtVerify').mockResolvedValue(mockJwtVerifyResult(validPayload));

      await expect(service.verifyIdToken(fakeToken)).rejects.toThrow('Missing LTI message_type');
    });

    it('should successfully verify valid LTI token with all claims', async () => {
      lmsConfigService.findByIssuer.mockResolvedValue(mockSchoolConfig);

      const validPayload = {
        iss: 'https://moodle.test.edu',
        sub: 'user123',
        aud: 'test-client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
        'https://purl.imsglobal.org/spec/lti/claim/deployment_id': 'deployment-1',
        'https://purl.imsglobal.org/spec/lti/claim/resource_link': { id: 'resource-1' },
      };

      // Create well-formed token
      const header = { alg: 'RS256', kid: 'test-kid' };
      const validToken = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(validPayload)).toString('base64url')}.fakesignature`;

      jest.spyOn(jose, 'jwtVerify').mockResolvedValue(mockJwtVerifyResult(validPayload));

      const result = await service.verifyIdToken(validToken);

      expect(result).toEqual(validPayload);
      expect(lmsConfigService.findByIssuer.mock.calls).toEqual([['https://moodle.test.edu']]);
    });

    it('should verify token with expectedIssuer parameter', async () => {
      lmsConfigService.findByIssuer.mockResolvedValue(mockSchoolConfig);

      const validPayload = {
        iss: 'https://moodle.test.edu',
        sub: 'user123',
        aud: 'test-client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
      };

      // Create well-formed token
      const header = { alg: 'RS256', kid: 'test-kid' };
      const validToken = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(validPayload)).toString('base64url')}.fakesignature`;

      jest.spyOn(jose, 'jwtVerify').mockResolvedValue(mockJwtVerifyResult(validPayload));

      await service.verifyIdToken(validToken, 'https://moodle.test.edu', 'test-client-id');

      expect(lmsConfigService.findByIssuer.mock.calls).toEqual([['https://moodle.test.edu']]);
    });

    it('should reject JWT with wrong deployment_id when expected deployment is configured', async () => {
      const configWithDeployment = {
        ...mockSchoolConfig,
        deploymentId: 'expected-deployment',
      };
      lmsConfigService.findByIssuer.mockResolvedValue(configWithDeployment);

      const payloadWithWrongDeployment = {
        iss: 'https://moodle.test.edu',
        sub: 'user123',
        aud: 'test-client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
        'https://purl.imsglobal.org/spec/lti/claim/deployment_id': 'wrong-deployment',
      };

      const header = { alg: 'RS256', kid: 'test-kid' };
      const fakeToken = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payloadWithWrongDeployment)).toString('base64url')}.fakesignature`;

      jest.spyOn(jose, 'jwtVerify').mockResolvedValue(mockJwtVerifyResult(payloadWithWrongDeployment));

      await expect(
        service.verifyIdToken(fakeToken, undefined, undefined, 'expected-deployment'),
      ).rejects.toThrow('Deployment ID mismatch');
    });

    it('should accept JWT with correct deployment_id', async () => {
      const configWithDeployment = {
        ...mockSchoolConfig,
        deploymentId: 'correct-deployment',
      };
      lmsConfigService.findByIssuer.mockResolvedValue(configWithDeployment);

      const payloadWithCorrectDeployment = {
        iss: 'https://moodle.test.edu',
        sub: 'user123',
        aud: 'test-client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
        'https://purl.imsglobal.org/spec/lti/claim/deployment_id': 'correct-deployment',
      };

      const header = { alg: 'RS256', kid: 'test-kid' };
      const validToken = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payloadWithCorrectDeployment)).toString('base64url')}.fakesignature`;

      jest.spyOn(jose, 'jwtVerify').mockResolvedValue(mockJwtVerifyResult(payloadWithCorrectDeployment));

      const result = await service.verifyIdToken(
        validToken,
        undefined,
        undefined,
        'correct-deployment',
      );

      expect(result['https://purl.imsglobal.org/spec/lti/claim/deployment_id']).toBe(
        'correct-deployment',
      );
    });

    it('should accept JWT without deployment_id when none expected', async () => {
      lmsConfigService.findByIssuer.mockResolvedValue(mockSchoolConfig);

      const payloadWithoutDeployment = {
        iss: 'https://moodle.test.edu',
        sub: 'user123',
        aud: 'test-client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
      };

      const header = { alg: 'RS256', kid: 'test-kid' };
      const validToken = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payloadWithoutDeployment)).toString('base64url')}.fakesignature`;

      jest.spyOn(jose, 'jwtVerify').mockResolvedValue(mockJwtVerifyResult(payloadWithoutDeployment));

      const result = await service.verifyIdToken(validToken);

      expect(result).toEqual(payloadWithoutDeployment);
    });
  });
});
