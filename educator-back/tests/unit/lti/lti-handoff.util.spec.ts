import {
  buildAutoSubmitPostHandoffHtml,
  escapeHtmlAttribute,
} from '../../../src/lti/lti-handoff.util';

describe('lti-handoff.util', () => {
  describe('escapeHtmlAttribute', () => {
    it('escapes characters that would break HTML attributes', () => {
      expect(escapeHtmlAttribute('a&b"c<d>e')).toBe('a&amp;b&quot;c&lt;d&gt;e');
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
