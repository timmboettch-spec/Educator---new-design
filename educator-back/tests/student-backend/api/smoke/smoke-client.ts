/**
 * supertest wrapper — all requests hit BASE_BACKEND_URL (live deployed env).
 * supertest with a URL string is the idiomatic, production-standard method
 * for API smoke testing in a Jest + Node.js stack.
 * Never throws on HTTP errors — tests assert status codes directly.
 */
import request, { type Response } from 'supertest';

// The student-backend module is mounted under an additional `/students-backend`
// path segment (see src/student-backend/app.module.ts RouterModule config),
// so routes live at e.g. https://host/api/students-backend/auth/login.
const API_BASE = (process.env.BASE_BACKEND_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export const BASE = `${API_BASE.replace(/\/students-backend$/, '')}/students-backend`;

// Health endpoints (healthz, readyz) live under the student-backend module too
// (e.g. https://host/api/students-backend/healthz), not at the bare server root
export const BASE_ROOT = API_BASE.replace(/\/api$/, '');

const auth = (req: request.Test, token?: string) =>
  token ? req.set('Authorization', `Bearer ${token}`) : req;

export const smokeGet = (path: string, token?: string, timeoutMs = 15_000): Promise<Response> =>
  auth(request(BASE).get(path).timeout(timeoutMs), token);

// For endpoints outside the /api prefix (healthz, readyz)
export const smokeGetRoot = (path: string): Promise<Response> => request(BASE_ROOT).get(path);

export const smokePost = (path: string, body: unknown, token?: string): Promise<Response> =>
  auth(
    request(BASE)
      .post(path)
      .send(body as object),
    token,
  );

export const smokePatch = (path: string, body: unknown, token?: string): Promise<Response> =>
  auth(
    request(BASE)
      .patch(path)
      .send(body as object),
    token,
  );

export const smokeDelete = (path: string, token?: string): Promise<Response> =>
  auth(request(BASE).delete(path), token);
