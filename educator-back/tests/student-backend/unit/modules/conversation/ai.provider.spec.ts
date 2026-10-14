import { AIResponseProvider } from '@/modules/conversation/providers/ai.provider';
import { LoggerService } from 'src/common/services';
import type { PatientContext } from 'src/common/interfaces/patient-context.interface';
import { AiGateway } from 'src/common/interfaces';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';

const createAiGatewayMock = (configured = true): jest.Mocked<AiGateway> =>
  ({
    complete: jest.fn(),
    completeJson: jest.fn(),
    isConfigured: jest.fn().mockReturnValue(configured),
  }) as unknown as jest.Mocked<AiGateway>;

describe('AIResponseProvider', () => {
  let provider: AIResponseProvider;
  let aiGateway: jest.Mocked<AiGateway>;
  let loggerService: jest.Mocked<LoggerService>;

  beforeEach(() => {
    aiGateway = createAiGatewayMock();
    loggerService = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      fatal: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;
    provider = new AIResponseProvider(aiGateway, loggerService);
  });

  it('should return the gateway completion when configured', async () => {
    aiGateway.complete.mockResolvedValue('ai-response');

    const result = await provider.generateResponse('hi', {} as unknown as PatientContext);

    expect(aiGateway.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: 'conversation.patient-response',
        maxTokens: 150,
        temperature: 0.7,
      }),
    );
    expect(result).toBe('ai-response');
  });

  it('should return null without calling the gateway when AI is not configured', async () => {
    aiGateway.isConfigured.mockReturnValue(false);

    const result = await provider.generateResponse('hi', {} as unknown as PatientContext);

    expect(aiGateway.complete).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('should return null when the gateway throws an error', async () => {
    aiGateway.complete.mockRejectedValue(new Error('API failed'));

    const result = await provider.generateResponse('hi', {} as unknown as PatientContext);

    expect(result).toBeNull();
    expect(loggerService.warn).toHaveBeenCalledWith(expect.stringContaining('API failed'));
  });
});

describe('AIResponseProvider', () => {
  let provider: AIResponseProvider;
  const aiGateway = createAiGatewayMock();

  beforeEach(async () => {
    jest.clearAllMocks();
    aiGateway.isConfigured.mockReturnValue(true);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIResponseProvider,
        { provide: AiGateway, useValue: aiGateway },
        {
          provide: LoggerService,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            verbose: jest.fn(),
            fatal: jest.fn(),
          },
        },
      ],
    }).compile();

    provider = module.get<AIResponseProvider>(AIResponseProvider);
  });

  it('should build prompt with patient name and chief complaint', async () => {
    aiGateway.complete.mockResolvedValue('Mock AI Response');

    const context = {
      patientName: 'John',
      patientAge: 45,
      chiefComplaint: 'Chest pain',
    };

    const result = await provider.generateResponse(
      'What brings you here?',
      context as unknown as PatientContext,
    );

    expect(result).toBe('Mock AI Response');

    const calledWithPrompt = aiGateway.complete.mock.calls[0][0].messages;

    expect(calledWithPrompt).toContain('John');
    expect(calledWithPrompt).toContain('45');
    expect(calledWithPrompt).toContain('Chest pain');
    expect(calledWithPrompt).toContain('What brings you here?');
  });

  it('should handle empty context gracefully', async () => {
    aiGateway.complete.mockResolvedValue('OK');

    const result = await provider.generateResponse('Hello', {} as unknown as PatientContext);

    expect(result).toBe('OK');

    const prompt = aiGateway.complete.mock.calls[0][0].messages;
    expect(prompt).toContain('Hello');
    expect(prompt).toContain('You are a patient');
  });
});
