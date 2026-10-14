import { Injectable } from '@nestjs/common';
import { SignJWT, importPKCS8 } from 'jose';
import { randomUUID } from 'crypto';
import { LmsSchoolConfig } from 'src/database/entities';
import { LoggerService } from 'src/common/services';
import { LtiConstants } from '../lti.constants';
import { LtiContentItem } from '../interfaces/deep-linking.interface';
import { normalizePem } from 'src/lms/utils/lms-key.util';

/**
 * Service for signing LTI 1.3 Deep Linking response JWTs
 * 
 * Deep Linking allows educators to select content from the tool,
 * and the tool returns a signed JWT with content items that the
 * LMS will create as activities.
 */
@Injectable()
export class LtiDeepLinkingService {
  constructor(private readonly logger: LoggerService) {}

  /**
   * Sign a Deep Linking response JWT
   * 
   * @param params - Deep Linking response parameters
   * @returns Signed JWT to be POSTed back to the LMS
   */
  async signDeepLinkingResponse(params: {
    issuer: string;
    clientId: string;
    deploymentId: string;
    contentItems: LtiContentItem[];
    data?: string;
    message?: string;
    schoolConfig: LmsSchoolConfig;
  }): Promise<string> {
    const { issuer, clientId, deploymentId, contentItems, data, message, schoolConfig } = params;

    // Import school's RS256 private key (same key used for OAuth assertions)
    // Normalize PEM format to handle stored literal \n escapes
    const privateKey = await importPKCS8(normalizePem(schoolConfig.platformPrivateKeyPem), 'RS256');

    const now = Math.floor(Date.now() / 1000);

    // Build JWT claims per LTI Deep Linking 2.0 spec
    const payload: Record<string, unknown> = {
      iss: clientId, // Tool is the issuer for Deep Linking responses
      aud: issuer, // Platform (LMS) is the audience
      exp: now + 600, // 10 minute expiration
      iat: now,
      nonce: randomUUID(),
      'https://purl.imsglobal.org/spec/lti/claim/message_type':
        LtiConstants.MESSAGE_TYPES.DEEP_LINKING_RESPONSE,
      'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
      'https://purl.imsglobal.org/spec/lti/claim/deployment_id': deploymentId,
      'https://purl.imsglobal.org/spec/lti-dl/claim/content_items': contentItems,
    };

    // Include data token if provided (required to be returned unchanged)
    if (data) {
      payload['https://purl.imsglobal.org/spec/lti-dl/claim/data'] = data;
    }

    // Include optional message
    if (message) {
      payload['https://purl.imsglobal.org/spec/lti-dl/claim/msg'] = message;
    }

    const jwt = await new SignJWT(payload)
      .setProtectedHeader({
        alg: 'RS256',
        typ: 'JWT',
        kid: schoolConfig.platformKeyId,
      })
      .sign(privateKey);

    this.logger.log(
      `[Deep Linking] Signed response JWT with ${contentItems.length} content item(s)`,
    );
    return jwt;
  }

  /**
   * Generate HTML form that auto-submits the Deep Linking response to the LMS
   * 
   * @param deepLinkReturnUrl - URL provided by LMS in deep_linking_settings
   * @param jwt - Signed Deep Linking response JWT
   * @returns HTML string with auto-submitting form
   */
  generateReturnForm(deepLinkReturnUrl: string, jwt: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Returning to LMS</title>
          <meta charset="utf-8">
        </head>
        <body>
          <p>Processing your selection...</p>
          <form id="dlForm" method="POST" action="${this.escapeHtml(deepLinkReturnUrl)}">
            <input type="hidden" name="JWT" value="${this.escapeHtml(jwt)}" />
          </form>
          <script>
            document.getElementById('dlForm').submit();
          </script>
        </body>
      </html>
    `.trim();
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
