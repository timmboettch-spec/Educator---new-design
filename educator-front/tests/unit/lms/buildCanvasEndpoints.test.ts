import { describe, expect, it } from 'vitest';
import {
  buildCanvasEndpoints,
  CANVAS_ISSUER_VALIDATION_MESSAGE,
} from '../../../src/utils/lmsEndpoints';

describe('buildCanvasEndpoints (hosted issuer mapping)', () => {
  it('maps production hosted issuer to sso.canvaslms.com while keeping institution lmsBaseUrl', () => {
    const endpoints = buildCanvasEndpoints(
      'https://myschool.instructure.com',
      'https://canvas.instructure.com'
    );
    expect(endpoints).toEqual({
      authEndpoint: 'https://sso.canvaslms.com/api/lti/authorize_redirect',
      tokenEndpoint: 'https://sso.canvaslms.com/login/oauth2/token',
      jwksUrl: 'https://sso.canvaslms.com/api/lti/security/jwks',
      lmsBaseUrl: 'https://myschool.instructure.com',
    });
  });

  it('maps beta and test hosted issuers to matching SSO hosts', () => {
    expect(
      buildCanvasEndpoints(
        'https://myschool.beta.instructure.com',
        'https://canvas.beta.instructure.com'
      ).jwksUrl
    ).toBe('https://sso.beta.canvaslms.com/api/lti/security/jwks');

    expect(
      buildCanvasEndpoints(
        'https://myschool.test.instructure.com',
        'https://canvas.test.instructure.com'
      ).tokenEndpoint
    ).toBe('https://sso.test.canvaslms.com/login/oauth2/token');
  });

  it('keeps self-hosted / local Canvas endpoints on the institution base URL', () => {
    const endpoints = buildCanvasEndpoints(
      'http://canvas.docker',
      'http://canvas.docker'
    );
    expect(endpoints).toEqual({
      authEndpoint: 'http://canvas.docker/api/lti/authorize_redirect',
      tokenEndpoint: 'http://canvas.docker/login/oauth2/token',
      jwksUrl: 'http://canvas.docker/api/lti/security/jwks',
      lmsBaseUrl: 'http://canvas.docker',
    });
  });

  it('rejects typo issuer instead of silently falling back to Canvas base URL', () => {
    expect(() =>
      buildCanvasEndpoints(
        'https://wthrive.instructure.com',
        'https://canvass.instructure.com'
      )
    ).toThrow(CANVAS_ISSUER_VALIDATION_MESSAGE);
  });
});
