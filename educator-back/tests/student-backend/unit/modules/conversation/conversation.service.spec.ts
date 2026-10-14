import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConversationService } from '@/modules/conversation/conversation.service';
import { AIResponseProvider } from '@/modules/conversation/providers/ai.provider';
import { LoggerService } from 'src/common/services';
import { SIMULATION_V2_REPOSITORY } from 'src/database/tokens';

describe('ConversationService - generateResponse', () => {
  let service: ConversationService;

  const mockSimulationV2Repository = {
    findByBusinessId: jest.fn(),
  };

  const mockProvider = {
    generateResponse: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,

        {
          provide: SIMULATION_V2_REPOSITORY,
          useValue: mockSimulationV2Repository,
        },
        {
          provide: AIResponseProvider,
          useValue: mockProvider,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
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

    service = module.get<ConversationService>(ConversationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return error response when scenario is not found', async () => {
    mockSimulationV2Repository.findByBusinessId.mockResolvedValue(null);

    const result = await service.generateResponse('hello', 'invalid-id');

    expect(result).toEqual({
      text: "I'm sorry, I couldn't find the scenario information.",
      category: 'error',
    });
  });

  it('should return AI response when provider returns valid response', async () => {
    mockSimulationV2Repository.findByBusinessId.mockResolvedValue({
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
    mockSimulationV2Repository.findByBusinessId.mockResolvedValue({
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
    mockSimulationV2Repository.findByBusinessId.mockResolvedValue({
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
    mockSimulationV2Repository.findByBusinessId.mockResolvedValue({
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
    mockSimulationV2Repository.findByBusinessId.mockResolvedValue({
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
