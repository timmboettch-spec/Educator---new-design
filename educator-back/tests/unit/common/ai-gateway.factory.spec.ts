import { AiGatewayFactory } from 'src/common/providers/ai/ai-gateway.factory';
import { type OpenAiGateway } from 'src/common/providers/ai/openai.gateway';
import { StaticAiGateway } from 'src/common/providers/ai/static.gateway';

describe('AiGatewayFactory', () => {
  let logger: { log: jest.Mock; warn: jest.Mock };
  let openAiGateway: { isConfigured: jest.Mock };
  const staticGateway = new StaticAiGateway();

  const createFactory = (provider: string | undefined): AiGatewayFactory =>
    new AiGatewayFactory(
      { get: jest.fn((key: string) => (key === 'ai.provider' ? provider : undefined)) } as never,
      openAiGateway as unknown as OpenAiGateway,
      staticGateway,
      logger as never,
    );

  beforeEach(() => {
    logger = { log: jest.fn(), warn: jest.fn() };
    openAiGateway = { isConfigured: jest.fn().mockReturnValue(true) };
  });

  it.each([undefined, '', 'openai', ' OpenAI '])(
    'returns the OpenAI gateway for %p',
    (provider) => {
      expect(createFactory(provider).create()).toBe(openAiGateway);
      expect(logger.warn).not.toHaveBeenCalled();
    },
  );

  it('warns when the OpenAI gateway has no API key', () => {
    openAiGateway.isConfigured.mockReturnValue(false);
    expect(createFactory('openai').create()).toBe(openAiGateway);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No OpenAI API key'));
  });

  it('returns the static gateway for static', () => {
    expect(createFactory('static').create()).toBe(staticGateway);
  });

  it('throws for an unsupported provider', () => {
    expect(() => createFactory('anthropic').create()).toThrow(
      'Unsupported AI_PROVIDER "anthropic"',
    );
  });
});
