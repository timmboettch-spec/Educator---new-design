import { UnauthorizedException } from '@nestjs/common';
import { GoogleOAuthStateService } from '../../../src/google/google-oauth-state.service';
import { RedisService } from '../../../src/redis/redis.service';
import { LoggerService } from '../../../src/common/services';

describe('GoogleOAuthStateService', () => {
  const redisService = {
    setStrict: jest.fn(),
    getDelStrict: jest.fn(),
  } as unknown as jest.Mocked<RedisService>;

  const logger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  } as unknown as LoggerService;

  let service: GoogleOAuthStateService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GoogleOAuthStateService(redisService, logger);
  });

  it('creates a one-time state bound to school and educator', async () => {
    redisService.setStrict.mockResolvedValue(undefined);

    const state = await service.create('school-1', 'educator-1');

    expect(state).toEqual(expect.any(String));
    expect(redisService.setStrict.mock.calls[0]).toEqual([
      expect.stringContaining(state),
      {
        purpose: 'educator_connect',
        schoolId: 'school-1',
        educatorId: 'educator-1',
      },
      600,
    ]);
  });

  it('consumes a valid state once', async () => {
    redisService.getDelStrict.mockResolvedValue({
      schoolId: 'school-1',
      educatorId: 'educator-1',
    });

    await expect(service.validateAndConsume('state-1')).resolves.toEqual({
      purpose: 'educator_connect',
      schoolId: 'school-1',
      educatorId: 'educator-1',
    });
  });

  it('rejects missing or unknown state', async () => {
    await expect(service.validateAndConsume(undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    redisService.getDelStrict.mockResolvedValue(null);
    await expect(service.validateAndConsume('missing')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('creates and consumes a student login state', async () => {
    redisService.setStrict.mockResolvedValue(undefined);
    const state = await service.createStudentLoginState({
      googleCourseId: 'course-9',
      simulationId: 'sim-1',
    });
    expect(redisService.setStrict.mock.calls[0][1]).toEqual({
      purpose: 'student_login',
      googleCourseId: 'course-9',
      simulationId: 'sim-1',
    });

    redisService.getDelStrict.mockResolvedValue({
      purpose: 'student_login',
      googleCourseId: 'course-9',
      simulationId: 'sim-1',
    });
    await expect(service.validateAndConsume(state)).resolves.toEqual({
      purpose: 'student_login',
      googleCourseId: 'course-9',
      simulationId: 'sim-1',
    });
  });
});
