import {
  assertValidCanvasIssuer,
  CANVAS_ISSUER_VALIDATION_MESSAGE,
  resolveDefaultLtiEndpoints,
  resolveHostedCanvasOidcBase,
} from '../../../src/lms/utils/lms-endpoints.util';
import { LmsType } from '../../../src/common/enums/lms.enum';

describe('lms-endpoints.util Canvas issuer validation', () => {
  it('accepts hosted Canvas Cloud issuer with institution base URL', () => {
    expect(() =>
      assertValidCanvasIssuer(
        'https://canvas.instructure.com',
        'https://wthrive.instructure.com',
      ),
    ).not.toThrow();
  });

  it('accepts self-hosted issuer matching base URL', () => {
    expect(() =>
      assertValidCanvasIssuer('http://canvas.docker', 'http://canvas.docker'),
    ).not.toThrow();
  });

  it('rejects typo issuer that would previously fall back silently', () => {
    expect(() =>
      assertValidCanvasIssuer(
        'https://canvass.instructure.com',
        'https://wthrive.instructure.com',
      ),
    ).toThrow(CANVAS_ISSUER_VALIDATION_MESSAGE);
  });

  it('maps hosted issuer defaults to sso.canvaslms.com', () => {
    expect(resolveHostedCanvasOidcBase('https://canvas.instructure.com')).toBe(
      'https://sso.canvaslms.com',
    );
    expect(resolveDefaultLtiEndpoints(LmsType.CANVAS, 'https://canvas.instructure.com')).toEqual({
      authEndpoint: 'https://sso.canvaslms.com/api/lti/authorize_redirect',
      tokenEndpoint: 'https://sso.canvaslms.com/login/oauth2/token',
      jwksUrl: 'https://sso.canvaslms.com/api/lti/security/jwks',
    });
  });
});
