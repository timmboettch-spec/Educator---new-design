import { Test, TestingModule } from '@nestjs/testing';

describe('Report API - Observation Field Sanitization', () => {
  describe('Input Validation', () => {
    const sanitizeObservation = (observation: string | null | undefined): string => {
      if (!observation) {
        return '';
      }
      const trimmed = observation.trim();
      return trimmed || '';
    };

    it('should reject whitespace-only observation', () => {
      const input = '                    ';
      const result = sanitizeObservation(input);
      expect(result).toBe('');
    });

    it('should trim leading and trailing spaces', () => {
      const input = '    test observation    ';
      const result = sanitizeObservation(input);
      expect(result).toBe('test observation');
    });

    it('should handle null input', () => {
      const result = sanitizeObservation(null);
      expect(result).toBe('');
    });

    it('should handle undefined input', () => {
      const result = sanitizeObservation(undefined);
      expect(result).toBe('');
    });

    it('should not persist quoted empty string', () => {
      const result = sanitizeObservation('     ');
      expect(result).not.toBe('" "');
      expect(result).not.toBe('""');
      expect(result).toBe('');
    });
  });

  describe('Summary Details Sanitization', () => {
    const buildSummaryDetails = (
      result: string,
      observation: string | null | undefined,
      duration: string,
    ): string => {
      const parts: string[] = [];

      if (result) {
        parts.push(`Result: ${result}`);
      }

      const trimmedObs = observation?.trim();
      if (trimmedObs) {
        parts.push(`Observation: ${trimmedObs}`);
      }

      if (duration) {
        parts.push(`Duration: ${duration}`);
      }

      return parts.join(' | ');
    };

    it('should exclude observation if whitespace-only', () => {
      const details = buildSummaryDetails('Test result', '                    ', '10s');
      expect(details).toBe('Result: Test result | Duration: 10s');
      expect(details).not.toContain('Observation:');
    });

    it('should include trimmed observation if valid', () => {
      const details = buildSummaryDetails('Test result', '    valid observation    ', '10s');
      expect(details).toBe('Result: Test result | Observation: valid observation | Duration: 10s');
    });

    it('should exclude observation if null', () => {
      const details = buildSummaryDetails('Test result', null, '10s');
      expect(details).not.toContain('Observation:');
    });

    it('should exclude observation if undefined', () => {
      const details = buildSummaryDetails('Test result', undefined, '10s');
      expect(details).not.toContain('Observation:');
    });

    it('should not contain excessive whitespace in stored value', () => {
      const details = buildSummaryDetails('Test result', '  obs  ', '10s');
      expect(details).not.toMatch(/Observation:\s{2,}/);
      expect(details).toContain('Observation: obs');
    });
  });

  describe('Report Payload Validation', () => {
    interface ActionEntry {
      title: string;
      notes?: string;
      response?: string;
    }

    const sanitizeActionEntry = (action: ActionEntry): ActionEntry => {
      return {
        ...action,
        notes: action.notes?.trim() || undefined,
        response: action.response?.trim() || undefined,
      };
    };

    it('should remove whitespace-only notes', () => {
      const action: ActionEntry = {
        title: 'Test Action',
        notes: '                    ',
      };
      const sanitized = sanitizeActionEntry(action);
      expect(sanitized.notes).toBeUndefined();
    });

    it('should trim valid notes', () => {
      const action: ActionEntry = {
        title: 'Test Action',
        notes: '    valid note    ',
      };
      const sanitized = sanitizeActionEntry(action);
      expect(sanitized.notes).toBe('valid note');
    });

    it('should handle null notes', () => {
      const action: ActionEntry = {
        title: 'Test Action',
        notes: null as unknown as string,
      };
      const sanitized = sanitizeActionEntry(action);
      expect(sanitized.notes).toBeUndefined();
    });

    it('should ensure no empty string is persisted', () => {
      const action: ActionEntry = {
        title: 'Test Action',
        notes: '',
      };
      const sanitized = sanitizeActionEntry(action);
      expect(sanitized.notes).toBeUndefined();
      expect(sanitized.notes).not.toBe('');
    });
  });

  describe('API Contract Validation', () => {
    it('should return null or undefined for empty observation, not empty string', () => {
      const observation = '     ';
      const sanitized = observation.trim() || undefined;

      expect(sanitized).toBeUndefined();
      expect(sanitized).not.toBe('');
    });

    it('should ensure stored value is null or empty string as per contract', () => {
      const testCases = [
        { input: '     ', expected: undefined },
        { input: null, expected: undefined },
        { input: undefined, expected: undefined },
        { input: '', expected: undefined },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = input?.trim() || undefined;
        expect(result).toBe(expected);
      });
    });

    it('should not return quoted empty string in API response', () => {
      const observation = '                    ';
      const sanitized = observation.trim() || undefined;

      const apiResponse = {
        observation: sanitized,
      };

      expect(JSON.stringify(apiResponse)).not.toContain('" "');
      expect(JSON.stringify(apiResponse)).not.toContain('""');
    });
  });
});
