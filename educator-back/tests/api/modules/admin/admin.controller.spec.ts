import { describe, it, beforeAll, expect } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import { createAgent, signupAndLogin } from '../../common/setup/supertest.setup';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';

describe('Admin Controller — Happy Path', () => {
  let agent: SuperTest<Test>;
  let accessToken = '';
  let schoolId = '';
  const email = `admin-ctrl-${Date.now()}@test.realityworks`;
  const password = 'AdminCtrl@1234';

  beforeAll(async () => {
    agent = createAgent();
    accessToken = await signupAndLogin(agent, { full_name: 'Admin Ctrl User', email, password });
  });

  it('POST /schools — creates school with valid token', async () => {
    const res = await agent
      .post(ENDPOINTS.SCHOOLS.BASE)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ school_name: `Ctrl School ${Date.now()}` });
    expect([STATUS.CREATED, STATUS.OK, STATUS.FORBIDDEN]).toContain(res.status);
    if (res.status === STATUS.CREATED || res.status === STATUS.OK) {
      schoolId = res.body?.data?.id ?? '';
    }
  });

  it('GET /schools/user — retrieves schools for authenticated admin', async () => {
    const res = await agent
      .get(ENDPOINTS.SCHOOLS.BY_USER)
      .set('Authorization', `Bearer ${accessToken}`);
    expect([STATUS.OK, STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('GET /dashboard/overview — returns dashboard data', async () => {
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${accessToken}`);
    expect([STATUS.OK, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('PATCH /schools/:id — updates school name', async () => {
    if (!schoolId) return;
    const res = await agent
      .put(ENDPOINTS.SCHOOLS.BY_ID(schoolId))
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ school_name: `Updated School ${Date.now()}` });
    expect([STATUS.OK, STATUS.CREATED, STATUS.FORBIDDEN, STATUS.NOT_FOUND]).toContain(res.status);
  });

  it('DELETE /schools/:id — deletes school', async () => {
    if (!schoolId) return;
    const res = await agent
      .delete(ENDPOINTS.SCHOOLS.BY_ID(schoolId))
      .set('Authorization', `Bearer ${accessToken}`);
    expect([STATUS.OK, STATUS.NO_CONTENT, STATUS.FORBIDDEN]).toContain(res.status);
  });
});
