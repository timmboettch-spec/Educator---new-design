import { describe, it, beforeAll, expect } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import { createAgent, signupAndLogin } from '../../common/setup/supertest.setup';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';

describe('Uploads Controller', () => {
  let agent: SuperTest<Test>;
  let accessToken = '';

  beforeAll(async () => {
    agent = createAgent();
    const email = `uploads-${Date.now()}@test.realityworks`;
    const password = 'Uploads@1234';
    accessToken = await signupAndLogin(agent, { full_name: 'Uploads User', email, password });
  });

  it('POST /uploads/profile-image — rejects without token', async () => {
    const res = await agent
      .post(ENDPOINTS.UPLOADS.PROFILE_IMAGE)
      .attach('file', Buffer.from('fake'), 'test.png');
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN, STATUS.NOT_FOUND]).toContain(res.status);
  });

  it('POST /uploads/profile-image — rejects with invalid token', async () => {
    const res = await agent
      .post(ENDPOINTS.UPLOADS.PROFILE_IMAGE)
      .set('Authorization', 'Bearer bad-token')
      .attach('file', Buffer.from('fake'), 'test.png');
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN, STATUS.NOT_FOUND]).toContain(res.status);
  });

  it('POST /uploads/profile-image — rejects empty payload with valid token', async () => {
    const res = await agent
      .post(ENDPOINTS.UPLOADS.PROFILE_IMAGE)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.NOT_FOUND]).toContain(res.status);
  });
});
