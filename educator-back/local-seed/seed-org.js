/*
 * Generates synthetic org data in the local educator_dev DB:
 *   7 schools -> 15 educators each (105) -> 10 classes each (1050)
 *   -> 3-10 of those classes per educator populated with 20-30 students.
 *
 * Run with cwd = D:\educator-back so dotenv/pg/bcrypt resolve.
 *
 * Idempotent: every generated row is tagged by the `.rwthrive.test` educator email
 * domain and the SCHOOLS list below. A re-run deletes only previously generated rows
 * (found via that marker) and rebuilds. The pre-existing local.dev@rwthrive.local /
 * "Local Dev Class" / student code REALITY fixture is never touched.
 *
 * Simulation assignment (class_simulations / educator_simulations) is intentionally
 * NOT done here: simulation_catalog and simulations are both empty, so there is
 * nothing to assign. That is a separate step once the catalog exists.
 */
require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const bcrypt = require('bcrypt');

const EDUCATOR_PASSWORD = 'Educator2709!';
const SALT_ROUNDS = 10;
const ADMIN_EMAIL = 'realityworks@rwthrive.ai';
const EMAIL_DOMAIN_SUFFIX = 'rwthrive.test'; // marker for generated educators
const EDUCATORS_PER_SCHOOL = 15;
const CLASSES_PER_EDUCATOR = 10;

// Deterministic PRNG (mulberry32) so re-runs produce identical data.
let _s = 0x9e3779b9;
function rnd() {
  _s |= 0; _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
function shuffled(a) {
  const c = a.slice();
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  return c;
}

const SCHOOLS = [
  { name: 'Cedar Hollow Health Sciences Academy', abbr: 'CHH' },
  { name: 'Ironwood Ridge Career & Technical High School', abbr: 'IRR' },
  { name: 'Marisol Vega Institute of Allied Health', abbr: 'MVI' },
  { name: 'Northgate Bay Nursing Preparatory', abbr: 'NGB' },
  { name: 'Prairie Vale Medical Arts Campus', abbr: 'PVM' },
  { name: 'Saltmarsh Union Technical College', abbr: 'SMU' },
  { name: 'Willowbrook Summit School of Health Professions', abbr: 'WBS' },
];

const FIRST = ['Amara','Beatriz','Callum','Dashiell','Eleni','Fiona','Gideon','Halima','Ines','Jarrah',
  'Kwame','Lucia','Mateo','Nadia','Oleander','Priya','Quentin','Rosalind','Sanjay','Tamsin',
  'Ulysses','Verity','Wren','Xiomara','Yusuf','Zora','Anouk','Bodhi','Cormac','Delphine',
  'Ezra','Freya','Giulia','Hollis','Isolde','Junia','Kofi','Linnea','Marisol','Niamh',
  'Osman','Paloma','Rafferty','Saoirse','Thaddeus','Ondine','Vikram','Wilhelmina','Yara','Zephyr',
  'Bethan','Casimir','Dilnaz','Emeka','Fernanda','Grigor','Hyacinth','Ilia','Jovan','Keturah'];

const LAST = ['Achterberg','Bhattacharya','Calloway','Dumitrescu','Eriksen','Fontaine','Gutierrez','Haverford','Ishikawa','Jovanovic',
  'Kaminski','Lindqvist','Moreau','Nakamura','Oyelaran','Pemberton','Quintero','Rasmussen','Sandoval','Thibodeaux',
  'Ubelhart','Vasquez','Whitlock','Xiang','Yildirim','Zabala','Anselmo','Brennan','Castellanos','Devereaux',
  'Ellsworth','Farrokhzad','Grimaldi','Holloway','Ibarra','Janssen','Kowalczyk','Lefevre','Mbeki','Novotny',
  'Okonkwo','Petrossian','Quiroga','Rothschild','Silvestri','Tanaka','Ulrich','Villanueva','Wojcik','Zamora',
  'Barrowman','Chaudhry','Drummond','Espinoza','Fitzgerald','Goldsworthy','Hernandez','Iyer','Jenkins','Kirkbride'];

const COURSES = [
  ['Fundamentals of Nursing', 101], ['Health Assessment & Physical Exam', 112],
  ['Pharmacology for Nurses', 121], ['Dosage Calculation & Med Safety', 124],
  ['Medical-Surgical Nursing I', 201], ['Medical-Surgical Nursing II', 202],
  ['Maternal & Newborn Care', 210], ['Pediatric Nursing', 215],
  ['Mental Health Nursing', 220], ['Gerontology & Long-Term Care', 225],
  ['Critical Care & Telemetry', 301], ['Cardiac Rhythm Interpretation', 305],
  ['Emergency & Trauma Response', 310], ['Perioperative Nursing', 315],
  ['Wound Care & Skin Integrity', 320], ['Infection Prevention & Control', 325],
  ['Oncology Nursing', 330], ['Nutrition & Metabolic Care', 335],
  ['Community & Public Health Nursing', 340], ['Nursing Ethics & Professional Practice', 350],
];

const TERMS = [
  { term: 'Fall',   year: '2026', start: '2026-08-24', end: '2026-12-18' },
  { term: 'Spring', year: '2026', start: '2026-01-12', end: '2026-05-15' },
  { term: 'Summer', year: '2026', start: '2026-06-01', end: '2026-07-31' },
];
const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F'];
// class_status_enum is ACTIVE,INACTIVE,DRAFT,ARCHIEVED  (note the misspelling in the enum)
const CLASS_STATUSES = ['ACTIVE','ACTIVE','ACTIVE','ACTIVE','ACTIVE','ACTIVE','ACTIVE','INACTIVE','DRAFT','ARCHIEVED'];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

(async () => {
  const c = new Client({
    host: process.env.DB_HOST, port: +process.env.DB_PORT,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  await c.connect();
  const t0 = Date.now();

  const admin = await c.query('select id from users where email=$1', [ADMIN_EMAIL]);
  if (!admin.rows.length) throw new Error(`admin user ${ADMIN_EMAIL} not found`);
  const adminId = admin.rows[0].id;

  const role = await c.query(`select id from role where role_name='Educator'`);
  if (!role.rows.length) throw new Error('Educator role missing - run npm run seed:roles');
  const educatorRoleId = role.rows[0].id;

  await c.query('BEGIN');
  try {
    // ---- clean previous generated data (marker: educator email domain) ----
    const prior = await c.query(
      `select id from educators where email like $1`, ['%@%.' + EMAIL_DOMAIN_SUFFIX]);
    const priorIds = prior.rows.map((r) => r.id);
    if (priorIds.length) {
      await c.query(`delete from students where educator_id = any($1::uuid[])`, [priorIds]);
      await c.query(`delete from class_simulations where class_id in (select id from classes where educator_id = any($1::uuid[]))`, [priorIds]);
      await c.query(`delete from classes where educator_id = any($1::uuid[])`, [priorIds]);
      await c.query(`delete from educator_simulations where educator_id = any($1::uuid[])`, [priorIds]);
      await c.query(`delete from educator_schools where educator_id = any($1::uuid[])`, [priorIds]);
      await c.query(`delete from educators where id = any($1::uuid[])`, [priorIds]);
      console.log(`cleaned ${priorIds.length} previously generated educators (and their classes/students)`);
    }
    await c.query(`delete from schools where school_name = any($1::text[])`, [SCHOOLS.map((s) => s.name)]);

    // ---- schools ----
    const schoolIds = [];
    for (const s of SCHOOLS) {
      const r = await c.query(
        `insert into schools (school_name, status, user_id, is_active, lms_enabled)
         values ($1,'ACTIVE',$2,true,false) returning id`, [s.name, adminId]);
      schoolIds.push(r.rows[0].id);
    }
    console.log(`schools: ${schoolIds.length}`);

    // ---- educators ----
    const pwHash = await bcrypt.hash(EDUCATOR_PASSWORD, SALT_ROUNDS);
    const usedEmails = new Set();
    const educators = []; // {id, schoolIdx}
    for (let si = 0; si < SCHOOLS.length; si++) {
      const domain = `${slug(SCHOOLS[si].abbr)}.${EMAIL_DOMAIN_SUFFIX}`;
      for (let e = 0; e < EDUCATORS_PER_SCHOOL; e++) {
        const first = pick(FIRST), last = pick(LAST);
        let local = `${first}.${last}`.toLowerCase();
        let email = `${local}@${domain}`;
        let n = 2;
        while (usedEmails.has(email)) email = `${local}${n++}@${domain}`;
        usedEmails.add(email);

        const phone = `(${randInt(200,989)}) ${randInt(200,989)}-${String(randInt(0,9999)).padStart(4,'0')}`;
        const seats = pick([250, 500, 500, 750, 1000]);
        const r = await c.query(
          `insert into educators
             (email, password, full_name, phone_number, status, school_id, admin_id, role_id,
              tokens, allocated_tokens, is_active, lms_enabled)
           values ($1,$2,$3,$4,'ACTIVE',$5,$6,$7,$8::json,$9::json,true,false)
           returning id`,
          [email, pwHash, `${first} ${last}`, phone, schoolIds[si], adminId, educatorRoleId,
           String(seats), String(seats)]);
        const id = r.rows[0].id;
        educators.push({ id, schoolIdx: si });
        await c.query(
          `insert into educator_schools (educator_id, school_id, is_primary) values ($1,$2,true)`,
          [id, schoolIds[si]]);
      }
    }
    console.log(`educators: ${educators.length} (password identical for all)`);

    // ---- classes: 10 per educator ----
    const classRows = [];   // {id, educatorId, schoolId}
    let classSeq = 0;
    for (const ed of educators) {
      const courses = shuffled(COURSES).slice(0, CLASSES_PER_EDUCATOR);
      for (let k = 0; k < CLASSES_PER_EDUCATOR; k++) {
        const [courseName, courseNum] = courses[k];
        const tm = pick(TERMS);
        const section = SECTIONS[k % SECTIONS.length];
        const abbr = SCHOOLS[ed.schoolIdx].abbr;
        const classCode = `${abbr}-${courseNum}-${section}${String(++classSeq).padStart(4, '0')}`;
        const r = await c.query(
          `insert into classes
             (class_name, class_id, term, year, status, total_no_of_students,
              educator_id, school_id, start_date, end_date, is_active)
           values ($1,$2,$3,$4,$5,0,$6,$7,$8,$9,true) returning id`,
          [`${courseName} \u2014 Sec ${section}`, classCode, tm.term, tm.year,
           pick(CLASS_STATUSES), ed.id, schoolIds[ed.schoolIdx], tm.start, tm.end]);
        classRows.push({ id: r.rows[0].id, educatorId: ed.id, schoolId: schoolIds[ed.schoolIdx], educator: ed });
      }
    }
    console.log(`classes: ${classRows.length}`);

    // ---- students: 3-10 of each educator's classes get 20-30 students ----
    const byEducator = new Map();
    for (const cr of classRows) {
      if (!byEducator.has(cr.educatorId)) byEducator.set(cr.educatorId, []);
      byEducator.get(cr.educatorId).push(cr);
    }
    let studentSeq = 0, totalStudents = 0, populatedClasses = 0;
    const batch = [];
    const flush = async () => {
      if (!batch.length) return;
      const vals = [], params = [];
      batch.forEach((s, i) => {
        const b = i * 5;
        vals.push(`($${b+1},'ACTIVE',$${b+2},$${b+3},$${b+4},$${b+5},0)`);
        params.push(s.code, s.classId, s.educatorId, s.schoolId, null);
      });
      await c.query(
        `insert into students (student_id, status, class_id, educator_id, school_id, score, attempt)
         values ${vals.join(',')}`, params);
      batch.length = 0;
    };
    for (const [educatorId, list] of byEducator) {
      const howMany = randInt(3, Math.min(10, list.length));
      const chosen = shuffled(list).slice(0, howMany);
      for (const cr of chosen) {
        const n = randInt(20, 30);
        const abbr = SCHOOLS[cr.educator.schoolIdx].abbr;
        for (let i = 0; i < n; i++) {
          batch.push({
            code: `${abbr}${String(++studentSeq).padStart(5, '0')}`,
            classId: cr.id, educatorId, schoolId: cr.schoolId,
          });
          if (batch.length >= 500) await flush();
        }
        await c.query(`update classes set total_no_of_students=$1 where id=$2`, [n, cr.id]);
        totalStudents += n; populatedClasses++;
      }
    }
    await flush();
    console.log(`students: ${totalStudents} across ${populatedClasses} populated classes`);

    await c.query('COMMIT');
    console.log(`\ncommitted in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('ROLLED BACK:', e.message);
    process.exitCode = 1;
  }
  await c.end();
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
