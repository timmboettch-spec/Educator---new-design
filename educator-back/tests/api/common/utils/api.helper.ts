import { SuperTest, Test } from 'supertest';

export interface ApiResponse<T = unknown> {
  message: string;
  data: T;
  meta?: unknown;
  error?: string | Record<string, string> | null;
}

/**
 * Asserts HTTP status code and returns the parsed response body.
 */
export async function expectStatus<T = unknown>(
  req: Test,
  expectedStatus: number | number[],
): Promise<ApiResponse<T>> {
  const res = await req;
  const accepted = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (!accepted.includes(res.status)) {
    console.error(
      `[api.helper] Expected ${JSON.stringify(expectedStatus)}, got ${res.status}.\nBody: ${JSON.stringify(res.body)}`,
    );
  }
  expect(accepted).toContain(res.status);
  return res.body as ApiResponse<T>;
}

/**
 * Asserts the response envelope reports success — every route now answers with the unified
 * `{ message, data, meta, error }` envelope, so a success response always has a null `error`.
 */
export function expectSuccess(body: ApiResponse): void {
  expect(body.error ?? null).toBeNull();
}

/**
 * Asserts the response envelope reports failure — every error response now goes through the
 * global `HttpExceptionFilter`'s unified `{ message, data, meta, error }` envelope, so `data`
 * is always `null` and `message` always a string, regardless of which module raised the error.
 */
export function expectFailed(body: ApiResponse): void {
  expect(body.data).toBeNull();
  expect(typeof body.message).toBe('string');
}

/**
 * GET helper — returns the supertest Test (not awaited).
 */
export function get(agent: SuperTest<Test>, url: string, token?: string): Test {
  const req = agent.get(url).set('Accept', 'application/json');
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req;
}

/**
 * POST helper — returns the supertest Test (not awaited).
 */
export function post(agent: SuperTest<Test>, url: string, body: object, token?: string): Test {
  const req = agent.post(url).set('Accept', 'application/json').send(body);
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req;
}

/**
 * PATCH helper — returns the supertest Test (not awaited).
 */
export function patch(agent: SuperTest<Test>, url: string, body: object, token?: string): Test {
  const req = agent.patch(url).set('Accept', 'application/json').send(body);
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req;
}

/**
 * DELETE helper — returns the supertest Test (not awaited).
 */
export function del(agent: SuperTest<Test>, url: string, token?: string): Test {
  const req = agent.delete(url).set('Accept', 'application/json');
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req;
}

/**
 * Asserts HTTP status is one of an allowed set.
 */
export function expectOneOf(actual: number, allowed: number[]): void {
  if (!allowed.includes(actual)) {
    throw new Error(`Expected status to be one of [${allowed.join(', ')}], but received ${actual}`);
  }
}
