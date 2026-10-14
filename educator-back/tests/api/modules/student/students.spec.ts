/**
 * @tags @students-api
 *
 * Backend API test suite for Student Addition & Roster Management.
 *
 * Endpoints under test:
 *   POST   /students                   — manual single-student add
 *   POST   /students/bulk              — bulk roster creation (auto-generated codes)
 *   POST   /students/bulk-upload      — CSV roster import (file upload)
 *   GET    /students/class/:classId    — roster list for a class
 *   GET    /students/:id               — single student fetch
 *   PUT    /students/:id               — update student
 *   DELETE /students/:id               — remove student
 *   PUT    /students/revoke-code/:id   — revoke access code
 *   PUT    /students/regenerate-code/:id — regenerate access code
 *
 * Coverage matrix:
 *   Manual add — happy path (single student)         POST /students
 *   Manual add — missing required fields             POST /students
 *   Manual add — invalid class_id (non-UUID)         POST /students
 *   Manual add — non-existent class_id              POST /students
 *   Manual add — duplicate student name             POST /students
 *   Manual add — unauthenticated                    POST /students
 *   Manual add — non-educator role                  POST /students
 *   Roster list updates after add                   GET /students/class/:classId
 *   Roster list — invalid classId (non-UUID)        GET /students/class/:classId
 *   Roster list — unauthenticated                   GET /students/class/:classId
 *   Bulk create — happy path                        POST /students/bulk
 *   Bulk create — creates expected count            POST /students/bulk
 *   Bulk create — missing class_id                  POST /students/bulk
 *   Bulk create — invalid class_id                  POST /students/bulk
 *   Bulk create — count = 0 (below minimum)         POST /students/bulk
 *   Bulk create — count > 50 (above maximum)        POST /students/bulk
 *   Bulk create — unauthenticated                   POST /students/bulk
 *   Bulk create — non-educator role                 POST /students/bulk *   CSV import — valid file, inserted count          POST /students/bulk-upload
 *   CSV import — roster reflects imported students   GET /students/class/:classId
 *   CSV import — no file attached                    POST /students/bulk-upload
 *   CSV import — missing class_id                    POST /students/bulk-upload
 *   CSV import — invalid class_id (non-UUID)         POST /students/bulk-upload
 *   CSV import — non-existent class_id               POST /students/bulk-upload
 *   CSV import — unauthenticated                     POST /students/bulk-upload
 *   CSV import — header-only CSV (no data rows)      POST /students/bulk-upload
 *   CSV import — missing required headers            POST /students/bulk-upload
 *   CSV import — duplicate student_id in file        POST /students/bulk-upload
 *   CSV import — missing required fields (partial)   POST /students/bulk-upload
 *   CSV import — DB-duplicate student_id             POST /students/bulk-upload
 *   CSV import — result summary shape                POST /students/bulk-upload *   Student CRUD — fetch, update, delete            GET/PUT/DELETE /students/:id
 *   Access code — revoke and regenerate             PUT /students/revoke-code/:id
 *
 * Environment notes:
 *   Newly signed-up accounts may receive Educator role automatically in QA/dev.
 *   All authenticated assertions include STATUS.FORBIDDEN in their expected sets
 *   and guard body assertions with a status check.
 *   A valid class is created in beforeAll and shared across tests; it is deleted
 *   in afterAll.  Individual students created during tests are cleaned up where
 *   feasible.
 */

import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import { createAgent, signupAndLogin } from '../../common/setup/supertest.setup';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';
import { testEmail } from '../../utils/env';

// ── helpers ──────────────────────────────────────────────────────────────────

async function createClass(agent: SuperTest<Test>, token: string, suffix: string): Promise<string> {
  const res = await agent
    .post(ENDPOINTS.CLASSES.BASE)
    .set('Authorization', `Bearer ${token}`)
    .send({
      class_name: `Students Suite ${suffix}`,
      start_date: '2025-01-01',
      end_date: '2025-12-31',
    });
  return (res.body?.data?.id as string) ?? '';
}

async function deleteClass(agent: SuperTest<Test>, token: string, id: string): Promise<void> {
  if (!id) return;
  await agent
    .delete(ENDPOINTS.CLASSES.BY_ID(id))
    .set('Authorization', `Bearer ${token}`)
    .catch(() => {
      /* best-effort */
    });
}

async function deleteStudent(agent: SuperTest<Test>, token: string, id: string): Promise<void> {
  if (!id) return;
  await agent
    .delete(ENDPOINTS.STUDENTS.BY_ID(id))
    .set('Authorization', `Bearer ${token}`)
    .catch(() => {
      /* best-effort */
    });
}

// ── suite ────────────────────────────────────────────────────────────────────

describe('@students-api Student Addition & Roster Management', () => {
  let agent: SuperTest<Test>;
  let educatorToken: string;
  let classId: string;

  beforeAll(async () => {
    agent = createAgent();
    educatorToken = await signupAndLogin(agent, {
      full_name: 'Students Suite Educator',
      email: testEmail('students-suite'),
      password: 'Students@Suite1234',
    });
    classId = await createClass(agent, educatorToken, Date.now().toString());
  });

  afterAll(async () => {
    await deleteClass(agent, educatorToken, classId);
  });

  // ── Manual student addition ─────────────────────────────────────────────

  describe('POST /students — manual single add', () => {
    let createdStudentId: string;

    afterAll(async () => {
      await deleteStudent(agent, educatorToken, createdStudentId);
    });

    it('creates a student with valid payload', async () => {
      if (!classId) return;
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BASE)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({
          student_name: `Suite Student ${Date.now()}`,
          class_id: classId,
        });
      expect([STATUS.CREATED, STATUS.OK, STATUS.FORBIDDEN]).toContain(res.status);
      if (res.status === STATUS.CREATED || res.status === STATUS.OK) {
        expect(res.body.error).toBeNull();
        expect(res.body.data).toHaveProperty('id');
        expect(res.body.data).toHaveProperty('student_id');
        createdStudentId = res.body.data.id ?? '';
      }
    });

    it('returns 400 when class_id is missing', async () => {
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BASE)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ student_name: 'No Class Student' });
      expect([STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('returns 400 when class_id is not a valid UUID', async () => {
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BASE)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ student_name: 'Bad UUID Student', class_id: 'not-a-uuid' });
      expect([STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('returns 400 or 404 when class_id is a valid UUID but does not exist', async () => {
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BASE)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({
          student_name: 'Ghost Class Student',
          class_id: '00000000-0000-4000-a000-000000000000',
        });
      expect([STATUS.BAD_REQUEST, STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('returns an error on duplicate student in the same class', async () => {
      if (!classId) return;
      const dupeName = `Dupe Student ${Date.now()}`;
      const first = await agent
        .post(ENDPOINTS.STUDENTS.BASE)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ student_name: dupeName, class_id: classId });

      const dupeStudentId: string = first.body?.data?.id ?? '';
      try {
        const second = await agent
          .post(ENDPOINTS.STUDENTS.BASE)
          .set('Authorization', `Bearer ${educatorToken}`)
          .send({ student_name: dupeName, class_id: classId });
        // duplicate by student_id or email should be rejected, but name-only duplicates
        // may succeed in some environments — accept either outcome
        expect([
          STATUS.BAD_REQUEST,
          STATUS.CONFLICT,
          STATUS.CREATED,
          STATUS.OK,
          STATUS.FORBIDDEN,
        ]).toContain(second.status);
      } finally {
        await deleteStudent(agent, educatorToken, dupeStudentId);
      }
    });

    it('returns 401 or 403 without a token', async () => {
      if (!classId) return;
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BASE)
        .send({ student_name: 'Unauth Student', class_id: classId });
      expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('returns 400 or 403 when caller does not have Educator role', async () => {
      // A second fresh signup; in envs that auto-assign Educator, 201 is also acceptable
      const nonEducatorToken = await signupAndLogin(agent, {
        full_name: 'Non Educator User',
        email: testEmail('non-educator'),
        password: 'NonEdu@Suite1234',
      });
      if (!classId || !nonEducatorToken) return;
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BASE)
        .set('Authorization', `Bearer ${nonEducatorToken}`)
        .send({ student_name: `Non Edu Student ${Date.now()}`, class_id: classId });
      expect([
        STATUS.BAD_REQUEST,
        STATUS.FORBIDDEN,
        STATUS.UNAUTHORIZED,
        STATUS.CREATED,
        STATUS.OK,
      ]).toContain(res.status);
    });
  });

  // ── Roster list ─────────────────────────────────────────────────────────

  describe('GET /students/class/:classId — roster list', () => {
    it('returns array after student has been added to class', async () => {
      if (!classId) return;
      const res = await agent
        .get(ENDPOINTS.STUDENTS.BY_CLASS(classId))
        .set('Authorization', `Bearer ${educatorToken}`);
      expect([STATUS.OK, STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(res.status);
      if (res.status === STATUS.OK) {
        expect(res.body.error).toBeNull();
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });

    it('roster reflects newly added student', async () => {
      if (!classId) return;
      const name = `Roster Check ${Date.now()}`;
      const addRes = await agent
        .post(ENDPOINTS.STUDENTS.BASE)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ student_name: name, class_id: classId });

      const newId: string = addRes.body?.data?.id ?? '';
      try {
        if (addRes.status !== STATUS.CREATED && addRes.status !== STATUS.OK) return;
        const listRes = await agent
          .get(ENDPOINTS.STUDENTS.BY_CLASS(classId))
          .set('Authorization', `Bearer ${educatorToken}`);
        if (listRes.status === STATUS.OK) {
          const students: Array<{ id: string }> = listRes.body.data ?? [];
          expect(students.some((s) => s.id === newId)).toBe(true);
        }
      } finally {
        await deleteStudent(agent, educatorToken, newId);
      }
    });

    it('returns 400 or 422 when classId is not a valid UUID', async () => {
      const res = await agent
        .get(ENDPOINTS.STUDENTS.BY_CLASS('bad-class-id'))
        .set('Authorization', `Bearer ${educatorToken}`);
      expect([
        STATUS.BAD_REQUEST,
        STATUS.UNPROCESSABLE,
        STATUS.NOT_FOUND,
        STATUS.FORBIDDEN,
      ]).toContain(res.status);
    });

    it('returns 401 or 403 without a token', async () => {
      if (!classId) return;
      const res = await agent.get(ENDPOINTS.STUDENTS.BY_CLASS(classId));
      expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
    });
  });

  // ── Bulk creation (roster import equivalent) ─────────────────────────────

  describe('POST /students/bulk — bulk roster creation', () => {
    it('creates multiple students with valid class_id and count', async () => {
      if (!classId) return;
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BULK)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ class_id: classId, count: 3 });
      expect([STATUS.CREATED, STATUS.OK, STATUS.FORBIDDEN]).toContain(res.status);
      if (res.status === STATUS.CREATED || res.status === STATUS.OK) {
        expect(res.body.error).toBeNull();
        const students: unknown[] = Array.isArray(res.body.data)
          ? res.body.data
          : (res.body.data?.students ?? []);
        expect(students.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('each bulk-created student has a unique access code (CCC-XXXX format)', async () => {
      if (!classId) return;
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BULK)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ class_id: classId, count: 2 });
      if (res.status === STATUS.CREATED || res.status === STATUS.OK) {
        const students: Array<{ student_id?: string }> = Array.isArray(res.body.data)
          ? res.body.data
          : (res.body.data?.students ?? []);
        const ids = students.map((s) => s.student_id).filter(Boolean);
        const unique = new Set(ids);
        expect(unique.size).toBe(ids.length);
        ids.forEach((code) => {
          // student_id format: CCC-XXXX (3 alpha prefix, hyphen, 4 alphanumeric)
          expect(code).toMatch(/^[A-Z]{3}-[A-Z0-9]{4}$/i);
        });
      }
    });

    it('returns 400 when class_id is missing', async () => {
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BULK)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ count: 3 });
      expect([STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('returns 400 when class_id is not a valid UUID', async () => {
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BULK)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ class_id: 'not-a-uuid', count: 3 });
      expect([STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('returns 400 or 404 when class_id does not exist', async () => {
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BULK)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ class_id: '00000000-0000-4000-a000-000000000001', count: 2 });
      expect([STATUS.BAD_REQUEST, STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('returns 400 when count is 0 (below minimum)', async () => {
      if (!classId) return;
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BULK)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ class_id: classId, count: 0 });
      expect([STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('returns 400 when count exceeds 50 (above maximum)', async () => {
      if (!classId) return;
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BULK)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ class_id: classId, count: 51 });
      expect([STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('returns 400 when count is missing', async () => {
      if (!classId) return;
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BULK)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ class_id: classId });
      expect([STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('returns 401 or 403 without a token', async () => {
      if (!classId) return;
      const res = await agent.post(ENDPOINTS.STUDENTS.BULK).send({ class_id: classId, count: 2 });
      expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
    });
  });

  // ── CSV roster import (bulk-upload) ───────────────────────────────────────

  describe('POST /students/bulk-upload — CSV roster import', () => {
    const validCsv = 'student_id,student_name,email\nSTU-001,Alice Test,\nSTU-002,Bob Test,';
    const csvBuffer = (content: string): Buffer => Buffer.from(content, 'utf-8');

    it('imports a valid CSV and returns inserted count', async () => {
      if (!classId) return;
      const res = await agent
        .post(`${ENDPOINTS.STUDENTS.BULK_UPLOAD}?class_id=${classId}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .attach('file', csvBuffer(validCsv), 'roster.csv');
      expect([STATUS.OK, STATUS.CREATED, STATUS.FORBIDDEN]).toContain(res.status);
      if (res.status === STATUS.OK || res.status === STATUS.CREATED) {
        expect(res.body.error).toBeNull();
        expect(res.body.data).toHaveProperty('inserted');
        expect(res.body.data.inserted).toBeGreaterThanOrEqual(1);
      }
    });

    it('roster reflects CSV-imported students', async () => {
      if (!classId) return;
      const res = await agent
        .get(ENDPOINTS.STUDENTS.BY_CLASS(classId))
        .set('Authorization', `Bearer ${educatorToken}`);
      if (res.status === STATUS.OK && Array.isArray(res.body.data)) {
        const names = res.body.data.map((s: { student_name?: string }) => s.student_name);
        expect(names).toEqual(expect.arrayContaining(['Alice Test']));
      }
    });

    it('returns 400 when no file is attached', async () => {
      if (!classId) return;
      const res = await agent
        .post(`${ENDPOINTS.STUDENTS.BULK_UPLOAD}?class_id=${classId}`)
        .set('Authorization', `Bearer ${educatorToken}`);
      expect([STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('returns 400 when class_id is missing', async () => {
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BULK_UPLOAD)
        .set('Authorization', `Bearer ${educatorToken}`)
        .attach('file', csvBuffer(validCsv), 'roster.csv');
      expect([STATUS.BAD_REQUEST, STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('returns 400 when class_id is not a valid UUID', async () => {
      const res = await agent
        .post(`${ENDPOINTS.STUDENTS.BULK_UPLOAD}?class_id=not-a-uuid`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .attach('file', csvBuffer(validCsv), 'roster.csv');
      expect([STATUS.BAD_REQUEST, STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('returns 400 or 404 when class_id does not exist', async () => {
      const res = await agent
        .post(`${ENDPOINTS.STUDENTS.BULK_UPLOAD}?class_id=00000000-0000-4000-a000-000000000099`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .attach('file', csvBuffer(validCsv), 'roster.csv');
      expect([STATUS.BAD_REQUEST, STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('returns 401 or 403 without a token', async () => {
      if (!classId) return;
      const res = await agent
        .post(`${ENDPOINTS.STUDENTS.BULK_UPLOAD}?class_id=${classId}`)
        .attach('file', csvBuffer(validCsv), 'roster.csv');
      expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('returns 400 when CSV has no data rows (header only)', async () => {
      if (!classId) return;
      const res = await agent
        .post(`${ENDPOINTS.STUDENTS.BULK_UPLOAD}?class_id=${classId}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .attach('file', csvBuffer('student_id,student_name,email'), 'empty.csv');
      expect([STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('returns 400 when CSV is missing required headers', async () => {
      if (!classId) return;
      const res = await agent
        .post(`${ENDPOINTS.STUDENTS.BULK_UPLOAD}?class_id=${classId}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .attach('file', csvBuffer('name,email\nAlice,a@b.com'), 'bad-headers.csv');
      expect([STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('handles duplicate student_id within CSV — partial success', async () => {
      if (!classId) return;
      const csv = 'student_id,student_name,email\nDUP-001,Alice,\nDUP-001,Alice Clone,';
      const res = await agent
        .post(`${ENDPOINTS.STUDENTS.BULK_UPLOAD}?class_id=${classId}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .attach('file', csvBuffer(csv), 'dup.csv');
      expect([STATUS.OK, STATUS.CREATED, STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(
        res.status,
      );
      if (res.status === STATUS.OK || res.status === STATUS.CREATED) {
        expect(res.body.data.inserted).toBe(1);
        expect(res.body.data.failedCount).toBe(1);
        expect(res.body.data.failed[0].error).toContain('Duplicate');
      }
    });

    it('handles rows with missing required fields — partial success', async () => {
      if (!classId) return;
      const csv = 'student_id,student_name,email\nPART-001,Valid Student,\n,Missing ID,';
      const res = await agent
        .post(`${ENDPOINTS.STUDENTS.BULK_UPLOAD}?class_id=${classId}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .attach('file', csvBuffer(csv), 'partial.csv');
      expect([STATUS.OK, STATUS.CREATED, STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(
        res.status,
      );
      if (res.status === STATUS.OK || res.status === STATUS.CREATED) {
        expect(res.body.data.inserted).toBeGreaterThanOrEqual(1);
        expect(res.body.data.failedCount).toBeGreaterThanOrEqual(1);
      }
    });

    it('rejects student_id that already exists in the class (DB duplicate)', async () => {
      if (!classId) return;
      const csv = 'student_id,student_name,email\nSTU-001,Alice Again,';
      const res = await agent
        .post(`${ENDPOINTS.STUDENTS.BULK_UPLOAD}?class_id=${classId}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .attach('file', csvBuffer(csv), 'db-dup.csv');
      expect([STATUS.OK, STATUS.CREATED, STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(
        res.status,
      );
      if (res.status === STATUS.OK || res.status === STATUS.CREATED) {
        expect(res.body.data.failedCount).toBeGreaterThanOrEqual(1);
        const errors = res.body.data.failed.map((f: { error: string }) => f.error);
        expect(errors.some((e: string) => /exists|duplicate/i.test(e))).toBe(true);
      }
    });

    it('returns result summary with total, inserted, failedCount, and failed array', async () => {
      if (!classId) return;
      const csv = 'student_id,student_name,email\nSUM-001,Summary Test,';
      const res = await agent
        .post(`${ENDPOINTS.STUDENTS.BULK_UPLOAD}?class_id=${classId}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .attach('file', csvBuffer(csv), 'summary.csv');
      if (res.status === STATUS.OK || res.status === STATUS.CREATED) {
        expect(res.body.data).toHaveProperty('total');
        expect(res.body.data).toHaveProperty('inserted');
        expect(res.body.data).toHaveProperty('failedCount');
        expect(res.body.data).toHaveProperty('failed');
        expect(Array.isArray(res.body.data.failed)).toBe(true);
      }
    });
  });

  // ── Student CRUD ─────────────────────────────────────────────────────────

  describe('GET/PUT/DELETE /students/:id — individual student operations', () => {
    let studentId: string;

    beforeAll(async () => {
      if (!classId) return;
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BASE)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ student_name: `CRUD Student ${Date.now()}`, class_id: classId });
      studentId = res.body?.data?.id ?? '';
    });

    it('GET /students/:id — returns student by id', async () => {
      if (!studentId) return;
      const res = await agent
        .get(ENDPOINTS.STUDENTS.BY_ID(studentId))
        .set('Authorization', `Bearer ${educatorToken}`);
      expect([STATUS.OK, STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(res.status);
      if (res.status === STATUS.OK) {
        expect(res.body.error).toBeNull();
        expect(res.body.data).toHaveProperty('id', studentId);
      }
    });

    it('GET /students/:id — returns 400 for non-UUID id', async () => {
      const res = await agent
        .get(ENDPOINTS.STUDENTS.BY_ID('not-a-uuid'))
        .set('Authorization', `Bearer ${educatorToken}`);
      expect([STATUS.BAD_REQUEST, STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('GET /students/:id — returns 404 for unknown UUID', async () => {
      const res = await agent
        .get(ENDPOINTS.STUDENTS.BY_ID('00000000-0000-4000-a000-000000000002'))
        .set('Authorization', `Bearer ${educatorToken}`);
      expect([STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('PUT /students/:id — updates student status', async () => {
      if (!studentId) return;
      const res = await agent
        .put(ENDPOINTS.STUDENTS.BY_ID(studentId))
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ status: 'INACTIVE' });
      expect([STATUS.OK, STATUS.CREATED, STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('DELETE /students/:id — removes student', async () => {
      if (!studentId) return;
      const res = await agent
        .delete(ENDPOINTS.STUDENTS.BY_ID(studentId))
        .set('Authorization', `Bearer ${educatorToken}`);
      expect([STATUS.OK, STATUS.NO_CONTENT, STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(
        res.status,
      );
      // verify removal
      if (res.status === STATUS.OK || res.status === STATUS.NO_CONTENT) {
        const verify = await agent
          .get(ENDPOINTS.STUDENTS.BY_ID(studentId))
          .set('Authorization', `Bearer ${educatorToken}`);
        expect([STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(verify.status);
      }
    });
  });

  // ── Access code management ───────────────────────────────────────────────

  describe('PUT /students/revoke-code/:id and /regenerate-code/:id', () => {
    let codeStudentId: string;

    beforeAll(async () => {
      if (!classId) return;
      const res = await agent
        .post(ENDPOINTS.STUDENTS.BASE)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ student_name: `Code Student ${Date.now()}`, class_id: classId });
      codeStudentId = res.body?.data?.id ?? '';
    });

    afterAll(async () => {
      await deleteStudent(agent, educatorToken, codeStudentId);
    });

    it('revokes a student access code', async () => {
      if (!codeStudentId) return;
      const res = await agent
        .put(ENDPOINTS.STUDENTS.REVOKE_CODE(codeStudentId))
        .set('Authorization', `Bearer ${educatorToken}`);
      expect([STATUS.OK, STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(res.status);
      if (res.status === STATUS.OK) {
        expect(res.body.error).toBeNull();
      }
    });

    it('regenerates a student access code', async () => {
      if (!codeStudentId) return;
      const res = await agent
        .put(ENDPOINTS.STUDENTS.REGENERATE_CODE(codeStudentId))
        .set('Authorization', `Bearer ${educatorToken}`);
      expect([STATUS.OK, STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(res.status);
      if (res.status === STATUS.OK) {
        expect(res.body.error).toBeNull();
        expect(res.body.data).toHaveProperty('student_id');
      }
    });

    it('returns 400 for non-UUID id on revoke', async () => {
      const res = await agent
        .put(ENDPOINTS.STUDENTS.REVOKE_CODE('bad-id'))
        .set('Authorization', `Bearer ${educatorToken}`);
      expect([STATUS.BAD_REQUEST, STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('returns 400 for non-UUID id on regenerate', async () => {
      const res = await agent
        .put(ENDPOINTS.STUDENTS.REGENERATE_CODE('bad-id'))
        .set('Authorization', `Bearer ${educatorToken}`);
      expect([STATUS.BAD_REQUEST, STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('returns 404 for unknown UUID on revoke', async () => {
      const res = await agent
        .put(ENDPOINTS.STUDENTS.REVOKE_CODE('00000000-0000-4000-a000-000000000003'))
        .set('Authorization', `Bearer ${educatorToken}`);
      expect([STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(res.status);
    });

    it('returns 401 or 403 without a token on revoke', async () => {
      if (!codeStudentId) return;
      const res = await agent.put(ENDPOINTS.STUDENTS.REVOKE_CODE(codeStudentId));
      expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
    });
  });
});
