import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { Test, TestingModule } from '@nestjs/testing';
import helmet from 'helmet';
import request from 'supertest';
import { securityHeadersOptions } from '../../../src/config/security-headers.config';
import { LtiController } from '../../../src/lti/lti.controller';
import { LtiKeyService } from '../../../src/lti/lti-key.service';
import { LtiTokenFactory } from './helpers/lti-token.factory';

const BASE_URL = 'http://localhost:3000/api';
const ISSUER = 'https://moodle.test.edu';
const CLIENT_ID = 'test-client-id';

function parseCsp(header: string | undefined): Record<string, string[]> {
  return Object.fromEntries(
    (header ?? '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...sources] = part.split(/\s+/);
        return [name, sources];
      }),
  );
}

interface CallbackResult {
  html: string;
  csp: Record<string, string[]>;
  headers: Record<string, string>;
}

describe('LTI callback CSP (integration)', () => {
  let app: INestApplication;
  let educator: CallbackResult;
  let student: CallbackResult;

  async function postCallback(route: string, idToken: string): Promise<CallbackResult> {
    const res = await request(app.getHttpServer())
      .post(`/api/lti/${route}`)
      .send({ id_token: idToken, state: 'test-state' })
      .expect(200);

    const headers = res.headers as Record<string, string>;
    return { html: res.text, csp: parseCsp(headers['content-security-policy']), headers };
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
      controllers: [LtiController],
      providers: [
        {
          provide: LtiKeyService,
          useValue: { getBaseUrl: jest.fn().mockReturnValue(BASE_URL) },
        },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(null) } },
      ],
    })
      .useMocker(() => ({}))
      .compile();

    app = moduleRef.createNestApplication();
    app.useLogger(false);
    app.setGlobalPrefix('api');
    app.use(helmet(securityHeadersOptions));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    educator = await postCallback(
      'callback',
      LtiTokenFactory.buildEducatorLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        email: 'educator@test.com',
      }),
    );
    student = await postCallback(
      'studentcallback',
      LtiTokenFactory.buildStudentLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        email: 'student@test.com',
      }),
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  describe.each([
    ['POST /api/lti/callback', (): CallbackResult => educator, '/lti/launch'],
    ['POST /api/lti/studentcallback', (): CallbackResult => student, '/lti/studentlaunch'],
  ])('%s', (_name, result, launchPath) => {
    it('sends a Content-Security-Policy header', () => {
      expect(result().headers['content-security-policy']).toBeDefined();
    });

    it('still returns the auto-submit handoff HTML', () => {
      const { html, headers } = result();
      expect(headers['content-type']).toContain('html');
      expect(html).toContain('<form');
      expect(html).toContain('id_token');
      expect(html).toContain(`${BASE_URL}${launchPath}`);
      expect(html).toContain('submit()');
    });

    it('allows the inline submit script the page depends on', () => {
      const { html, csp } = result();
      expect(html).toContain('<script>');
      expect(csp['script-src']).toContain("'unsafe-inline'");
    });

    it('uses a <script> block, not an inline event attribute', () => {
      expect(result().html).not.toMatch(/<[^>]+\son[a-z]+\s*=/i);
      expect(result().csp['script-src-attr']).toContain("'unsafe-inline'");
    });

    it('lets the LMS embed the page in an iframe', () => {
      const frameAncestors = result().csp['frame-ancestors'];
      expect(frameAncestors).toContain('https:');
      expect(frameAncestors).toContain('http://localhost:*');
    });

    it('lets the handoff form POST to the launch endpoint', () => {
      const formAction = result().csp['form-action'];
      expect(formAction).toContain("'self'");
      expect(formAction).toContain('https:');
      expect(formAction).toContain('http://localhost:*');
    });

    it('does not isolate the response from its LMS embedder', () => {
      expect(result().headers['cross-origin-embedder-policy']).toBeUndefined();
    });
  });

  it('serves an identical policy on both callbacks', () => {
    expect(educator.headers['content-security-policy']).toBe(
      student.headers['content-security-policy'],
    );
  });
});
