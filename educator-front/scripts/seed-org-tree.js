#!/usr/bin/env node
/**
 * seed-org-tree.js — bulk-provision an org tree over the public API.
 *
 * Shape:  admin -> schools -> educators -> classes -> students
 *
 * Either creates admins itself (needs ROLE_ID_DISTRICT_ADMIN) or works under an
 * admin that already exists (EXISTING_ADMIN_EMAIL). Talks HTTP only — no
 * database credentials, no repo dependencies. Node >= 18 (needs global fetch).
 *
 *   node scripts/seed-org-tree.js --dry-run
 *   node scripts/seed-org-tree.js --confirm
 *
 * Writes NOTHING without --confirm.
 */

// This repo is ESM ("type": "module" in package.json), so use import syntax.
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);

const DRY_RUN = !hasFlag('confirm');
const VERBOSE = hasFlag('verbose');

const cfg = {
  // Bare origin, no trailing slash and no /api suffix — the script appends /api.
  baseUrl: (process.env.API_BASE_URL || '').replace(/\/+$/, ''),

  // UUID of the 'District Admin' row in the target env's `role` table. Role ids
  // are generated per-environment by the seeder, so this differs between
  // dev/qa/prod. Only needed when the script creates admins itself.
  districtAdminRoleId: process.env.ROLE_ID_DISTRICT_ADMIN || '',

  // Work under an admin that already exists instead of creating new ones. When
  // set, no admin accounts are created and ADMIN_COUNT is forced to 1. This
  // password is used to log in only — never written to state or output files.
  existingAdminEmail: process.env.EXISTING_ADMIN_EMAIL || '',
  existingAdminPassword: process.env.EXISTING_ADMIN_PASSWORD || '',

  // Every generated email is <local>@<domain>. Keep this domain exclusive to
  // seeded data — it is the handle you have for finding or removing it later.
  emailDomain: process.env.SEED_EMAIL_DOMAIN || 'seed.rwthrive.test',

  // Marker embedded in names and emails so seeded rows are greppable.
  tag: process.env.SEED_TAG || 'seed',

  password: process.env.SEED_PASSWORD || '',

  adminCount: int(process.env.ADMIN_COUNT, 1),
  schoolsPerAdmin: int(process.env.SCHOOLS_PER_ADMIN, 1),
  educatorsPerSchool: int(process.env.EDUCATORS_PER_SCHOOL, 1),
  classesPerEducator: int(process.env.CLASSES_PER_EDUCATOR, 1),
  studentsPerClass: int(process.env.STUDENTS_PER_CLASS, 1),

  // Server throttle is 5 req/sec for authenticated callers, hardcoded with no
  // env override, so stay under it. 250ms => 4/sec.
  requestIntervalMs: int(process.env.REQUEST_INTERVAL_MS, 250),
  maxRetries: int(process.env.MAX_RETRIES, 5),

  // Anything slower than this is recorded as an anomaly.
  slowRequestMs: int(process.env.SLOW_REQUEST_MS, 3000),

  classStartDate: process.env.CLASS_START_DATE || isoDate(new Date()),
  classEndDate: process.env.CLASS_END_DATE || isoDate(addMonths(new Date(), 6)),
  classYear: process.env.CLASS_YEAR || String(new Date().getFullYear()),
  classTerm: process.env.CLASS_TERM || 'Fall',

  stateFile: process.env.SEED_STATE_FILE || path.join(process.cwd(), 'seed-state.json'),
  outputFile: process.env.SEED_OUTPUT_FILE || path.join(process.cwd(), 'seed-output.json'),
};

function int(value, fallback) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function addMonths(d, n) {
  const out = new Date(d);
  out.setMonth(out.getMonth() + n);
  return out;
}

const USE_EXISTING_ADMIN = Boolean(cfg.existingAdminEmail);
if (USE_EXISTING_ADMIN) cfg.adminCount = 1;

function validateConfig() {
  const errors = [];
  if (!cfg.baseUrl) errors.push('API_BASE_URL is required (bare origin, e.g. https://educatorbe.realityworksai.com)');
  if (/\/api$/.test(cfg.baseUrl)) errors.push('API_BASE_URL must NOT include /api — the script appends it');
  if (USE_EXISTING_ADMIN) {
    if (!cfg.existingAdminPassword) errors.push('EXISTING_ADMIN_PASSWORD is required when EXISTING_ADMIN_EMAIL is set');
  } else if (!cfg.districtAdminRoleId) {
    errors.push('ROLE_ID_DISTRICT_ADMIN is required, or set EXISTING_ADMIN_EMAIL to work under an existing admin');
  }
  if (!cfg.password) errors.push('SEED_PASSWORD is required');
  else if (cfg.password.length < 8 || cfg.password.length > 20) errors.push('SEED_PASSWORD must be 8-20 characters (server rule)');
  if (errors.length) {
    console.error('\nConfiguration errors:\n' + errors.map((e) => `  - ${e}`).join('\n') + '\n');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Anomaly tracking
// ---------------------------------------------------------------------------

const anomalies = [];
const timings = []; // { endpoint, ms }
let throttleHits = 0;
let networkRetries = 0;

function anomaly(kind, detail) {
  anomalies.push({ kind, detail, at: new Date().toISOString() });
  console.warn(`  ANOMALY [${kind}] ${detail}`);
}

// ---------------------------------------------------------------------------
// HTTP client — global throttle, 429 backoff, Bearer + x-csrf-token
// ---------------------------------------------------------------------------

let lastRequestAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  const wait = cfg.requestIntervalMs - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function request(method, endpoint, body, session, attempt = 1) {
  await throttle();

  const headers = { 'content-type': 'application/json' };
  if (session?.accessToken) headers.authorization = `Bearer ${session.accessToken}`;
  // Presence-only validation server-side, but send the real token anyway.
  if (session?.csrfToken) headers['x-csrf-token'] = session.csrfToken;

  const url = `${cfg.baseUrl}/api${endpoint}`;
  const startedAt = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    networkRetries++;
    if (attempt <= cfg.maxRetries) {
      const backoff = 500 * 2 ** (attempt - 1);
      anomaly('network', `${method} ${endpoint}: ${err.message} — retry ${attempt}/${cfg.maxRetries} in ${backoff}ms`);
      await sleep(backoff);
      return request(method, endpoint, body, session, attempt + 1);
    }
    throw new Error(`${method} ${endpoint} failed after ${cfg.maxRetries} retries: ${err.message}`);
  }

  const elapsed = Date.now() - startedAt;
  // Normalize ids out of the path so timings group meaningfully.
  timings.push({ endpoint: `${method} ${endpoint.replace(/\/[0-9a-f-]{36}/gi, '/:id')}`, ms: elapsed });
  if (elapsed > cfg.slowRequestMs) {
    anomaly('slow-response', `${method} ${endpoint} took ${elapsed}ms`);
  }

  const text = await res.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (res.status === 429 && attempt <= cfg.maxRetries) {
    throttleHits++;
    const backoff = 1000 * 2 ** (attempt - 1);
    anomaly('throttled-429', `${method} ${endpoint} — retry ${attempt}/${cfg.maxRetries} in ${backoff}ms`);
    await sleep(backoff);
    return request(method, endpoint, body, session, attempt + 1);
  }

  if (res.status >= 500) {
    anomaly('server-error', `${method} ${endpoint} -> ${res.status}`);
  }

  if (VERBOSE) log(`  ${method} ${endpoint} -> ${res.status} (${elapsed}ms)`);

  return { ok: res.ok, status: res.status, payload };
}

// The API returns 200 with {status:'error'} or {success:false} in places rather
// than a 4xx, so success has to be judged on the body too.
function isSuccess(res) {
  if (!res.ok) return false;
  const p = res.payload || {};
  if (p.success === false) return false;
  if (typeof p.status === 'string' && p.status.toLowerCase() === 'error') return false;
  return true;
}

function messageOf(res) {
  const p = res.payload || {};
  const m = p.message ?? p.error ?? p.raw;
  if (Array.isArray(m)) return m.join('; ');
  return typeof m === 'string' ? m : JSON.stringify(p).slice(0, 300);
}

function looksLikeExists(res) {
  return /exist|already|duplicate|taken/i.test(messageOf(res));
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const log = (m) => console.log(m);
const counters = { created: 0, reused: 0, failed: 0 };

// ---------------------------------------------------------------------------
// Naming — deterministic, so a re-run resolves to the same rows
// ---------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');
const titleTag = () => cfg.tag.charAt(0).toUpperCase() + cfg.tag.slice(1);

const names = {
  adminEmail: (a) => `${cfg.tag}.admin${pad(a)}@${cfg.emailDomain}`,
  adminName: (a) => `${titleTag()} Admin ${pad(a)}`,
  schoolName: (a, s) => `${titleTag()} School ${pad(a)}-${pad(s)}`,
  educatorEmail: (a, s, e) => `${cfg.tag}.a${pad(a)}s${pad(s)}e${pad(e)}@${cfg.emailDomain}`,
  educatorName: (a, s, e) => `${titleTag()} Educator ${pad(a)}-${pad(s)}-${pad(e)}`,
  className: (a, s, e, c) => `${titleTag()} Class ${pad(a)}-${pad(s)}-${pad(e)}-${pad(c)}`,
};

// ---------------------------------------------------------------------------
// State ledger — makes the run resumable and idempotent
// ---------------------------------------------------------------------------

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(cfg.stateFile, 'utf8'));
  } catch {
    return { admins: {} };
  }
}

let state = loadState();

function saveState() {
  if (DRY_RUN) return;
  fs.writeFileSync(cfg.stateFile, JSON.stringify(state, null, 2));
}

// ---------------------------------------------------------------------------
// API operations
// ---------------------------------------------------------------------------

async function login(email, password) {
  const res = await request('POST', '/auth/login', { email, password }, null);
  if (!isSuccess(res)) throw new Error(`login failed for ${email}: ${messageOf(res)}`);
  const tokens = res.payload.data?.tokens || {};
  if (!tokens.accessToken) throw new Error(`login for ${email} returned no accessToken`);
  return { accessToken: tokens.accessToken, csrfToken: tokens.csrfToken };
}

async function createAdmin(a) {
  const email = names.adminEmail(a);
  const res = await request('POST', '/auth/signup', {
    email,
    full_name: names.adminName(a),
    password: cfg.password,
    role_id: cfg.districtAdminRoleId,
  }, null);

  if (isSuccess(res)) { counters.created++; return { email, reused: false }; }
  if (looksLikeExists(res)) { counters.reused++; return { email, reused: true }; }
  throw new Error(`admin signup failed for ${email}: ${messageOf(res)}`);
}

async function createSchool(session, a, s) {
  const school_name = names.schoolName(a, s);
  const res = await request('POST', '/schools', { school_name }, session);
  if (isSuccess(res)) {
    const id = res.payload.data?.id ?? res.payload.data?.school?.id;
    if (!id) throw new Error(`school "${school_name}" returned no id: ${messageOf(res)}`);
    counters.created++;
    return id;
  }
  throw new Error(`school create failed for "${school_name}": ${messageOf(res)}`);
}

/** Two-step: invite (creates the PENDING educator row) then signup with invite_id. */
async function createEducator(adminSession, schoolId, a, s, e) {
  const email = names.educatorEmail(a, s, e);
  const full_name = names.educatorName(a, s, e);

  const invite = await request('POST', '/invites/create', { email, full_name, school_id: schoolId }, adminSession);
  if (!isSuccess(invite)) {
    if (looksLikeExists(invite)) { counters.reused++; return { email, reused: true }; }
    throw new Error(`invite failed for ${email}: ${messageOf(invite)}`);
  }

  const data = invite.payload.data || {};
  const inviteId = data.invite?.id ?? data.id;
  if (!inviteId) throw new Error(`invite for ${email} returned no invite id: ${messageOf(invite)}`);

  const signup = await request('POST', '/auth/signup', { email, full_name, password: cfg.password, invite_id: inviteId }, null);
  if (!isSuccess(signup)) {
    if (looksLikeExists(signup)) { counters.reused++; return { email, reused: true }; }
    throw new Error(`educator signup failed for ${email}: ${messageOf(signup)}`);
  }

  counters.created++;
  return { email, reused: false };
}

/** Classes are educator-owned: the token MUST be the educator's, not the admin's. */
async function createClass(educatorSession, schoolId, a, s, e, c) {
  const class_name = names.className(a, s, e, c);
  const res = await request('POST', '/classes', {
    class_name,
    term: cfg.classTerm,
    year: cfg.classYear,
    start_date: cfg.classStartDate,
    end_date: cfg.classEndDate,
    school_id: schoolId,
  }, educatorSession);

  if (isSuccess(res)) {
    const id = res.payload.data?.id ?? res.payload.data?.class?.id;
    if (!id) throw new Error(`class "${class_name}" returned no id: ${messageOf(res)}`);
    counters.created++;
    return { id, class_name };
  }
  throw new Error(`class create failed for "${class_name}": ${messageOf(res)}`);
}

async function createStudents(educatorSession, classId, count) {
  const res = await request('POST', '/students/bulk', { class_id: classId, count }, educatorSession);
  if (!isSuccess(res)) throw new Error(`bulk students failed for class ${classId}: ${messageOf(res)}`);

  const data = res.payload.data;
  const list = Array.isArray(data) ? data : (data?.students ?? []);
  if (list.length !== count) {
    anomaly('student-count-mismatch', `class ${classId}: asked for ${count}, got ${list.length}`);
  }
  counters.created += list.length;
  return list.map((s) => ({ id: s.id, student_id: s.student_id }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  validateConfig();

  const totals = {
    admins: USE_EXISTING_ADMIN ? 0 : cfg.adminCount,
    schools: cfg.adminCount * cfg.schoolsPerAdmin,
    educators: cfg.adminCount * cfg.schoolsPerAdmin * cfg.educatorsPerSchool,
  };
  totals.classes = totals.educators * cfg.classesPerEducator;
  totals.students = totals.classes * cfg.studentsPerClass;

  const requestCount =
    cfg.adminCount * (USE_EXISTING_ADMIN ? 1 : 2) +
    totals.schools + totals.educators * 3 + totals.classes * 2;

  log('');
  log('  Target      : ' + cfg.baseUrl);
  log('  Admin       : ' + (USE_EXISTING_ADMIN ? cfg.existingAdminEmail + ' (existing)' : 'created by script'));
  log('  Email domain: ' + cfg.emailDomain);
  log('  Will create : ' +
    `${totals.admins} admins, ${totals.schools} schools, ${totals.educators} educators, ` +
    `${totals.classes} classes, ${totals.students} students`);
  log(`  ~${requestCount} requests at ${cfg.requestIntervalMs}ms spacing (>= ~${Math.ceil((requestCount * cfg.requestIntervalMs) / 60000)} min)`);
  log('  Mode        : ' + (DRY_RUN ? 'DRY RUN — no writes' : 'LIVE — writes to the target'));
  log('');

  if (DRY_RUN) {
    log('  Sample of what would be created:');
    log(`    school   "${names.schoolName(1, 1)}"`);
    log(`    educator ${names.educatorEmail(1, 1, 1)}`);
    log(`    class    "${names.className(1, 1, 1, 1)}"  ${cfg.classStartDate} -> ${cfg.classEndDate}`);
    log(`    students ${cfg.studentsPerClass} per class, codes auto-generated server-side`);
    log('');
    log('  Re-run with --confirm to execute.');
    log('');
    return;
  }

  const startedAt = Date.now();

  for (let a = 1; a <= cfg.adminCount; a++) {
    const adminKey = `admin${pad(a)}`;
    state.admins[adminKey] = state.admins[adminKey] || { schools: {} };
    const adminState = state.admins[adminKey];

    let adminEmail, adminPassword;
    if (USE_EXISTING_ADMIN) {
      adminEmail = cfg.existingAdminEmail;
      adminPassword = cfg.existingAdminPassword;
      adminState.password = '(pre-existing account — not stored)';
      counters.reused++;
    } else {
      const admin = await createAdmin(a);
      adminEmail = admin.email;
      adminPassword = cfg.password;
      adminState.password = cfg.password;
    }
    adminState.email = adminEmail;
    log(`[admin] ${adminEmail}`);

    const adminSession = await login(adminEmail, adminPassword);

    for (let s = 1; s <= cfg.schoolsPerAdmin; s++) {
      const schoolKey = `school${pad(s)}`;
      adminState.schools[schoolKey] = adminState.schools[schoolKey] || { educators: {} };
      const schoolState = adminState.schools[schoolKey];

      try {
        if (!schoolState.id) {
          schoolState.id = await createSchool(adminSession, a, s);
          schoolState.school_name = names.schoolName(a, s);
        }
        saveState();
        log(`  [school ${s}/${cfg.schoolsPerAdmin}] ${schoolState.school_name} ${schoolState.id}`);

        for (let e = 1; e <= cfg.educatorsPerSchool; e++) {
          const eduKey = `educator${pad(e)}`;
          schoolState.educators[eduKey] = schoolState.educators[eduKey] || { classes: {} };
          const eduState = schoolState.educators[eduKey];

          try {
            const educator = await createEducator(adminSession, schoolState.id, a, s, e);
            eduState.email = educator.email;
            eduState.password = cfg.password;
            saveState();

            const eduSession = await login(educator.email, cfg.password);
            log(`    [educator ${e}/${cfg.educatorsPerSchool}] ${educator.email}`);

            for (let c = 1; c <= cfg.classesPerEducator; c++) {
              const classKey = `class${pad(c)}`;
              if (eduState.classes[classKey]?.students?.length) continue; // already done

              try {
                const klass = await createClass(eduSession, schoolState.id, a, s, e, c);
                const students = await createStudents(eduSession, klass.id, cfg.studentsPerClass);
                eduState.classes[classKey] = { id: klass.id, class_name: klass.class_name, students };
                saveState();
                if (VERBOSE) log(`      ${klass.class_name} (+${students.length})`);
              } catch (err) {
                counters.failed++;
                anomaly('class-failed', `a${a}s${s}e${e}c${c}: ${err.message}`);
              }
            }
            log(`      ${Object.keys(eduState.classes).length}/${cfg.classesPerEducator} classes done`);
          } catch (err) {
            counters.failed++;
            anomaly('educator-failed', `a${a}s${s}e${e}: ${err.message}`);
          }
        }
      } catch (err) {
        counters.failed++;
        anomaly('school-failed', `a${a}s${s}: ${err.message}`);
      }
      saveState();
    }
  }

  const rows = writeOutput();
  report(rows, totals, startedAt);
}

/** Flatten the ledger into a credential sheet + a student-code CSV. */
function writeOutput() {
  const rows = [];
  for (const [, admin] of Object.entries(state.admins)) {
    for (const [, school] of Object.entries(admin.schools || {})) {
      for (const [, edu] of Object.entries(school.educators || {})) {
        for (const [, klass] of Object.entries(edu.classes || {})) {
          for (const st of klass.students || []) {
            rows.push({
              admin_email: admin.email,
              school_name: school.school_name,
              school_id: school.id,
              educator_email: edu.email,
              class_name: klass.class_name,
              class_id: klass.id,
              student_code: st.student_id,
            });
          }
        }
      }
    }
  }

  fs.writeFileSync(cfg.outputFile, JSON.stringify({
    educator_password: cfg.password,
    anomalies,
    tree: state.admins,
    flat: rows,
  }, null, 2));

  const csvPath = cfg.outputFile.replace(/\.json$/, '') + '.csv';
  const header = 'school_name,school_id,educator_email,class_name,class_id,student_code';
  fs.writeFileSync(csvPath, [header, ...rows.map((r) =>
    [`"${r.school_name}"`, r.school_id, r.educator_email, `"${r.class_name}"`, r.class_id, r.student_code].join(','),
  )].join('\n'));

  return rows;
}

function report(rows, totals, startedAt) {
  // Duplicate student codes: the server has NO unique constraint on
  // students.student_id and generates it from an in-memory set, so collisions
  // are possible. This is the single most important thing to check.
  const seen = new Map();
  for (const r of rows) {
    if (!r.student_code) { anomaly('missing-student-code', `class ${r.class_id} produced a student with no code`); continue; }
    seen.set(r.student_code, (seen.get(r.student_code) || 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, n]) => n > 1);
  for (const [code, n] of dupes) anomaly('duplicate-student-code', `${code} appears ${n} times`);

  // Latency by endpoint — surfaces the quadratic student-id generation.
  const byEndpoint = new Map();
  for (const t of timings) {
    const g = byEndpoint.get(t.endpoint) || [];
    g.push(t.ms);
    byEndpoint.set(t.endpoint, g);
  }

  const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
  log('');
  log(`  Done in ${mins} min — created ${counters.created}, reused ${counters.reused}, failed ${counters.failed}`);
  log(`  Expected ${totals.students} students, produced ${rows.length} rows`);
  log('');
  log('  Latency by endpoint (ms):');
  for (const [ep, list] of byEndpoint) {
    const sorted = [...list].sort((x, y) => x - y);
    const avg = Math.round(list.reduce((s, v) => s + v, 0) / list.length);
    log(`    ${ep.padEnd(28)} n=${String(list.length).padEnd(5)} min=${sorted[0]} avg=${avg} max=${sorted[sorted.length - 1]}`);
  }
  log('');
  log(`  429s: ${throttleHits}   network retries: ${networkRetries}   unique student codes: ${seen.size}/${rows.length}`);
  log(`  Anomalies recorded: ${anomalies.length}`);
  if (anomalies.length) {
    const byKind = new Map();
    for (const x of anomalies) byKind.set(x.kind, (byKind.get(x.kind) || 0) + 1);
    for (const [k, n] of byKind) log(`    ${k}: ${n}`);
  }
  log('');
  log(`  State  : ${cfg.stateFile}`);
  log(`  Output : ${cfg.outputFile}`);
  log('');
}

main().catch((err) => {
  console.error('\nFatal: ' + err.message + '\n');
  saveState();
  process.exit(1);
});
