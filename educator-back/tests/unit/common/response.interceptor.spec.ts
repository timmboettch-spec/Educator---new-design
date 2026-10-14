import { CallHandler, ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18nService } from 'nestjs-i18n';
import { of } from 'rxjs';
import { ResponseInterceptor } from 'src/common/interceptors/response.interceptor';
import { ResponseResult } from 'src/common/class/response.class';
import { AppStatus } from 'src/common/utils/messages';

describe('ResponseInterceptor', () => {
  let i18n: { t: jest.Mock };
  let reflector: { get: jest.Mock };
  let interceptor: ResponseInterceptor<unknown>;
  let response: { statusCode: number; status: jest.Mock; headersSent: boolean };

  beforeEach(() => {
    i18n = { t: jest.fn().mockImplementation((key: string) => key) };
    reflector = { get: jest.fn().mockReturnValue(undefined) };
    interceptor = new ResponseInterceptor(
      i18n as unknown as I18nService,
      reflector as unknown as Reflector,
    );
    response = { statusCode: HttpStatus.OK, status: jest.fn(), headersSent: false };
  });

  const buildContext = (): ExecutionContext =>
    ({
      getType: () => 'http',
      getHandler: () => jest.fn(),
      switchToHttp: () => ({
        getResponse: () => response,
      }),
    }) as unknown as ExecutionContext;

  const buildHandler = (body: unknown): CallHandler => ({
    handle: () => of(body),
  });

  const intercept = (body: unknown): Promise<unknown> =>
    new Promise((resolve) => {
      interceptor
        .intercept(buildContext(), buildHandler(body))
        .subscribe((result) => resolve(result));
    });

  it('passes a legacy `{ status, message, data }` body through untouched', async () => {
    const body = {
      status: AppStatus.SUCCESS,
      message: 'Class created successfully',
      data: { id: '1' },
    };

    const result = await intercept(body);

    // Only a `ResponseResult` is enveloped; a raw body is the handler's own payload.
    expect(result).toBe(body);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('passes an array body through untouched', async () => {
    const body = [{ id: '1' }, { id: '2' }];

    const result = await intercept(body);

    expect(result).toBe(body);
  });

  it('passes a raw body declaring `message`/`data` through untouched', async () => {
    const body = { message: 'not a status field', data: 'unrelated' };

    const result = await intercept(body);

    expect(result).toBe(body);
    expect(i18n.t).not.toHaveBeenCalled();
  });

  it('passes a body with neither `message` nor `data` through untouched', async () => {
    // `readyz`'s payload has a `status` but no `message`/`data`; it reaches the client verbatim,
    // and the status code it set via `@Res({ passthrough: true })` is left alone too.
    const body = { status: 'ok', checks: {} };

    const result = await intercept(body);

    expect(result).toBe(body);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('preserves the response preset for a `ResponseResult` carrying no `statusCode`', async () => {
    response.statusCode = HttpStatus.CREATED;

    await intercept(new ResponseResult({ data: { id: '1' } }));

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CREATED);
  });

  it('uses an explicit `ResponseResult.statusCode` over the already-set response status', async () => {
    response.statusCode = HttpStatus.OK;

    await intercept(new ResponseResult({ data: null, statusCode: HttpStatus.CREATED }));

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CREATED);
  });

  it('falls back to the i18n default success message when `ResponseResult` carries none', async () => {
    await intercept(new ResponseResult({ data: null }));

    expect(i18n.t).toHaveBeenCalledWith('success.COMMON.OK', { lang: undefined });
  });

  it('passes a non-HTTP context (e.g. a WebSocket gateway) straight through untouched', async () => {
    const body = { event: 'ping' };
    const context = { getType: () => 'ws' } as unknown as ExecutionContext;

    const result = await new Promise((resolve) => {
      interceptor.intercept(context, buildHandler(body)).subscribe((value) => resolve(value));
    });

    expect(result).toBe(body);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('leaves a `@Redirect()` route body untouched so Nest can still read its `url`', async () => {
    reflector.get.mockReturnValue({ url: '', statusCode: 302 });
    const body = { url: 'https://example.com/callback', statusCode: 302 };

    const result = await intercept(body);

    expect(result).toBe(body);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('leaves a raw `@Res()` route untouched once headers have already been sent', async () => {
    response.headersSent = true;
    const body = { anything: 'the handler already wrote' };

    const result = await intercept(body);

    expect(result).toBe(body);
    expect(response.status).not.toHaveBeenCalled();
  });
});
