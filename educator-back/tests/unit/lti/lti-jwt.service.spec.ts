import { createPrivateKey, createSign, generateKeyPairSync } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { OutboundHttpClient } from '../../../src/common/services';
import { createOutboundHttpStub } from '../helpers/outbound-http.stub';
import { LtiJwtService } from '../../../src/lti/lti-jwt.service';
import { LmsConfigService } from '../../../src/lms/services/lms-config.service';

import { LmsConfigStatus, LmsToolType, LmsType } from '../../../src/common/enums/lms.enum';
import * as jose from 'jose';
import type { JWTPayload, JWK } from 'jose';
import { LmsSchoolConfig } from 'src/database/entities';
import { LoggerService } from '../../../src/common/services';

function signRs256Jwt(
  payload: Record<string, unknown>,
  privateKeyPem: string,
  kid: string,
): string {
  const header = { alg: 'RS256', kid, typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${headerB64}.${payloadB64}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(createPrivateKey(privateKeyPem), 'base64url');
  return `${signingInput}.${signature}`;
}

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
        { provide: OutboundHttpClient, useValue: createOutboundHttpStub().client },
        {
          provide: LmsConfigService,
          useValue: mockLmsConfigService,
        },
        {
          provide: LoggerService,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            verbose: jest.fn(),
            fatal: jest.fn(),
          },
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

    it('should accept Canvas-style numeric aud when expected client id is a string', async () => {
      const canvasConfig = {
        ...mockSchoolConfig,
        lmsType: LmsType.CANVAS,
        issuer: 'http://canvas.docker',
        clientId: '10000000000002',
        jwksUrl: 'http://canvas.docker/api/lti/security/jwks',
      };
      lmsConfigService.findByIssuer.mockResolvedValue(canvasConfig);

      const validPayload = {
        iss: 'http://canvas.docker',
        sub: 'canvas-user-1',
        aud: 10000000000002,
        azp: '10000000000002',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
      };

      const header = { alg: 'RS256', kid: 'test-kid' };
      const validToken = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(validPayload)).toString('base64url')}.fakesignature`;

      jest
        .spyOn(jose, 'jwtVerify')
        .mockResolvedValue(mockJwtVerifyResult(validPayload as unknown as JWTPayload));

      const result = await service.verifyIdToken(validToken, undefined, '10000000000002');

      expect(result.sub).toBe('canvas-user-1');
      expect(jose.jwtVerify).toHaveBeenCalledWith(
        validToken,
        expect.anything() as jose.JWTVerifyGetKey,
        expect.not.objectContaining({
          audience: expect.anything() as string,
        }) as jose.JWTVerifyOptions,
      );
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

      jest
        .spyOn(jose, 'jwtVerify')
        .mockResolvedValue(mockJwtVerifyResult(payloadWithWrongDeployment));

      await expect(
        service.verifyIdToken(fakeToken, undefined, undefined, 'expected-deployment'),
      ).rejects.toThrow('Deployment ID mismatch');
    });

    it('should reject JWT missing deployment_id when expected deployment is configured', async () => {
      lmsConfigService.findByIssuer.mockResolvedValue({
        ...mockSchoolConfig,
        issuer: 'https://canvas.test.instructure.com',
        deploymentId: '7:d8f3a2b1c0e9',
        jwksUrl: 'https://canvas.test.instructure.com/api/lti/security/jwks',
      });

      const payloadMissingDeployment = {
        iss: 'https://canvas.test.instructure.com',
        sub: 'canvas-user-1',
        aud: ['10000000000001'],
        azp: '10000000000001',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
      };

      const header = { alg: 'RS256', kid: 'test-kid' };
      const fakeToken = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payloadMissingDeployment)).toString('base64url')}.fakesignature`;

      jest
        .spyOn(jose, 'jwtVerify')
        .mockResolvedValue(mockJwtVerifyResult(payloadMissingDeployment));

      await expect(
        service.verifyIdToken(fakeToken, undefined, undefined, '7:d8f3a2b1c0e9'),
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

      jest
        .spyOn(jose, 'jwtVerify')
        .mockResolvedValue(mockJwtVerifyResult(payloadWithCorrectDeployment));

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

      jest
        .spyOn(jose, 'jwtVerify')
        .mockResolvedValue(mockJwtVerifyResult(payloadWithoutDeployment));

      const result = await service.verifyIdToken(validToken);

      expect(result).toEqual(payloadWithoutDeployment);
    });

    it('should fall back to Node crypto for local Canvas JWKS with RSA <2048', async () => {
      // Canvas Docker often ships 512-bit LTI keys that jose rejects.
      const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 512 });
      const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      const jwk = publicKey.export({ format: 'jwk' }) as JWK;
      jwk.kid = 'canvas-local-kid';
      jwk.alg = 'RS256';
      jwk.use = 'sig';

      const canvasConfig = {
        ...mockSchoolConfig,
        lmsType: LmsType.CANVAS,
        issuer: 'http://canvas.docker',
        clientId: '10000000000002',
        jwksUrl: 'http://canvas.docker/api/lti/security/jwks',
        lmsBaseUrl: 'http://canvas.docker',
      };
      lmsConfigService.findByIssuer.mockResolvedValue(canvasConfig);

      const validPayload = {
        iss: 'http://canvas.docker',
        sub: 'canvas-user-1',
        aud: '10000000000002',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
      };
      const validToken = signRs256Jwt(validPayload, privateKeyPem, 'canvas-local-kid');

      jest
        .spyOn(jose, 'jwtVerify')
        .mockRejectedValue(new Error('RS256 requires key modulusLength to be 2048 bits or larger'));

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ keys: [jwk] }),
      });
      const originalFetch = global.fetch;
      global.fetch = fetchMock;

      try {
        const result = await service.verifyIdToken(validToken, undefined, '10000000000002');

        expect(result.sub).toBe('canvas-user-1');
        expect(fetchMock).toHaveBeenCalledWith('http://canvas.docker/api/lti/security/jwks');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should not fall back for Moodle when jose rejects weak RSA keys', async () => {
      lmsConfigService.findByIssuer.mockResolvedValue(mockSchoolConfig);

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
      const token = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.fakesignature`;

      jest
        .spyOn(jose, 'jwtVerify')
        .mockRejectedValue(new Error('RS256 requires key modulusLength to be 2048 bits or larger'));

      await expect(service.verifyIdToken(token)).rejects.toThrow(/modulusLength/);
    });
  });
});
