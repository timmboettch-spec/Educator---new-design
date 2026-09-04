/*
 * FULL REBUILD THROUGH THE REAL SYSTEM.
 *
 * Replaces the earlier direct-to-database seeding. Every record here is created by the
 * same endpoints the UI calls, so all the logic that DB inserts skipped actually runs:
 * DTO validation, invite lifecycle, password hashing via signup, AI-seat accounting,
 * system-generated student codes, and notification side effects.
 *
 *   admin: /auth/login -> /auth/redeem xN (AI seats) -> /schools x7
 *          -> /invites/create x105
 *   educator: /auth/signup (accept invite, set password) -> /auth/login
 *          -> /classes x10 -> /students/bulk -> /class-simulations
 *
 * Seat maths: assigning a simulation to a class costs 1 seat per student in that class.
 * Educator token budgets are computed from their own plan, and the admin redeems enough
 * master codes (100 seats each) to cover the sum before any invite is sent.
 *
 * Destructive: wipes previously generated schools/educators (and their cascade) first.
 * Leaves the admin user, roles, and the local.dev/REALITY fixture untouched.
 *
 * Run from D:\educator-back:  node local-seed/rebuild-via-api.js
 */
require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const { Session, pool } = require('./api-client');

const ADMIN = { email: 'realityworks@rwthrive.ai', password: 'realityworks2709' };
const EDU_PASSWORD = 'Educator2709!';
const MASTER_CODE = 'RWMASTER20250617';
const SEATS_PER_REDEEM = 100;
const EMAIL_DOMAIN = 'rwthrive.test';

const EDUCATORS_PER_SCHOOL = 15;
const CLASSES_PER_EDUCATOR = 10;
const MIN_POPULATED = 3, MAX_POPULATED = 10;
const MIN_STUDENTS = 20, MAX_STUDENTS = 30;   // /students/bulk caps at 50
const MIN_SIMS = 3, MAX_SIMS = 8;
const EDUCATOR_CONCURRENCY = 6;

// ---- deterministic PRNG so re-runs plan identically ----
let _s = 0x5eed1234;
const rnd = () => { _s |= 0; _s = (_s + 0x6d2b79f5) | 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const randInt = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const shuffled = (a) => { const c = a.slice(); for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; };

const SCHOOLS = [
  { name: 'Cedar Hollow Health Sciences Academy', abbr: 'chh' },
  { name: 'Ironwood Ridge Career & Technical High School', abbr: 'irr' },
  { name: 'Marisol Vega Institute of Allied Health', abbr: 'mvi' },
  { name: 'Northgate Bay Nursing Preparatory', abbr: 'ngb' },
  { name: 'Prairie Vale Medical Arts Campus', abbr: 'pvm' },
  { name: 'Saltmarsh Union Technical College', abbr: 'smu' },
  { name: 'Willowbrook Summit School of Health Professions', abbr: 'wbs' },
];

const FIRST = ['Amara','Beatriz','Callum','Dashiell','Eleni','Fiona','Gideon','Halima','Ines','Jarrah','Kwame','Lucia','Mateo','Nadia','Oleander','Priya','Quentin','Rosalind','Sanjay','Tamsin','Ulysses','Verity','Wren','Xiomara','Yusuf','Zora','Anouk','Bodhi','Cormac','Delphine','Ezra','Freya','Giulia','Hollis','Isolde','Junia','Kofi','Linnea','Marisol','Niamh','Osman','Paloma','Rafferty','Saoirse','Thaddeus','Ondine','Vikram','Wilhelmina','Yara','Zephyr','Bethan','Casimir','Dilnaz','Emeka','Fernanda','Grigor','Hyacinth','Ilia','Jovan','Keturah'];
const LAST = ['Achterberg','Bhattacharya','Calloway','Dumitrescu','Eriksen','Fontaine','Gutierrez','Haverford','Ishikawa','Jovanovic','Kaminski','Lindqvist','Moreau','Nakamura','Oyelaran','Pemberton','Quintero','Rasmussen','Sandoval','Thibodeaux','Ubelhart','Vasquez','Whitlock','Xiang','Yildirim','Zabala','Anselmo','Brennan','Castellanos','Devereaux','Ellsworth','Farrokhzad','Grimaldi','Holloway','Ibarra','Janssen','Kowalczyk','Lefevre','Mbeki','Novotny','Okonkwo','Petrossian','Quiroga','Rothschild','Silvestri','Tanaka','Ulrich','Villanueva','Wojcik','Zamora','Barrowman','Chaudhry','Drummond','Espinoza','Fitzgerald','Goldsworthy','Hernandez','Iyer','Jenkins','Kirkbride'];
const COURSES = ['Fundamentals of Nursing','Health Assessment & Physical Exam','Pharmacology for Nurses','Dosage Calculation & Med Safety','Medical-Surgical Nursing I','Medical-Surgical Nursing II','Maternal & Newborn Care','Pediatric Nursing','Mental Health Nursing','Gerontology & Long-Term Care','Critical Care & Telemetry','Cardiac Rhythm Interpretation','Emergency & Trauma Response','Perioperative Nursing','Wound Care & Skin Integrity','Infection Prevention & Control','Oncology Nursing','Nutrition & Metabolic Care','Community & Public Health Nursing','Nursing Ethics & Professional Practice'];
const TERMS = [{ term: 'Fall', year: '2026' }, { term: 'Spring', year: '2026' }, { term: 'Summer', year: '2026' }];
const SECTIONS = ['A','B','C','D','E','F'];
const START_DATE = '2026-01-01', END_DATE = '2026-12-31';

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function wipe() {
  const c = new Client({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  await c.connect();
  const eds = await c.query(`select id from educators where email like $1 or email like $2`, ['%@%.' + EMAIL_DOMAIN, '%@' + EMAIL_DOMAIN]);
  const ids = eds.rows.map((r) => r.id);
  if (ids.length) {
    await c.query(`delete from students where educator_id = any($1::uuid[])`, [ids]);
    await c.query(`delete from class_simulations where class_id in (select id from classes where educator_id = any($1::uuid[]))`, [ids]);
    await c.query(`delete from classes where educator_id = any($1::uuid[])`, [ids]);
    await c.query(`delete from educator_simulations where educator_id = any($1::uuid[])`, [ids]);
    await c.query(`delete from educator_schools where educator_id = any($1::uuid[])`, [ids]);
    await c.query(`delete from invites where email like $1 or email like $2`, ['%@%.' + EMAIL_DOMAIN, '%@' + EMAIL_DOMAIN]);
    await c.query(`delete from educators where id = any($1::uuid[])`, [ids]);
  }
  const names = [...SCHOOLS.map((s) => s.name), 'PILOT Verification Academy'];
  await c.query(`delete from schools where school_name = any($1::text[])`, [names]);
  await c.query(`delete from notifications where true`);
  await c.end();
  log(`wiped ${ids.length} prior educators, their cascade, schools and notifications`);
}

(async () => {
  const t0 = Date.now();
  await wipe();

  const admin = new Session();
  await admin.login(ADMIN.email, ADMIN.password);
  log('admin logged in');

  // ---- plan everything first so seat demand is known up front ----
  const usedEmails = new Set();
  const plan = [];
  for (const school of SCHOOLS) {
    for (let e = 0; e < EDUCATORS_PER_SCHOOL; e++) {
      const first = pick(FIRST), last = pick(LAST);
      let local = `${first}.${last}`.toLowerCase(), n = 2;
      let email = `${local}@${school.abbr}.${EMAIL_DOMAIN}`;
      while (usedEmails.has(email)) email = `${local}${n++}@${school.abbr}.${EMAIL_DOMAIN}`;
      usedEmails.add(email);

      const courses = shuffled(COURSES).slice(0, CLASSES_PER_EDUCATOR);
      const classes = courses.map((name, k) => ({
        class_name: `${name} \u2014 Sec ${SECTIONS[k % SECTIONS.length]}`,
        ...pick(TERMS), students: 0, sims: randInt(MIN_SIMS, MAX_SIMS),
      }));
      const populated = shuffled(classes.map((_, i) => i)).slice(0, randInt(MIN_POPULATED, MAX_POPULATED));
      for (const i of populated) classes[i].students = randInt(MIN_STUDENTS, MAX_STUDENTS);

      // 1 seat per student per assigned simulation
      const cost = classes.reduce((s, k) => s + k.students * k.sims, 0);
      plan.push({ school: school.name, email, full_name: `${first} ${last}`,
        phone_number: `(${randInt(200,989)}) ${randInt(200,989)}-${String(randInt(0,9999)).padStart(4,'0')}`,
        tokens: cost + 25, classes });
    }
  }
  const totalSeats = plan.reduce((s, p) => s + p.tokens, 0);
  const redeems = Math.ceil(totalSeats / SEATS_PER_REDEEM);
  log(`plan: ${plan.length} educators, ${plan.length * CLASSES_PER_EDUCATOR} classes, ` +
      `${plan.reduce((s,p)=>s+p.classes.reduce((a,k)=>a+k.students,0),0)} students, ` +
      `${plan.reduce((s,p)=>s+p.classes.reduce((a,k)=>a+k.sims,0),0)} assignments`);
  log(`seat demand ${totalSeats} -> ${redeems} master redemptions`);

  // ---- fund the admin (sequential: mutates one shared pool) ----
  for (let i = 0; i < redeems; i++) {
    await admin.post('/auth/redeem', { code: MASTER_CODE, email: ADMIN.email });
    if ((i + 1) % 100 === 0) log(`  redeemed ${i + 1}/${redeems}`);
  }
  log(`redeemed ${redeems} x ${SEATS_PER_REDEEM} seats`);

  // ---- schools ----
  const schoolIds = new Map();
  for (const s of SCHOOLS) {
    const r = await admin.post('/schools', { school_name: s.name });
    schoolIds.set(s.name, r?.data?.id || r?.data?.school?.id);
  }
  log(`created ${schoolIds.size} schools`);

  // ---- scenarios available to assign ----
  const catalog = await admin.get('/simulation-catalog');
  const items = Array.isArray(catalog?.data) ? catalog.data : (catalog?.data?.data || []);
  const scenarioIds = items.map((x) => x.scenario_id || x.scenarioId).filter(Boolean);
  log(`catalog: ${scenarioIds.length} scenarios`);

  // ---- invites (sequential: each draws from the admin's seat pool) ----
  const errors = [];
  for (const p of plan) {
    try {
      const r = await admin.post('/invites/create', {
        email: p.email, school_id: schoolIds.get(p.school),
        full_name: p.full_name, phone_number: p.phone_number, tokens: p.tokens,
      });
      p.invite_id = r?.data?.invite?.id;
      if (!p.invite_id) throw new Error('no invite id');
    } catch (e) { errors.push(`invite ${p.email}: ${e.message}`); }
  }
  log(`invites created: ${plan.filter((p) => p.invite_id).length}/${plan.length}`);

  // ---- per-educator: accept invite, log in, build classes/students/assignments ----
  let doneEdu = 0, classCount = 0, studentCalls = 0, assignCount = 0;
  await pool(plan.filter((p) => p.invite_id), EDUCATOR_CONCURRENCY, async (p) => {
    try {
      await new Session().post('/auth/signup', {
        email: p.email, password: EDU_PASSWORD, full_name: p.full_name, invite_id: p.invite_id,
      });
      const edu = new Session();
      await edu.login(p.email, EDU_PASSWORD);

      for (const k of p.classes) {
        const cr = await edu.post('/classes', {
          class_name: k.class_name, term: k.term, year: k.year,
          start_date: START_DATE, end_date: END_DATE, school_id: schoolIds.get(p.school),
        });
        const classId = cr?.data?.id || cr?.data?.class?.id;
        if (!classId) { errors.push(`class ${p.email} ${k.class_name}: no id`); continue; }
        classCount++;

        if (k.students > 0) {
          await edu.post('/students/bulk', { class_id: classId, count: k.students });
          studentCalls++;
        }
        for (const sid of shuffled(scenarioIds).slice(0, k.sims)) {
          try {
            await edu.post('/class-simulations', {
              class_id: classId, simulation_id: sid,
              start_date: START_DATE, due_date: END_DATE, end_date: END_DATE,
            });
            assignCount++;
          } catch (e) { errors.push(`assign ${p.email} ${sid}: ${e.message}`); }
        }
      }
    } catch (e) { errors.push(`educator ${p.email}: ${e.message}`); }
    if (++doneEdu % 10 === 0) log(`  educators done ${doneEdu}/${plan.length} (classes ${classCount}, assigns ${assignCount})`);
  });

  log(`\nDONE in ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min`);
  log(`classes ${classCount}, bulk-student calls ${studentCalls}, assignments ${assignCount}`);
  if (errors.length) {
    log(`errors: ${errors.length} (first 15)`);
    errors.slice(0, 15).forEach((e) => console.log('   ', e));
  } else log('no errors');
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
