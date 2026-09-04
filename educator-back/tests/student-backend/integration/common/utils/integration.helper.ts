import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

export function httpGet(app: INestApplication, url: string, token?: string) {
  const req = request(app.getHttpServer()).get(url);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}

export function httpPost(app: INestApplication, url: string, body: unknown, token?: string) {
  const req = request(app.getHttpServer()).post(url).send(body);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}

export function httpPut(app: INestApplication, url: string, body: unknown, token?: string) {
  const req = request(app.getHttpServer()).put(url).send(body);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}

export function httpDelete(app: INestApplication, url: string, token?: string) {
  const req = request(app.getHttpServer()).delete(url);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}
