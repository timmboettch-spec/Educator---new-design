/*
 * PILOT: drive one complete onboarding through the real API, exactly as the screens do.
 *
 *   admin login
 *     -> POST /schools
 *     -> POST /invites            (creates invite + PENDING educator)
 *     -> POST /auth/signup        (educator accepts invite, sets password)
 *   educator login
 *     -> POST /classes            (educator-only endpoint)
 *     -> POST /students/bulk      (backend GENERATES the student codes)
 *     -> POST /class-simulations  (checks educator token/seat availability)
 *
 * Purpose: prove the flow and capture what the system actually generates
 * (student code format, class_id, notifications, seat accounting) BEFORE wiping
 * anything and replaying at full scale.
 *
 * Creates clearly-labelled PILOT records so they are easy to remove afterwards.
 *
 * Run from D:\educator-back:  node local-seed/pilot-real-flow.js
 */
require('dotenv').config({ quiet: true });
const { Session } = require('./api-client');
const { Client } = require('pg');

const ADMIN = { email: 'realityworks@rwthrive.ai', password: 'realityworks2709' };
const STAMP = 'PILOT';
const SCHOOL_NAME = `${STAMP} Verification Academy`;
const EDU_EMAIL = `pilot.educator@pilot.rwthrive.test`;
const EDU_PASSWORD = 'Educator2709!';
const STUDENT_COUNT = 5;

const show = (label, v) => console.log(`  ${label}:`, typeof v === 'string' ? v : JSON.stringify(v).slice(0, 260));

(async () => {
  // ---------- admin ----------
  const admin = new Session();
  await admin.login(ADMIN.email, ADMIN.password);
  console.log('1. admin logged in');

  // AI seats are a real resource: inviting an educator with N tokens draws N from the
  // admin's pool, and the pool starts at 0. The built-in master code grants seats through
  // the normal redemption path (AuthConstants.MASTER_REDEEM_CODE / _AI_SEATS = 100 each).
  const redeem = await admin.post('/auth/redeem', {
    code: 'RWMASTER20250617',
    email: ADMIN.email,
  });
  console.log('1b. admin redeemed master code for AI seats');
  show('redeem', redeem?.message);

  const school = await admin.post('/schools', { school_name: SCHOOL_NAME });
  const schoolId = school?.data?.id || school?.data?.school?.id;
  console.log('2. school created');
  show('school_id', schoolId);
  if (!schoolId) throw new Error('no school id returned: ' + JSON.stringify(school).slice(0, 300));

  const invite = await admin.post('/invites/create', {
    email: EDU_EMAIL,
    school_id: schoolId,
    full_name: 'Pilot Educator',
    phone_number: '(555) 010-2026',
    tokens: 50,
  });
  const inviteId = invite?.data?.invite?.id;
  console.log('3. invite created');
  show('invite_id', inviteId);
  show('educator (from invite)', invite?.data?.educator && {
    id: invite.data.educator.id, status: invite.data.educator.status, is_active: invite.data.educator.is_active,
  });
  if (!inviteId) throw new Error('no invite id: ' + JSON.stringify(invite).slice(0, 300));

  // Educator accepts the invite and sets their password (no session needed).
  const anon = new Session();
  const signup = await anon.post('/auth/signup', {
    email: EDU_EMAIL,
    password: EDU_PASSWORD,
    full_name: 'Pilot Educator',
    invite_id: inviteId,
  });
  console.log('4. invite accepted via signup');
  show('signup', signup?.message);

  // ---------- educator ----------
  const edu = new Session();
  const eduLogin = await edu.login(EDU_EMAIL, EDU_PASSWORD);
  console.log('5. educator logged in');
  show('role', eduLogin?.user?.role);
  show('total_tokens', eduLogin?.user?.total_tokens);

  const cls = await edu.post('/classes', {
    class_name: `${STAMP} Fundamentals of Nursing`,
    term: 'Fall',
    year: '2026',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    school_id: schoolId,
  });
  const classId = cls?.data?.id || cls?.data?.class?.id;
  console.log('6. class created');
  show('class row', cls?.data && { id: classId, class_id: cls.data.class_id, class_name: cls.data.class_name });
  if (!classId) throw new Error('no class id: ' + JSON.stringify(cls).slice(0, 300));

  const bulk = await edu.post('/students/bulk', { class_id: classId, count: STUDENT_COUNT });
  console.log('7. students created via bulk');
  const created = bulk?.data?.students || bulk?.data || [];
  show('generated codes', Array.isArray(created) ? created.map((s) => s.student_id) : created);

  // pick a real scenario the app can resolve
  const catalog = await edu.get('/simulation-catalog');
  const items = Array.isArray(catalog?.data) ? catalog.data : (catalog?.data?.data || []);
  const scenarioId = items[0]?.scenario_id || items[0]?.scenarioId;
  show('scenario to assign', scenarioId);

  const assign = await edu.post('/class-simulations', {
    class_id: classId,
    simulation_id: scenarioId,
    start_date: '2026-01-01',
    due_date: '2026-12-31',
    end_date: '2026-12-31',
  });
  console.log('8. simulation assigned');
  show('assign', assign?.message);

  // ---------- what the system produced ----------
  const c = new Client({
    host: process.env.DB_HOST, port: +process.env.DB_PORT,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  await c.connect();
  const q = async (label, sql, params) => {
    const r = await c.query(sql, params);
    console.log(`\n=== ${label} ===`);
    console.table(r.rows);
  };
  await q('students (system-generated codes)',
    'select student_id, status, attempt from students where class_id=$1 order by student_id', [classId]);
  await q('class', 'select class_id, class_name, term, year, status, total_no_of_students from classes where id=$1', [classId]);
  await q('educator', "select email, status, is_active, tokens, allocated_tokens from educators where email=$1", [EDU_EMAIL]);
  await q('invites', "select status, expires_at is not null as has_expiry from invites where email=$1", [EDU_EMAIL]);
  await q('notifications generated', 'select type, recipient_type, count(*)::int n from notifications group by 1,2 order by 3 desc');
  await c.end();

  console.log('\nPILOT COMPLETE - records are prefixed "PILOT" / pilot.rwthrive.test');
})().catch((e) => { console.error('\nPILOT FAILED:', e.message); process.exit(1); });
