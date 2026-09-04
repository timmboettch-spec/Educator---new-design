import type { INestApplication } from '@nestjs/common';
import request, { type Test } from 'supertest';

export type ApiResponse = request.Response;

function server(app: INestApplication): ReturnType<typeof request> {
  return request(app.getHttpServer());
}

function withAuth(req: Test, token?: string): Test {
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}

export function apiGet(app: INestApplication, url: string, token?: string): Test {
  return withAuth(server(app).get(url), token);
}

export function apiPost(app: INestApplication, url: string, body: object, token?: string): Test {
  return withAuth(server(app).post(url).send(body), token);
}

export function apiPut(app: INestApplication, url: string, body: object, token?: string): Test {
  return withAuth(server(app).put(url).send(body), token);
}

export function apiPatch(app: INestApplication, url: string, body: object, token?: string): Test {
  return withAuth(server(app).patch(url).send(body), token);
}

export function apiDelete(app: INestApplication, url: string, token?: string): Test {
  return withAuth(server(app).delete(url), token);
}
