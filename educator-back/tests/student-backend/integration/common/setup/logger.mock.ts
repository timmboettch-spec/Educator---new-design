import { LoggerService } from 'src/common/services';

export const loggerServiceTestProvider = {
  provide: LoggerService,
  useValue: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    fatal: jest.fn(),
    logRequestTrace: jest.fn(),
  },
};
