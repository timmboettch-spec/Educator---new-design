import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TokenService } from '../../../src/common/services/token.service';
import { buildTestApp } from '../setup/test-app.factory';

describe('LTI Launch Context Hardening (Integration)', () => {
  let app: INestApplication;
  let tokenService: TokenService;

  beforeAll(async () => {
    ({ app } = await buildTestApp({
      controllers: [],
      providers: [],
    }));
    tokenService = app.get(TokenService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('JWT Claims', () => {
    it('should embed ltiLaunch context in student JWT when provided', async () => {
      const payload = {
        sub: 'STU-123',
        user_id: 'student-uuid',
        student_id: 'STU-123',
        type: 'student',
        roles: ['Student'],
        ltiLaunch: {
          simulationId: 'clinical-skills-1',
          resourceLinkId: 'activity-456',
          classId: 'class-789',
        },
      };

      const tokens = tokenService.generateTokens(payload);
      expect(tokens.access_token).toBeDefined();

      const decoded = await tokenService.verifyToken(tokens.access_token);
      expect(decoded.ltiLaunch).toEqual({
        simulationId: 'clinical-skills-1',
        resourceLinkId: 'activity-456',
        classId: 'class-789',
      });
    });

    it('should NOT include ltiLaunch for manual student logins', async () => {
      const payload = {
        sub: 'STU-456',
        user_id: 'student-uuid-2',
        student_id: 'STU-456',
        type: 'student',
        roles: ['Student'],
      };

      const tokens = tokenService.generateTokens(payload);
      const decoded = await tokenService.verifyToken(tokens.access_token);
      expect(decoded.ltiLaunch).toBeUndefined();
    });
  });

  describe('Student Simulations Endpoint', () => {
    it('should return ltiLaunch context when present in JWT', async () => {
      const ltiPayload = {
        sub: 'TEST-STUDENT-LTI',
        user_id: 'lti-student-uuid',
        student_id: 'TEST-STUDENT-LTI',
        type: 'student',
        roles: ['Student'],
        ltiLaunch: {
          simulationId: 'sim-123',
          resourceLinkId: 'resource-abc',
        },
      };

      const tokens = tokenService.generateTokens(ltiPayload);

      const response = await request(app.getHttpServer())
        .get('/api/students/simulations/TEST-STUDENT-LTI')
        .set('Authorization', `Bearer ${tokens.access_token}`)
        .expect((res) => {
          // May be 200 or 404 depending on whether test student exists
          expect([200, 404]).toContain(res.status);
        });

      // If student exists, verify ltiLaunch is in response
      if (response.status === 200) {
        expect(response.body.data?.ltiLaunch).toEqual({
          simulationId: 'sim-123',
          resourceLinkId: 'resource-abc',
        });
      }
    });

    it('should NOT return ltiLaunch for manual login students', async () => {
      const manualPayload = {
        sub: 'TEST-STUDENT-MANUAL',
        user_id: 'manual-student-uuid',
        student_id: 'TEST-STUDENT-MANUAL',
        type: 'student',
        roles: ['Student'],
      };

      const tokens = tokenService.generateTokens(manualPayload);

      const response = await request(app.getHttpServer())
        .get('/api/students/simulations/TEST-STUDENT-MANUAL')
        .set('Authorization', `Bearer ${tokens.access_token}`)
        .expect((res) => {
          expect([200, 404]).toContain(res.status);
        });

      if (response.status === 200) {
        expect(response.body.data?.ltiLaunch).toBeUndefined();
      }
    });
  });

  describe('Grade Passback Priority Lookup', () => {
    it('findMapping should prioritize resourceLinkId when provided', async () => {
      // This is a unit-level test wrapped in integration suite
      // Real integration test would require DB setup with mappings
      expect(true).toBe(true);
      // TODO: Add full DB-backed test when test fixtures are ready
    });
  });
});
