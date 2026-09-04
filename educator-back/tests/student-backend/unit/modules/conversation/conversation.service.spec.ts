import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ConversationService } from '@/modules/conversation/conversation.service';
import { ConversationProviderFactory } from '@/modules/conversation/providers/provider.factory';
import { JsonDataService } from '@/data/json-data.service';
import type { ConversationProvider } from '@/modules/conversation/providers/conversation-provider.interface';

describe('ConversationService - generateResponse', () => {
  let service: ConversationService;

  const mockJsonDataService = {
    getScenarioById: jest.fn(),
  };

  const mockProvider: ConversationProvider = {
    generateResponse: jest.fn(),
  };

  const mockProviderFactory = {
    createProvider: jest.fn().mockReturnValue(mockProvider),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,

        // ? IMPORTANT: use CLASS, not string token
        {
          provide: JsonDataService,
          useValue: mockJsonDataService,
        },
        {
          provide: ConversationProviderFactory,
          useValue: mockProviderFactory,
        },
      ],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return error response when scenario is not found', async () => {
    mockJsonDataService.getScenarioById.mockReturnValue(null);

    const result = await service.generateResponse('hello', 'invalid-id');

    expect(result).toEqual({
      text: "I'm sorry, I couldn't find the scenario information.",
      category: 'error',
    });
  });

  it('should return AI response when provider returns valid response', async () => {
    mockJsonDataService.getScenarioById.mockReturnValue({
      title: 'Test Scenario',
      patientData: {},
      phases: [],
    });

    mockProvider.generateResponse = jest.fn().mockResolvedValue('AI response');

    const result = await service.generateResponse('hello', 'scenario-1');

    expect(result).toEqual({
      text: 'AI response',
      category: 'ai-generated',
    });
  });

  it('should fallback to scenario response when AI returns null', async () => {
    mockJsonDataService.getScenarioById.mockReturnValue({
      title: 'Test Scenario',
      patientData: {},
      phases: [],
    });

    mockProvider.generateResponse = jest.fn().mockResolvedValue(null);

    jest
      .spyOn(
        service as unknown as Record<string, (...args: unknown[]) => unknown>,
        'findScenarioResponse',
      )
      .mockReturnValue({
        text: 'Scenario response',
        category: 'scenario',
      });

    const result = await service.generateResponse('hello', 'scenario-1');

    expect(result).toEqual({
      text: 'Scenario response',
      category: 'scenario',
    });
  });

  it('should fallback to common response when scenario response not found', async () => {
    mockJsonDataService.getScenarioById.mockReturnValue({
      title: 'Test Scenario',
      patientData: {},
      phases: [],
    });

    mockProvider.generateResponse = jest.fn().mockResolvedValue(null);

    jest
      .spyOn(
        service as unknown as Record<string, (...args: unknown[]) => unknown>,
        'findScenarioResponse',
      )
      .mockReturnValue(null);
    jest
      .spyOn(
        service as unknown as Record<string, (...args: unknown[]) => unknown>,
        'findCommonResponse',
      )
      .mockReturnValue({
        text: 'Common response',
        category: 'common',
      });

    const result = await service.generateResponse('hello', 'scenario-1');

    expect(result).toEqual({
      text: 'Common response',
      category: 'common',
    });
  });

  it('should fallback to intelligent fallback when no scenario/common response found', async () => {
    mockJsonDataService.getScenarioById.mockReturnValue({
      title: 'Test Scenario',
      patientData: {},
      phases: [],
    });

    mockProvider.generateResponse = jest.fn().mockResolvedValue(null);

    jest
      .spyOn(
        service as unknown as Record<string, (...args: unknown[]) => unknown>,
        'findScenarioResponse',
      )
      .mockReturnValue(null);
    jest
      .spyOn(
        service as unknown as Record<string, (...args: unknown[]) => unknown>,
        'findCommonResponse',
      )
      .mockReturnValue(null);
    jest
      .spyOn(
        service as unknown as Record<string, (...args: unknown[]) => unknown>,
        'getFallbackResponse',
      )
      .mockReturnValue('Fallback text');

    const result = await service.generateResponse('hello', 'scenario-1');

    expect(result).toEqual({
      text: 'Fallback text',
      category: 'fallback',
    });
  });

  it('should handle provider error and still fallback', async () => {
    mockJsonDataService.getScenarioById.mockReturnValue({
      title: 'Test Scenario',
      patientData: {},
      phases: [],
    });

    mockProvider.generateResponse = jest.fn().mockRejectedValue(new Error('AI failed'));

    jest
      .spyOn(
        service as unknown as Record<string, (...args: unknown[]) => unknown>,
        'findScenarioResponse',
      )
      .mockReturnValue(null);
    jest
      .spyOn(
        service as unknown as Record<string, (...args: unknown[]) => unknown>,
        'findCommonResponse',
      )
      .mockReturnValue(null);
    jest
      .spyOn(
        service as unknown as Record<string, (...args: unknown[]) => unknown>,
        'getFallbackResponse',
      )
      .mockReturnValue('Fallback after error');

    const result = await service.generateResponse('hello', 'scenario-1');

    expect(result).toEqual({
      text: 'Fallback after error',
      category: 'fallback',
    });
  });
});
