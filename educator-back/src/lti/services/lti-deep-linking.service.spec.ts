import { LtiDeepLinkingService } from './lti-deep-linking.service';
import { LoggerService } from '../../common/services';
import { LmsSchoolConfig } from '../../database/entities';
import { decodeJwt } from 'jose';
import { generateKeyPairSync } from 'crypto';

describe('LtiDeepLinkingService', () => {
  let service: LtiDeepLinkingService;
  let mockLogger: jest.Mocked<LoggerService>;
  let testKeyPair: { publicKey: string; privateKey: string };
  let mockSchoolConfig: LmsSchoolConfig;

  beforeAll(() => {
    // Generate a test RSA key pair for JWT signing
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    testKeyPair = { publicKey, privateKey };
  });

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      fatal: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;

    service = new LtiDeepLinkingService(mockLogger);

    mockSchoolConfig = {
      platformPrivateKeyPem: testKeyPair.privateKey,
      platformKeyId: 'test-key-id-123',
    } as LmsSchoolConfig;
  });

  describe('signDeepLinkingResponse', () => {
    it('should sign a Deep Linking response JWT with required claims', async () => {
      const contentItems = [
        {
          type: 'ltiResourceLink' as const,
          title: 'Test Simulation',
          url: 'https://app.example.com/lti/studentlaunch',
          custom: { custom_simulation_id: 'sim-123' },
        },
      ];

      const jwt = await service.signDeepLinkingResponse({
        issuer: 'https://lms.example.com',
        clientId: 'client-abc',
        deploymentId: 'deploy-1',
        contentItems,
        schoolConfig: mockSchoolConfig,
      });

      expect(jwt).toBeTruthy();
      expect(typeof jwt).toBe('string');

      // Decode and verify structure (not signature verification in unit test)
      const decoded = decodeJwt(jwt);

      expect(decoded.iss).toBe('client-abc'); // Tool is issuer in DL response
      expect(decoded.aud).toBe('https://lms.example.com');
      expect(decoded['https://purl.imsglobal.org/spec/lti/claim/message_type']).toBe(
        'LtiDeepLinkingResponse',
      );
      expect(decoded['https://purl.imsglobal.org/spec/lti/claim/version']).toBe('1.3.0');
      expect(decoded['https://purl.imsglobal.org/spec/lti/claim/deployment_id']).toBe('deploy-1');
      expect(decoded['https://purl.imsglobal.org/spec/lti-dl/claim/content_items']).toEqual(
        contentItems,
      );

      expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(decoded.iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
      expect(decoded.nonce).toBeTruthy();
    });

    it('should include optional data claim when provided', async () => {
      const jwt = await service.signDeepLinkingResponse({
        issuer: 'https://lms.example.com',
        clientId: 'client-abc',
        deploymentId: 'deploy-1',
        contentItems: [],
        data: 'opaque-token-xyz',
        schoolConfig: mockSchoolConfig,
      });

      const decoded = decodeJwt(jwt);
      expect(decoded['https://purl.imsglobal.org/spec/lti-dl/claim/data']).toBe(
        'opaque-token-xyz',
      );
    });

    it('should include optional message claim when provided', async () => {
      const jwt = await service.signDeepLinkingResponse({
        issuer: 'https://lms.example.com',
        clientId: 'client-abc',
        deploymentId: 'deploy-1',
        contentItems: [],
        message: '3 simulations added successfully',
        schoolConfig: mockSchoolConfig,
      });

      const decoded = decodeJwt(jwt);
      expect(decoded['https://purl.imsglobal.org/spec/lti-dl/claim/msg']).toBe(
        '3 simulations added successfully',
      );
    });

    it('should include correct JWT header with kid', async () => {
      const jwt = await service.signDeepLinkingResponse({
        issuer: 'https://lms.example.com',
        clientId: 'client-abc',
        deploymentId: 'deploy-1',
        contentItems: [],
        schoolConfig: mockSchoolConfig,
      });

      // Decode protected header
      const [headerB64] = jwt.split('.');
      const header = JSON.parse(
        Buffer.from(headerB64, 'base64url').toString(),
      ) as { alg: string; typ: string; kid: string };

      expect(header.alg).toBe('RS256');
      expect(header.typ).toBe('JWT');
      expect(header.kid).toBe('test-key-id-123');
    });

    it('should log the number of content items', async () => {
      const contentItems = [
        { type: 'ltiResourceLink' as const, title: 'Sim 1', url: 'https://app.example.com/1' },
        { type: 'ltiResourceLink' as const, title: 'Sim 2', url: 'https://app.example.com/2' },
      ];

      await service.signDeepLinkingResponse({
        issuer: 'https://lms.example.com',
        clientId: 'client-abc',
        deploymentId: 'deploy-1',
        contentItems,
        schoolConfig: mockSchoolConfig,
      });

      expect(mockLogger.log.mock.calls[0]?.[0]).toBe(
        '[Deep Linking] Signed response JWT with 2 content item(s)',
      );
    });

    it('should handle multiple content items with line items', async () => {
      const contentItems = [
        {
          type: 'ltiResourceLink' as const,
          title: 'Simulation A',
          url: 'https://app.example.com/lti/studentlaunch',
          custom: { custom_simulation_id: 'sim-a' },
          lineItem: {
            scoreMaximum: 100,
            label: 'Simulation A Grade',
            resourceId: 'sim-a',
          },
        },
        {
          type: 'ltiResourceLink' as const,
          title: 'Simulation B',
          url: 'https://app.example.com/lti/studentlaunch',
          custom: { custom_simulation_id: 'sim-b' },
          lineItem: {
            scoreMaximum: 100,
            label: 'Simulation B Grade',
            resourceId: 'sim-b',
          },
        },
      ];

      const jwt = await service.signDeepLinkingResponse({
        issuer: 'https://lms.example.com',
        clientId: 'client-abc',
        deploymentId: 'deploy-1',
        contentItems,
        schoolConfig: mockSchoolConfig,
      });

      const decoded = decodeJwt(jwt);
      expect(decoded['https://purl.imsglobal.org/spec/lti-dl/claim/content_items']).toEqual(
        contentItems,
      );
    });
  });

  describe('generateReturnForm', () => {
    it('should generate HTML form with correct structure', () => {
      const returnUrl = 'https://lms.example.com/mod/lti/contentitem/return.php';
      const jwt = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';

      const html = service.generateReturnForm(returnUrl, jwt);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<form id="dlForm" method="POST"');
      expect(html).toContain(`action="${returnUrl}"`);
      expect(html).toContain('<input type="hidden" name="JWT"');
      expect(html).toContain(`value="${jwt}"`);
      expect(html).toContain('document.getElementById(\'dlForm\').submit()');
    });

    it('should escape HTML special characters in return URL', () => {
      const returnUrl = 'https://lms.example.com/return?foo=<script>alert("xss")</script>';
      const jwt = 'test.jwt.token';

      const html = service.generateReturnForm(returnUrl, jwt);

      // Check that the action attribute has escaped HTML
      expect(html).toContain('action="https://lms.example.com/return?foo=&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"');
      // Verify the dangerous string is NOT in the action unescaped
      expect(html).not.toContain('action="https://lms.example.com/return?foo=<script>alert("xss")</script>"');
    });

    it('should escape HTML special characters in JWT', () => {
      const returnUrl = 'https://lms.example.com/return';
      const jwt = 'test"jwt&token<with>special\'chars';

      const html = service.generateReturnForm(returnUrl, jwt);

      expect(html).toContain('&quot;');
      expect(html).toContain('&amp;');
      expect(html).toContain('&lt;');
      expect(html).toContain('&gt;');
      expect(html).toContain('&#039;');
    });

    it('should include user-facing message', () => {
      const html = service.generateReturnForm('https://lms.example.com/return', 'test.jwt');

      expect(html).toContain('Processing your selection...');
    });

    it('should trim whitespace from generated HTML', () => {
      const html = service.generateReturnForm('https://lms.example.com/return', 'test.jwt');

      expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
      expect(html.endsWith('</html>')).toBe(true);
      expect(html[0]).not.toBe(' ');
      expect(html[html.length - 1]).not.toBe(' ');
    });
  });
});
