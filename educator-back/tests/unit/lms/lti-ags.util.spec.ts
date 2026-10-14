import {
  extractAgsEndpoint,
  getLineItemUrl,
  isLineItemsCollectionUrl,
} from '../../../src/lms/utils/lti-ags.util';

describe('lti-ags.util', () => {
  describe('getLineItemUrl', () => {
    it('prefers direct lineitem URL when both are present', () => {
      const url = getLineItemUrl({
        lineitem: 'https://lms.example.com/lineitems/42',
        lineitems: 'https://lms.example.com/lineitems',
      });

      expect(url).toBe('https://lms.example.com/lineitems/42');
    });

    it('falls back to lineitems collection URL when lineitem is missing', () => {
      const url = getLineItemUrl({
        lineitems: 'https://canvas.example.com/api/lti/courses/1/line_items',
      });

      expect(url).toBe('https://canvas.example.com/api/lti/courses/1/line_items');
    });

    it('returns null when AGS endpoint is missing', () => {
      expect(getLineItemUrl(null)).toBeNull();
      expect(getLineItemUrl({})).toBeNull();
    });
  });

  describe('isLineItemsCollectionUrl', () => {
    it('detects collection URLs', () => {
      expect(
        isLineItemsCollectionUrl('https://canvas.example.com/api/lti/courses/1/line_items'),
      ).toBe(true);
      expect(isLineItemsCollectionUrl('https://lms.example.com/mod/lti/services.php/2/lineitems'))
        .toBe(true);
    });

    it('returns false for direct line item URLs', () => {
      expect(
        isLineItemsCollectionUrl('https://canvas.example.com/api/lti/courses/1/line_items/42'),
      ).toBe(false);
    });
  });

  describe('extractAgsEndpoint', () => {
    it('extracts lineitems from the AGS claim', () => {
      const payload = {
        'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint': {
          scope: ['https://purl.imsglobal.org/spec/lti-ags/scope/score'],
          lineitems: 'https://canvas.example.com/api/lti/courses/1/line_items',
        },
      };

      expect(extractAgsEndpoint(payload)).toEqual({
        scope: ['https://purl.imsglobal.org/spec/lti-ags/scope/score'],
        lineitems: 'https://canvas.example.com/api/lti/courses/1/line_items',
        lineitem: undefined,
      });
    });
  });
});
