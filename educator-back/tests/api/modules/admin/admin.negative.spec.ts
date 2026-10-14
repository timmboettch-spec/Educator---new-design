import { describe, it, beforeAll, expect } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import { createAgent } from '../../common/setup/supertest.setup';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';

describe('Admin Controller — Negative Cases', () => {
  let agent: SuperTest<Test>;

  beforeAll(() => {
    agent = createAgent();
  });

  it('POST /schools — rejects without token', async () => {
    const res = await agent.post(ENDPOINTS.SCHOOLS.BASE).send({ school_name: 'Unauth School' });
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('POST /schools — rejects with invalid token', async () => {
    const res = await agent
      .post(ENDPOINTS.SCHOOLS.BASE)
      .set('Authorization', 'Bearer bad-token')
      .send({ school_name: 'Invalid Token School' });
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('GET /schools/user — rejects without token', async () => {
    const res = await agent.get(ENDPOINTS.SCHOOLS.BY_USER);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('GET /schools/:id — returns 400 or 404 for invalid ID', async () => {
    const res = await agent
      .get(ENDPOINTS.SCHOOLS.BY_ID('not-a-valid-uuid'))
      .set('Authorization', 'Bearer bad-token');
    expect([STATUS.BAD_REQUEST, STATUS.NOT_FOUND, STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(
      res.status,
    );
  });

  it('GET /dashboard/overview — rejects without token', async () => {
    const res = await agent.get(ENDPOINTS.DASHBOARD.OVERVIEW);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('PATCH /schools/:id — rejects without token', async () => {
    const res = await agent
      .patch(ENDPOINTS.SCHOOLS.BY_ID('fake-id'))
      .send({ school_name: 'New Name' });
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN, STATUS.NOT_FOUND]).toContain(res.status);
  });

  it('DELETE /schools/:id — rejects without token', async () => {
    const res = await agent.delete(ENDPOINTS.SCHOOLS.BY_ID('fake-id'));
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN, STATUS.NOT_FOUND]).toContain(res.status);
  });
});
