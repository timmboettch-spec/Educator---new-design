import { AIResponseProvider } from '@/modules/conversation/providers/ai.provider';
import type { PatientContext } from '@/modules/conversation/providers/conversation-provider.interface';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';

describe('AIResponseProvider', () => {
  let provider: AIResponseProvider;
  let httpService: jest.Mocked<HttpService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    httpService = { post: jest.fn() } as unknown as jest.Mocked<HttpService>;
    configService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;
  });

  function createProvider(providerName: string) {
    configService.get.mockImplementation((key: string) => {
      if (key === 'AI_PROVIDER') {
        return providerName;
      }
      if (key === 'OPENAI_API_KEY') {
        return 'test-key';
      }
      if (key === 'AI_MODEL') {
        return 'gpt-4o';
      }
      return undefined;
    });

    provider = new AIResponseProvider(httpService, configService);
  }

  it('should call generateWithGroq when provider is groq', async () => {
    createProvider('groq');

    const spy = jest
      .spyOn(
        provider as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>,
        'generateWithOpenAI',
      )
      .mockResolvedValue('groq-response');

    const result = await provider.generateResponse('hi', {} as unknown as PatientContext);

    expect(spy).toHaveBeenCalled();
    expect(result).toBe('groq-response');
  });

  it('should return null for unknown provider', async () => {
    createProvider('unknown');

    jest
      .spyOn(
        provider as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>,
        'generateWithOpenAI',
      )
      .mockResolvedValue(null);

    const result = await provider.generateResponse('hi', {} as unknown as PatientContext);

    expect(result).toBeNull();
  });

  it('should return null when provider throws error', async () => {
    createProvider('groq');

    jest
      .spyOn(
        provider as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>,
        'generateWithOpenAI',
      )
      .mockRejectedValue(new Error('API failed'));

    const result = await provider.generateResponse('hi', {} as unknown as PatientContext);

    expect(result).toBeNull();
  });
});

describe('AIResponseProvider', () => {
  let provider: AIResponseProvider;

  const mockHttpService = {
    post: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const values: Record<string, unknown> = {
        AI_PROVIDER: 'groq',
        OPENAI_API_KEY: 'test-key',
        AI_MODEL: 'gpt-4o',
      };
      return values[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIResponseProvider,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    provider = module.get<AIResponseProvider>(AIResponseProvider);
  });

  it('should build prompt with patient name and chief complaint', async () => {
    // Arrange
    const spy = jest
      .spyOn(
        provider as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>,
        'generateWithOpenAI',
      )
      .mockResolvedValue('Mock AI Response');

    const context = {
      patientName: 'John',
      patientAge: 45,
      chiefComplaint: 'Chest pain',
    };

    // Act
    const result = await provider.generateResponse(
      'What brings you here?',
      context as unknown as PatientContext,
    );

    // Assert
    expect(result).toBe('Mock AI Response');

    const calledWithPrompt = spy.mock.calls[0][0];

    expect(calledWithPrompt).toContain('John');
    expect(calledWithPrompt).toContain('45');
    expect(calledWithPrompt).toContain('Chest pain');
    expect(calledWithPrompt).toContain('What brings you here?');
  });

  it('should handle empty context gracefully', async () => {
    const spy = jest
      .spyOn(
        provider as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>,
        'generateWithOpenAI',
      )
      .mockResolvedValue('OK');

    const result = await provider.generateResponse('Hello', {} as unknown as PatientContext);

    expect(result).toBe('OK');

    const prompt = spy.mock.calls[0][0];
    expect(prompt).toContain('Hello');
    expect(prompt).toContain('You are a patient');
  });
});
