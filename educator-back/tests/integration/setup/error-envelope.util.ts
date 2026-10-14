import request from 'supertest';

/** The unified error envelope `HttpExceptionFilter` answers every non-2xx route with. */
export interface ApiErrorBody {
  message?: unknown;
  data?: unknown;
  meta?: unknown;
  error?: unknown;
}

export const parseErrorBody = (res: request.Response): ApiErrorBody => {
  const body: unknown = res.body;
  if (typeof body === 'object' && body !== null) {
    return body as ApiErrorBody;
  }
  throw new Error('Expected response body to be an object');
};

/**
 * Asserts the unified `{ message, data, meta, error }` envelope `HttpExceptionFilter` produces
 * for a non-2xx response — replaces the old bespoke `{ status: 'FAILED', message, data }` shape.
 */
export const expectErrorEnvelope = (res: request.Response): void => {
  const body = parseErrorBody(res);
  expect(typeof body.message).toBe('string');
  expect(body.data).toBeNull();
  expect(body.meta).toBeNull();
};

/**
 * Asserts the unified `{ message, data, meta, error }` envelope `ResponseInterceptor` produces
 * for a 2xx response — replaces the old bespoke `{ status: 'SUCCESS', message, data }` shape.
 */
export const expectSuccessEnvelope = (res: request.Response): void => {
  const body = parseErrorBody(res);
  expect(typeof body.message).toBe('string');
  expect(body.error).toBeNull();
};

/**
 * Asserts the legacy `{ status: 'SUCCESS', message, data }` body that a not-yet-migrated
 * controller still returns. `ResponseInterceptor` only envelopes a `ResponseResult`; any other
 * handler payload reaches the client exactly as the handler produced it, so these routes keep
 * their bespoke shape until they are migrated.
 */
export const expectLegacySuccessBody = (res: request.Response): void => {
  const body = parseErrorBody(res) as ApiErrorBody & { status?: unknown };
  expect(body.status).toBe('SUCCESS');
  expect(typeof body.message).toBe('string');
};
