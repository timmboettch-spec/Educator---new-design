/*
 * Renumbers generated student codes to 8-DIGIT NUMERIC.
 *
 * Why: the student app's scenario-token route enforces /^\d{8}$/
 * (student-app-standard/frontend/app/api/scenarios/token/route.ts:24). Codes like
 * "CHH00072" are 8 characters but not 8 digits, so launching a scenario is rejected
 * with "Invalid student code format" before any assignment check runs -- which is why
 * the dashboard listed simulations but the Start button bounced back / 403'd.
 *
 * Scheme: 2 S NNNNNN   ->  '2' + school digit (1-7) + 6-digit sequence
 *   e.g. 21000001 = school 1 (Cedar Hollow), student 1
 * Keeps the school identifiable while satisfying the 8-digit rule, and the leading 2
 * avoids colliding with the existing 10xxxxxx fixture codes.
 *
 * Scoped to generated educators (`.rwthrive.test`); the local.dev / REALITY fixture is
 * left alone. Safe to re-run -- it recomputes deterministically from school + created_at.
 *
 * Run from D:\educator-back:  node local-seed/renumber-student-codes.js
 */
require('dotenv').config({ quiet: true });
const { Client } = require('pg');

const MARKER = '%@%.rwthrive.test';

(async () => {
  const c = new Client({
    host: process.env.DB_HOST, port: +process.env.DB_PORT,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  await c.connect();
  await c.query('BEGIN');
  try {
    const schools = await c.query('select id, school_name from schools order by school_name');
    if (!schools.rows.length) throw new Error('no schools found');

    let total = 0;
    const summary = [];

    for (let i = 0; i < schools.rows.length; i++) {
      const school = schools.rows[i];
      const digit = i + 1; // 1..7
      if (digit > 9) throw new Error('scheme supports at most 9 schools');

      // Deterministic order so re-runs assign the same code to the same student.
      const studs = await c.query(
        `select st.id from students st
           join educators e on e.id = st.educator_id
          where e.email like $1 and st.school_id = $2
          order by st.created_at, st.id`,
        [MARKER, school.id]);

      if (!studs.rows.length) { summary.push({ school: school.school_name, students: 0, range: '-' }); continue; }

      // Single UPDATE ... FROM (VALUES ...) per chunk keeps this fast for ~16k rows.
      const CHUNK = 1000;
      let seq = 0;
      const firstCode = `2${digit}${String(1).padStart(6, '0')}`;
      for (let off = 0; off < studs.rows.length; off += CHUNK) {
        const slice = studs.rows.slice(off, off + CHUNK);
        const vals = [], params = [];
        slice.forEach((r, k) => {
          const code = `2${digit}${String(++seq).padStart(6, '0')}`;
          const b = k * 2;
          vals.push(`($${b + 1}::uuid, $${b + 2}::varchar)`);
          params.push(r.id, code);
        });
        await c.query(
          `update students set student_id = v.code
             from (values ${vals.join(',')}) as v(id, code)
            where students.id = v.id`, params);
      }
      const lastCode = `2${digit}${String(seq).padStart(6, '0')}`;
      total += seq;
      summary.push({ school: school.school_name, students: seq, range: `${firstCode} - ${lastCode}` });
    }

    // Safety: every generated code must now be exactly 8 digits and unique.
    const bad = await c.query(
      `select count(*)::int n from students st join educators e on e.id = st.educator_id
        where e.email like $1 and st.student_id !~ '^[0-9]{8}$'`, [MARKER]);
    const dup = await c.query(
      `select count(*)::int n from (
         select student_id from students group by student_id having count(*) > 1) x`);
    if (bad.rows[0].n) throw new Error(`${bad.rows[0].n} codes are not 8 digits`);
    if (dup.rows[0].n) throw new Error(`${dup.rows[0].n} duplicate codes`);

    await c.query('COMMIT');
    console.table(summary);
    console.log(`renumbered ${total} students; all 8-digit, no duplicates`);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('ROLLED BACK:', e.message);
    process.exitCode = 1;
  }
  await c.end();
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
