import { StaticResponseProvider } from '@/modules/conversation/providers/static.provider';
import type { PatientContext } from '@/modules/conversation/providers/conversation-provider.interface';

describe('StaticResponseProvider', () => {
  let provider: StaticResponseProvider;

  const mockResponses = {
    scenario1: [
      {
        keywords: ['hello', 'hi'],
        response: 'Hello, how can I help you?',
      },
      {
        keywords: ['pain'],
        response: 'Where is your pain located?',
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    provider = new StaticResponseProvider();

    // Manually inject responses map for deterministic tests
    (provider as unknown as { responses: Map<string, unknown[]> }).responses.set(
      'scenario1',
      mockResponses.scenario1,
    );
  });

  describe('generateResponse', () => {
    it('should return matching response when keyword matches', async () => {
      const result = await provider.generateResponse('Hello doctor', {
        scenarioId: 'scenario1',
      } as PatientContext);

      expect(result).toBe('Hello, how can I help you?');
    });

    it('should return matching response for another keyword', async () => {
      const result = await provider.generateResponse('I have pain in my leg', {
        scenarioId: 'scenario1',
      } as PatientContext);

      expect(result).toBe('Where is your pain located?');
    });

    it('should return null when no keyword matches', async () => {
      const result = await provider.generateResponse('random text', {
        scenarioId: 'scenario1',
      } as PatientContext);

      expect(result).toBeNull();
    });

    it('should return null when scenarioId not found', async () => {
      const result = await provider.generateResponse('hello', {
        scenarioId: 'unknownScenario',
      } as PatientContext);

      expect(result).toBeNull();
    });

    it('should handle empty input safely', async () => {
      const result = await provider.generateResponse('', {
        scenarioId: 'scenario1',
      } as PatientContext);

      expect(result).toBeNull();
    });
  });

  describe('loadResponses', () => {
    it('should not crash on construction without Azure env', () => {
      expect(() => new StaticResponseProvider()).not.toThrow();
    });

    it('should tolerate load failures', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      expect(() => new StaticResponseProvider()).not.toThrow();
      consoleSpy.mockRestore();
    });
  });
});
