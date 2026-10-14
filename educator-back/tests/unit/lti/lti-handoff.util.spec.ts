import {
  buildAutoSubmitPostHandoffHtml,
  buildOpenInNewTabHandoffHtml,
  buildTopLevelRedirectHtml,
  escapeHtmlAttribute,
} from '../../../src/lti/lti-handoff.util';

describe('lti-handoff.util', () => {
  describe('escapeHtmlAttribute', () => {
    it('escapes characters that would break HTML attributes', () => {
      expect(escapeHtmlAttribute('a&b"c<d>e')).toBe('a&amp;b&quot;c&lt;d&gt;e');
    });
  });

  describe('buildTopLevelRedirectHtml', () => {
    it('navigates window.top when embedded and includes a target=_top fallback link', () => {
      const html = buildTopLevelRedirectHtml(
        'https://educator.example/login?lti_launch=success&code=abc',
      );
      expect(html).toContain('window.top.location.href');
      expect(html).toContain('target="_top"');
      expect(html).toContain('https://educator.example/login?lti_launch=success&amp;code=abc');
      expect(html).toContain(
        JSON.stringify('https://educator.example/login?lti_launch=success&code=abc'),
      );
    });
  });

  describe('buildOpenInNewTabHandoffHtml', () => {
    it('renders a target=_blank button link and does not auto-navigate top', () => {
      const html = buildOpenInNewTabHandoffHtml(
        'https://educator.example/login?lti_launch=success&code=abc&redirect=%2Freport-detail%2Fx',
      );
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
      expect(html).toContain('Open in RealityWorks');
      expect(html).toContain(
        'https://educator.example/login?lti_launch=success&amp;code=abc&amp;redirect=%2Freport-detail%2Fx',
      );
      expect(html).not.toContain('window.top.location');
      expect(html).not.toContain('http-equiv="refresh"');
    });
  });

  describe('buildAutoSubmitPostHandoffHtml', () => {
    it('returns a POST form with hidden fields and no query string in action URL', () => {
      const html = buildAutoSubmitPostHandoffHtml('https://api.example.com/api/lti/launch', {
        id_token: 'eyJ.test.token',
        state: 'state-123',
      });

      expect(html).toContain('method="post"');
      expect(html).toContain('action="https://api.example.com/api/lti/launch"');
      expect(html).not.toContain('id_token=');
      expect(html).toContain('name="id_token" value="eyJ.test.token"');
      expect(html).toContain('name="state" value="state-123"');
      expect(html).toContain('<script>document.forms[0].submit();</script>');
      expect(html).not.toContain('onload=');
    });

    it('escapes special characters in field values', () => {
      const html = buildAutoSubmitPostHandoffHtml('https://api.example.com/api/lti/launch', {
        id_token: 'token"with<special>&chars',
        state: '',
      });

      expect(html).toContain('value="token&quot;with&lt;special&gt;&amp;chars"');
    });
  });
});
