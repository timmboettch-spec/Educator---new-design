import { ConfigService } from '@nestjs/config';
import { LtiKeyService } from '../../../src/lti/lti-key.service';
import { LmsSchoolConfigRepository } from '../../../src/database/repositories';
import { LoggerService } from '../../../src/common/services';

type Env = Record<string, string | undefined>;

function buildService(env: Env) {
  const logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() };
  const config = {
    get: (key: string, fallback?: string) => env[key] ?? fallback,
  };
  const service = new LtiKeyService(
    config as unknown as ConfigService,
    {} as LmsSchoolConfigRepository,
    logger as unknown as LoggerService,
  );
  return { service, logger };
}

describe('LtiKeyService.getBaseUrl', () => {
  it('uses API_BASE_URL and strips a trailing slash', () => {
    const { service } = buildService({ 'app.apiBaseUrl': 'https://educator.realityworks.ai/' });
    expect(service.getBaseUrl()).toBe('https://educator.realityworks.ai');
  });

  it('treats a whitespace-only API_BASE_URL as unset', () => {
    const { service } = buildService({
      'app.apiBaseUrl': '   ',
      'app.nodeEnv': 'development',
      'app.appUrl': 'http://localhost:3000',
    });
    expect(service.getBaseUrl()).toBe('http://localhost:3000');
  });

  it('falls back to localhost on a local machine and warns', () => {
    const { service, logger } = buildService({
      'app.nodeEnv': 'development',
      'app.appUrl': 'http://localhost:3000',
      'app.appPort': '4000',
    });
    expect(service.getBaseUrl()).toBe('http://localhost:4000');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('throws in cloud-dev, where NODE_ENV is development but APP_URL is not local', () => {
    const { service } = buildService({
      'app.nodeEnv': 'development',
      'app.appUrl': 'https://dev.curionn.com',
    });
    expect(() => service.getBaseUrl()).toThrow(/API_BASE_URL is not configured/);
  });

  it('throws in production', () => {
    const { service } = buildService({
      'app.nodeEnv': 'production',
      'app.appUrl': 'https://educator.realityworks.ai',
    });
    expect(() => service.getBaseUrl()).toThrow(/API_BASE_URL is not configured/);
  });

  it('throws in production even when APP_URL points at localhost', () => {
    const { service } = buildService({
      'app.nodeEnv': 'production',
      'app.appUrl': 'http://localhost:3000',
    });
    expect(() => service.getBaseUrl()).toThrow(/API_BASE_URL is not configured/);
  });

  it('throws when NODE_ENV is development but APP_URL is unset (typical secret-not-wired case)', () => {
    const { service } = buildService({
      'app.nodeEnv': 'development',
    });
    expect(() => service.getBaseUrl()).toThrow(/API_BASE_URL is not configured/);
  });

  it('fails at boot via onModuleInit when the deployed env is misconfigured', () => {
    const { service } = buildService({
      'app.nodeEnv': 'production',
      'app.appUrl': 'https://educator.realityworks.ai',
    });
    expect(() => service.onModuleInit()).toThrow(/API_BASE_URL is not configured/);
  });
});
