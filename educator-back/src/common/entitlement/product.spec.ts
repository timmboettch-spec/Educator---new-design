import {
  Modality,
  Audience,
  deriveProduct,
  parseModality,
  normalizeAudience,
  EntitlementMessages,
} from './product';

describe('entitlement/product', () => {
  describe('deriveProduct', () => {
    it('maps the four valid combinations to P1–P4', () => {
      expect(deriveProduct(Modality.ONLINE, Audience.POST_SECONDARY)).toBe('P1');
      expect(deriveProduct(Modality.ONLINE, Audience.SECONDARY)).toBe('P2');
      expect(deriveProduct(Modality.MANIKIN, Audience.POST_SECONDARY)).toBe('P3');
      expect(deriveProduct(Modality.MANIKIN, Audience.SECONDARY)).toBe('P4');
    });

    it('fails closed when either axis is missing', () => {
      expect(deriveProduct(null, Audience.SECONDARY)).toBeNull();
      expect(deriveProduct(Modality.ONLINE, null)).toBeNull();
      expect(deriveProduct(undefined, undefined)).toBeNull();
    });
  });

  describe('parseModality', () => {
    it('recognizes online/avatar and manikin/trainer aliases', () => {
      expect(parseModality('online')).toBe(Modality.ONLINE);
      expect(parseModality('AI')).toBe(Modality.ONLINE);
      expect(parseModality('Avatar')).toBe(Modality.ONLINE);
      expect(parseModality('manikin')).toBe(Modality.MANIKIN);
      expect(parseModality('Trainer')).toBe(Modality.MANIKIN);
      expect(parseModality('workstation')).toBe(Modality.MANIKIN);
    });

    it('fails closed on unknown / non-string input', () => {
      expect(parseModality('AI Only')).toBeNull(); // category text is NOT a modality
      expect(parseModality('')).toBeNull();
      expect(parseModality(undefined)).toBeNull();
      expect(parseModality(42)).toBeNull();
    });
  });

  describe('normalizeAudience', () => {
    it('normalizes the spellings seen in the live library', () => {
      expect(normalizeAudience('BSN')).toBe(Audience.POST_SECONDARY);
      expect(normalizeAudience('Post-Secondary Nursing')).toBe(Audience.POST_SECONDARY);
      expect(normalizeAudience('PA/PT')).toBe(Audience.POST_SECONDARY);
      expect(normalizeAudience('High School Health Science')).toBe(Audience.SECONDARY);
      expect(normalizeAudience('High School Allied Health')).toBe(Audience.SECONDARY);
    });

    it('accepts already-normalized enum strings', () => {
      expect(normalizeAudience('SECONDARY')).toBe(Audience.SECONDARY);
      expect(normalizeAudience('post_secondary')).toBe(Audience.POST_SECONDARY);
    });

    it('fails closed on unknown / empty input', () => {
      expect(normalizeAudience('')).toBeNull();
      expect(normalizeAudience('Continuing Education')).toBeNull();
      expect(normalizeAudience(null)).toBeNull();
    });
  });

  describe('EntitlementMessages.audienceLicense', () => {
    it('returns the product-specific license message', () => {
      expect(EntitlementMessages.audienceLicense(Audience.POST_SECONDARY)).toContain('Post-Secondary');
      expect(EntitlementMessages.audienceLicense(Audience.SECONDARY)).toContain('Secondary');
    });
  });
});
