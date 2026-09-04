import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ConversationProviderFactory } from '@/modules/conversation/providers/provider.factory';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { StaticResponseProvider } from '@/modules/conversation/providers/static.provider';
import { AIResponseProvider } from '@/modules/conversation/providers/ai.provider';
import { SpeechEngineProvider } from '@/modules/conversation/providers/speech-engine.provider';

describe('ConversationProviderFactory', () => {
  let factory: ConversationProviderFactory;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationProviderFactory,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: HttpService,
          useValue: {},
        },
      ],
    }).compile();

    factory = module.get<ConversationProviderFactory>(ConversationProviderFactory);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createProvider', () => {
    it('should return StaticResponseProvider when CONVERSATION_PROVIDER=static', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'CONVERSATION_PROVIDER') {
          return 'static';
        }
        return null;
      });

      const provider = factory.createProvider();

      expect(provider).toBeInstanceOf(StaticResponseProvider);
    });

    it('should return AIResponseProvider when CONVERSATION_PROVIDER=ai', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'CONVERSATION_PROVIDER') {
          return 'ai';
        }
        if (key === 'AI_PROVIDER') {
          return 'groq';
        }
        if (key === 'AI_API_KEY') {
          return 'test-key';
        }
        return null;
      });

      const provider = factory.createProvider();

      expect(provider).toBeInstanceOf(AIResponseProvider);
    });

    it('should return SpeechEngineProvider when CONVERSATION_PROVIDER=speech-engine', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'CONVERSATION_PROVIDER') {
          return 'speech-engine';
        }
        return null;
      });

      const provider = factory.createProvider();

      expect(provider).toBeInstanceOf(SpeechEngineProvider);
    });

    it('should return SpeechEngineProvider when CONVERSATION_PROVIDER=speechengine', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'CONVERSATION_PROVIDER') {
          return 'speechengine';
        }
        return null;
      });

      const provider = factory.createProvider();

      expect(provider).toBeInstanceOf(SpeechEngineProvider);
    });

    it('should fallback to AIResponseProvider for unknown provider type', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'CONVERSATION_PROVIDER') {
          return 'unknown';
        }
        if (key === 'AI_PROVIDER') {
          return 'groq';
        }
        return null;
      });

      const provider = factory.createProvider();

      expect(provider).toBeInstanceOf(AIResponseProvider);
    });

    it('should still return AIResponseProvider when api key is missing (graceful handling)', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'CONVERSATION_PROVIDER') {
          return 'ai';
        }
        if (key === 'AI_PROVIDER') {
          return 'groq';
        }
        if (key === 'AI_API_KEY') {
          return undefined;
        }
        return null;
      });

      const provider = factory.createProvider();

      expect(provider).toBeInstanceOf(AIResponseProvider);
    });
  });
});
