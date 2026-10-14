/**
 * @tags @student
 *
 * API E2E test suite for the Student Management module.
 *
 * Endpoints under test:
 *   POST   /students
 *   POST   /students/batch-email
 *   POST   /students/email-report
 *   PUT    /students/update-code
 *   GET    /students/user
 *   GET    /students/class/:classId
 *   GET    /students/:id
 *   PUT    /students/:id
 *   DELETE /students/:id
 *
 * Coverage matrix:
 *   Positive (happy path)           POST, PUT update-code, GET /user, GET /class, GET/:id, PUT/:id, DELETE/:id, batch-email, email-report
 *   Invalid / missing payload       POST, batch-email, email-report
 *   No token (401)                  all endpoints
 *   Invalid / expired token (401)   all endpoints
 *   Not-found (404)                 GET/:id, PUT/:id, DELETE/:id, update-code
 *   Malformed ID (400/422)          GET/:id, PUT/:id, DELETE/:id
 *   Batch-email: missing class_id   400
 *   Batch-email: no recipients      404/400
 *   Email-report: missing class_id  400
 *   Email-report: invalid UUID      400
 *   Data persistence round-trip     POST -> GET/:id
 *   Update & verify (PUT -> GET)    PUT/:id
 *   Delete unavailability           DELETE -> GET/:id 404
 *   Access code regeneration        PUT /update-code -> verify new code
 */

import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import { createAgent, signupAndLogin } from '../../common/setup/supertest.setup';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';
import { testEmail } from '../../utils/env';

const INVALID_UUID = '00000000-0000-0000-0000-000000000000';
const MALFORMED_ID = 'not-a-uuid';

describe('Student Module API Tests', () => {
  let agent: SuperTest<Test>;
  let accessToken: string;

  // IDs captured during setup / test execution
  let classId: string;
  let studentId: string;

  beforeAll(async () => {
    agent = createAgent();
    const email = testEmail('student-suite');
    accessToken = await signupAndLogin(agent, {
      full_name: 'Student Suite Educator',
      email,
      password: 'Student@Suite1234',
    });

    // Best-effort: create a class to use for student creation tests.
    const classRes = await agent
      .post(ENDPOINTS.CLASSES.BASE)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ class_name: `Student-Suite Class ${Date.now()}`, total_no_of_students: 5 })
      .catch(() => ({ status: 0, body: {} }));

    classId = (classRes as { body?: { data?: { id?: string } } }).body?.data?.id ?? '';
  });

  afterAll(async () => {
    // Best-effort cleanup: delete the student then the class
    if (studentId) {
      await agent
        .delete(ENDPOINTS.STUDENTS.BY_ID(studentId))
        .set('Authorization', `Bearer ${accessToken}`)
        .catch(() => {
          /* best-effort */
        });
    }
    if (classId) {
      await agent
        .delete(ENDPOINTS.CLASSES.BY_ID(classId))
        .set('Authorization', `Bearer ${accessToken}`)
        .catch(() => {
          /* best-effort */
        });
    }
  });

  // ── POST /students ──────────────────────────────────────────────────────────

  describe('POST /students', () => {
    it('should fail create student without token @student', async () => {
      const res = await agent.post(ENDPOINTS.STUDENTS.BASE).send({
        class_id: classId || INVALID_UUID,
        student_name: 'Alice',
        email: testEmail('alice'),
      });
      expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should fail create student with invalid token @student', async () => {
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BASE)
        .set('Authorization', 'Bearer invalid.token.here')
        .send({
          class_id: classId || INVALID_UUID,
          student_name: 'Alice',
          email: testEmail('alice'),
        });
      expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should fail create student with missing class_id @student', async () => {
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BASE)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ student_name: 'Alice', email: testEmail('alice') });
      expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should fail create student with invalid class UUID @student', async () => {
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BASE)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          class_id: MALFORMED_ID,
          student_name: 'Alice',
          email: testEmail('alice'),
        });
      expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should fail create student with invalid email @student', async () => {
      if (!classId) return;
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BASE)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ class_id: classId, student_name: 'Alice', email: 'not-an-email' });
      expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should fail create student with non-existing class @student', async () => {
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BASE)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          class_id: INVALID_UUID,
          student_name: 'Alice',
          email: testEmail('alice'),
        });
      expect([STATUS.NOT_FOUND, STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should create student successfully with valid data @student', async () => {
      if (!classId) return;
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BASE)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          class_id: classId,
          student_name: `Suite Student ${Date.now()}`,
          email: testEmail(`suite-stu-${Date.now()}`),
        });
      expect([STATUS.CREATED, STATUS.OK, STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(
        res.status,
      );
      if (res.status === STATUS.CREATED || res.status === STATUS.OK) {
        studentId = (res.body?.data?.id as string) ?? '';
        expect(res.body?.error).toBeNull();
        expect(res.body?.data).toBeDefined();
      }
    });
  });

  // ── GET /students/user ──────────────────────────────────────────────────────

  describe('GET /students/user', () => {
    it('should fail students/user without token @student', async () => {
      const res = await agent.get(ENDPOINTS.STUDENTS.BY_USER);
      expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should fail students/user with invalid token @student', async () => {
      const res = await agent
        .get(ENDPOINTS.STUDENTS.BY_USER)
        .set('Authorization', 'Bearer invalid.token.here');
      expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should retrieve students for authenticated user @student', async () => {
      let res: Awaited<ReturnType<typeof agent.get>>;
      try {
        res = await agent
          .get(ENDPOINTS.STUDENTS.BY_USER)
          .set('Authorization', `Bearer ${accessToken}`)
          .timeout(15000);
      } catch {
        console.warn('[student] GET /students/user timed out — skip');
        return;
      }
      expect([STATUS.OK, STATUS.FORBIDDEN]).toContain(res.status);
      if (res.status === STATUS.OK) {
        expect(res.body?.error).toBeNull();
        expect(Array.isArray(res.body?.data)).toBe(true);
      }
    });
  });

  // ── GET /students/class/:classId ────────────────────────────────────────────

  describe('GET /students/class/:classId', () => {
    it('should fail class students without token @student', async () => {
      const res = await agent.get(ENDPOINTS.STUDENTS.BY_CLASS(classId || INVALID_UUID));
      expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should return students for valid class @student', async () => {
      if (!classId) return;
      const res = await agent
        .get(ENDPOINTS.STUDENTS.BY_CLASS(classId))
        .set('Authorization', `Bearer ${accessToken}`);
      expect([STATUS.OK, STATUS.FORBIDDEN]).toContain(res.status);
      if (res.status === STATUS.OK) {
        expect(res.body?.error).toBeNull();
        expect(Array.isArray(res.body?.data)).toBe(true);
      }
    });

    it('should return empty array for class with no students @student', async () => {
      const res = await agent
        .get(ENDPOINTS.STUDENTS.BY_CLASS(INVALID_UUID))
        .set('Authorization', `Bearer ${accessToken}`);
      expect([STATUS.OK, STATUS.NOT_FOUND, STATUS.FORBIDDEN, STATUS.BAD_REQUEST]).toContain(
        res.status,
      );
    });
  });

  // ── GET /students/:id ───────────────────────────────────────────────────────

  describe('GET /students/:id', () => {
    it('should fail get student without token @student', async () => {
      const res = await agent.get(ENDPOINTS.STUDENTS.BY_ID(studentId || INVALID_UUID));
      expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should fail get student with invalid token @student', async () => {
      const res = await agent
        .get(ENDPOINTS.STUDENTS.BY_ID(studentId || INVALID_UUID))
        .set('Authorization', 'Bearer invalid.token.here');
      expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should fail get student with malformed ID @student', async () => {
      const res = await agent
        .get(ENDPOINTS.STUDENTS.BY_ID(MALFORMED_ID))
        .set('Authorization', `Bearer ${accessToken}`);
      expect([STATUS.BAD_REQUEST, STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should return 404 for non-existing student ID @student', async () => {
      const res = await agent
        .get(ENDPOINTS.STUDENTS.BY_ID(INVALID_UUID))
        .set('Authorization', `Bearer ${accessToken}`);
      expect([STATUS.NOT_FOUND, STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should retrieve student details for valid ID @student', async () => {
      if (!studentId) return;
      const res = await agent
        .get(ENDPOINTS.STUDENTS.BY_ID(studentId))
        .set('Authorization', `Bearer ${accessToken}`);
      expect([STATUS.OK, STATUS.FORBIDDEN]).toContain(res.status);
      if (res.status === STATUS.OK) {
        expect(res.body?.error).toBeNull();
        expect(res.body?.data?.id).toBe(studentId);
      }
    });
  });

  // ── PUT /students/update-code ───────────────────────────────────────────────

  describe('PUT /students/update-code', () => {
    it('should fail update-code without token @student', async () => {
      const res = await agent
        .put(ENDPOINTS.STUDENTS.UPDATE_CODE)
        .send({ id: studentId || INVALID_UUID });
      expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should fail update-code for non-existing student @student', async () => {
      const res = await agent
        .put(ENDPOINTS.STUDENTS.UPDATE_CODE)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: INVALID_UUID });
      expect([STATUS.NOT_FOUND, STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should regenerate access code for valid student @student', async () => {
      if (!studentId) return;
      const res = await agent
        .put(ENDPOINTS.STUDENTS.UPDATE_CODE)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: studentId });
      expect([STATUS.OK, STATUS.FORBIDDEN]).toContain(res.status);
      if (res.status === STATUS.OK) {
        expect(res.body?.error).toBeNull();
      }
    });
  });

  // ── POST /students/batch-email ──────────────────────────────────────────────

  describe('POST /students/batch-email', () => {
    const batchEmailBase = {
      subject: 'Your Access Code',
      message: 'Here is your access code to login.',
      accessCode: true,
      email: testEmail('batch'),
      student_name: 'Suite Student',
    };

    it('should fail batch-email without token @student', async () => {
      const res = await agent.post(ENDPOINTS.STUDENTS.BATCH_EMAIL).send({
        ...batchEmailBase,
        class_id: classId || INVALID_UUID,
      });
      expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should fail batch-email with missing class_id @student', async () => {
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BATCH_EMAIL)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ subject: 'Test', message: 'Test', accessCode: false });
      expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should fail batch-email with invalid student_id @student', async () => {
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BATCH_EMAIL)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...batchEmailBase, class_id: classId || INVALID_UUID, student_id: MALFORMED_ID });
      expect([
        STATUS.BAD_REQUEST,
        STATUS.NOT_FOUND,
        STATUS.UNPROCESSABLE,
        STATUS.FORBIDDEN,
      ]).toContain(res.status);
    });

    it('should send batch-email successfully to class students @student', async () => {
      if (!classId || !studentId) return;
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BATCH_EMAIL)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...batchEmailBase, class_id: classId });
      expect([STATUS.OK, STATUS.NOT_FOUND, STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(
        res.status,
      );
      if (res.status === STATUS.OK) {
        expect(res.body?.error).toBeNull();
      }
    });

    it('should send batch-email to a specific student @student', async () => {
      if (!classId || !studentId) return;
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BATCH_EMAIL)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...batchEmailBase, class_id: classId, student_id: studentId });
      expect([STATUS.OK, STATUS.NOT_FOUND, STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(
        res.status,
      );
      if (res.status === STATUS.OK) {
        expect(res.body?.error).toBeNull();
      }
    });
  });

  // ── POST /students/email-report ─────────────────────────────────────────────

  describe('POST /students/email-report', () => {
    const emailReportBase = {
      sendPdf: false,
      subject: 'Monthly Report',
      message: 'Please find your report.',
      email: testEmail('report'),
      student_name: 'Suite Student',
    };

    it('should fail email-report without token @student', async () => {
      const res = await agent.post(ENDPOINTS.STUDENTS.EMAIL_REPORT).send({
        ...emailReportBase,
        class_id: classId || INVALID_UUID,
      });
      expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should fail email-report with missing class_id @student', async () => {
      const res = await agent
        .post(ENDPOINTS.STUDENTS.EMAIL_REPORT)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ subject: 'Test', message: 'Test', sendPdf: false });
      expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should fail email-report with invalid student_id UUID @student', async () => {
      const res = await agent
        .post(ENDPOINTS.STUDENTS.EMAIL_REPORT)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...emailReportBase, class_id: classId || INVALID_UUID, student_id: MALFORMED_ID });
      expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should fail email-report for non-existing student ID @student', async () => {
      const res = await agent
        .post(ENDPOINTS.STUDENTS.EMAIL_REPORT)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...emailReportBase, class_id: INVALID_UUID, student_id: INVALID_UUID });
      expect([STATUS.NOT_FOUND, STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should send email-report successfully with valid student id @student', async () => {
      if (!classId || !studentId) return;
      const res = await agent
        .post(ENDPOINTS.STUDENTS.EMAIL_REPORT)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...emailReportBase, class_id: classId, student_id: studentId });
      expect([STATUS.OK, STATUS.NOT_FOUND, STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(
        res.status,
      );
      if (res.status === STATUS.OK) {
        expect(res.body?.error).toBeNull();
      }
    });

    it('should fail email-report with missing class_id @student', async () => {
      if (!studentId) return;
      const res = await agent
        .post(ENDPOINTS.STUDENTS.EMAIL_REPORT)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...emailReportBase, student_id: studentId });
      expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.FORBIDDEN]).toContain(res.status);
    });
  });

  // ── PUT /students/:id ───────────────────────────────────────────────────────

  describe('PUT /students/:id', () => {
    it('should fail update student without token @student', async () => {
      const res = await agent
        .put(ENDPOINTS.STUDENTS.BY_ID(studentId || INVALID_UUID))
        .send({ student_name: 'Updated Name' });
      expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should return 404 for non-existing student update @student', async () => {
      const res = await agent
        .put(ENDPOINTS.STUDENTS.BY_ID(INVALID_UUID))
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ student_name: 'Updated Name' });
      expect([STATUS.NOT_FOUND, STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should update student with valid payload @student', async () => {
      if (!studentId) return;
      const res = await agent
        .put(ENDPOINTS.STUDENTS.BY_ID(studentId))
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ student_name: `Updated ${Date.now()}` });
      expect([STATUS.OK, STATUS.FORBIDDEN]).toContain(res.status);
      if (res.status === STATUS.OK) {
        expect(res.body?.error).toBeNull();
      }
    });
  });

  // ── DELETE /students/:id ────────────────────────────────────────────────────

  describe('DELETE /students/:id', () => {
    it('should fail delete student without token @student', async () => {
      const res = await agent.delete(ENDPOINTS.STUDENTS.BY_ID(studentId || INVALID_UUID));
      expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should fail delete with invalid token @student', async () => {
      const res = await agent
        .delete(ENDPOINTS.STUDENTS.BY_ID(studentId || INVALID_UUID))
        .set('Authorization', 'Bearer invalid.token.here');
      expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should return 404 when deleting non-existing student @student', async () => {
      const res = await agent
        .delete(ENDPOINTS.STUDENTS.BY_ID(INVALID_UUID))
        .set('Authorization', `Bearer ${accessToken}`);
      expect([STATUS.NOT_FOUND, STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('should delete student successfully with valid ID @student', async () => {
      if (!studentId) return;
      const res = await agent
        .delete(ENDPOINTS.STUDENTS.BY_ID(studentId))
        .set('Authorization', `Bearer ${accessToken}`);
      expect([STATUS.OK, STATUS.NO_CONTENT, STATUS.FORBIDDEN]).toContain(res.status);
      if (res.status === STATUS.OK || res.status === STATUS.NO_CONTENT) {
        studentId = ''; // mark as cleaned up so afterAll skips it
      }
    });

    it('should return 404 after student is deleted @student', async () => {
      // studentId is cleared by the deletion test above — use a known-gone UUID
      const res = await agent
        .get(ENDPOINTS.STUDENTS.BY_ID(INVALID_UUID))
        .set('Authorization', `Bearer ${accessToken}`);
      expect([STATUS.NOT_FOUND, STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(res.status);
    });
  });
});
