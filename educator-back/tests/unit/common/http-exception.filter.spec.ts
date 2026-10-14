import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { QueryFailedError } from 'typeorm';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { BulkOperationException } from 'src/common/exceptions/bulk-operation.exception';
import { HttpExceptionFilter } from 'src/common/filters/http-exception.filter';
import { LoggerService } from 'src/common/services';
import { encodeI18nKey } from 'src/common/utils/i18n-key.util';

/** Echoes the key with its args so assertions can see what was translated. */
const i18n = {
  t: jest.fn((key: string, options?: { args?: Record<string, unknown> }) =>
    options?.args ? `T(${key}:${JSON.stringify(options.args)})` : `T(${key})`,
  ),
};

const runFilter = (exception: Error): { status: number; body: unknown } => {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    getHeader: jest.fn(),
    setHeader: jest.fn(),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'POST', url: '/api/class-simulations/bulk' }),
    }),
  } as unknown as ArgumentsHost;

  const filter = new HttpExceptionFilter(
    i18n as unknown as I18nService,
    { error: jest.fn() } as unknown as LoggerService,
  );
  filter.catch(exception, host);

  return {
    status: response.status.mock.calls[0][0] as number,
    body: response.json.mock.calls[0][0] as unknown,
  };
};

describe('HttpExceptionFilter — BulkOperationException', () => {
  it('answers 422 with every record outcome in `error`, messages translated', () => {
    const exception = new BulkOperationException(
      encodeI18nKey('class-simulation.BULK_ASSIGN.FAILED', { failed: 1, total: 2 }),
      {
        total: 2,
        failed: 1,
        results: [
          { classId: 'c-1', simulationId: 's-1', status: 'VALID' },
          {
            classId: 'c-2',
            simulationId: 's-1',
            status: 'FAILED',
            reason: 'CLASS_NOT_ACCESSIBLE',
            message: 'class-simulation.BULK_ASSIGN.CLASS_NOT_ACCESSIBLE',
          },
        ],
      },
    );

    const { status, body } = runFilter(exception);

    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(body).toEqual({
      message: 'T(class-simulation.BULK_ASSIGN.FAILED:{"failed":1,"total":2})',
      data: null,
      meta: null,
      error: {
        total: 2,
        failed: 1,
        results: [
          { classId: 'c-1', simulationId: 's-1', status: 'VALID' },
          {
            classId: 'c-2',
            simulationId: 's-1',
            status: 'FAILED',
            reason: 'CLASS_NOT_ACCESSIBLE',
            message: 'T(class-simulation.BULK_ASSIGN.CLASS_NOT_ACCESSIBLE)',
          },
        ],
      },
    });
  });

  it('leaves a plain HttpException with error: null (unchanged behaviour)', () => {
    const { status, body } = runFilter(new BadRequestException('error.COMMON.BAD_REQUEST'));
    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body).toEqual({
      message: 'T(error.COMMON.BAD_REQUEST)',
      data: null,
      meta: null,
      error: null,
    });
  });
});

describe('HttpExceptionFilter — constraint violations', () => {
  const queryFailed = (code: string, constraint: string): QueryFailedError =>
    new QueryFailedError('INSERT', [], Object.assign(new Error('violation'), { code, constraint }));

  it.each([
    'UQ_simulation_reports_student_scenario_mode_attempt',
    'UQ_simulation_reports_transcript_id',
  ])('maps 23505 on %s to the generic duplicate-entry 409', (constraint) => {
    const { status, body } = runFilter(queryFailed('23505', constraint));

    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body).toMatchObject({ message: expect.stringContaining('error.DB.DUPLICATE_ENTRY') });
  });

  it.each([
    'CHK_simulation_reports_assessment_attempt_number_range',
    'CHK_student_simulation_progress_assessment_attempts_range',
    'CHK_something_else',
  ])('maps 23514 on %s to a 400 INVALID_REQUEST', (constraint) => {
    const { status, body } = runFilter(queryFailed('23514', constraint));

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body).toMatchObject({ message: `T(${ERROR_MSG.DB.INVALID_REQUEST})` });
  });
});
