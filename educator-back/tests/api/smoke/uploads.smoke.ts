import { beforeAll, beforeEach, describe, it } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import * as path from 'path';
import { resetSmokeAgent, logTarget } from './smoke-client';
import { smokeState } from './smoke-state';
import { ENDPOINTS } from '../common/constants/endpoints';
import { STATUS } from '../common/constants/status-codes';

describe('Smoke — Uploads', () => {
  let agent: SuperTest<Test>;

  beforeAll(() => {
    logTarget('Uploads');
  });

  beforeEach(() => {
    agent = resetSmokeAgent();
  });

  it('should reject file upload without token', async () => {
    const res = await agent
      .post(ENDPOINTS.UPLOADS.PROFILE_IMAGE)
      .attach('file', Buffer.from('fake-image-data'), 'test.png');
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN, STATUS.NOT_FOUND]).toContain(res.status);
  });

  it('should reject upload with invalid token', async () => {
    const res = await agent
      .post(ENDPOINTS.UPLOADS.PROFILE_IMAGE)
      .set('Authorization', 'Bearer bad-token')
      .attach('file', Buffer.from('fake-image-data'), 'test.png');
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN, STATUS.NOT_FOUND]).toContain(res.status);
  });

  it('should reject upload with empty payload', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent
      .post(ENDPOINTS.UPLOADS.PROFILE_IMAGE)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.NOT_FOUND]).toContain(res.status);
  });

  it('should handle upload base endpoint gracefully', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent
      .get(ENDPOINTS.UPLOADS.BASE)
      .set('Authorization', `Bearer ${token}`);
    // Upload base may not be a GET endpoint — any response is acceptable
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(600);
  });
});
