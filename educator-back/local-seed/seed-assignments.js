/*
 * Assigns real simulations to the generated classes.
 *
 * Scenario list is read from the SAME source the backend uses -- the local Azurite
 * `json-data` container (`en/scenarios.json` plus the `en/scenario/` overlays) -- so
 * every assigned scenario_id is one the app can actually resolve and run.
 *
 * Creates:
 *   class_simulations     - 3-8 random scenarios per class, with start/due/end dates
 *   educator_simulations  - each educator's library = union of their classes' scenarios
 *
 * Only touches classes belonging to generated educators (email domain `.rwthrive.test`),
 * so the pre-existing local.dev fixture is left alone. Idempotent: clears its own rows first.
 *
 * Run from D:\educator-back:  node local-seed/seed-assignments.js
 */
require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const { BlobServiceClient } = require('@azure/storage-blob');

const MIN_SIMS = 3;
const MAX_SIMS = 8;
const MARKER = '%@%.rwthrive.test';

// Deterministic PRNG so re-runs reproduce the same assignment.
let _s = 0x1f2e3d4c;
function rnd() {
  _s |= 0; _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
function shuffled(a) {
  const c = a.slice();
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  return c;
}

async function readJsonBlob(container, name) {
  const b = container.getBlockBlobClient(name);
  if (!(await b.exists())) return null;
  const buf = await b.downloadToBuffer();
  return JSON.parse(buf.toString('utf8'));
}

(async () => {
  // ---- scenarios from Azurite ----
  const svc = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
  const container = svc.getContainerClient(process.env.AZURE_BLOB_CONTAINER_NAME || 'json-data');

  const byId = new Map();
  const base = await readJsonBlob(container, 'en/scenarios.json');
  for (const s of Array.isArray(base) ? base : []) {
    if (s && s.id) byId.set(s.id, { id: s.id, unitId: s.unitId ?? '', title: s.title ?? '' });
  }
  // Overlay files win over the index (same precedence the backend applies).
  for await (const b of container.listBlobsFlat({ prefix: 'en/scenario/' })) {
    const s = await readJsonBlob(container, b.name);
    if (s && s.id) byId.set(s.id, { id: s.id, unitId: s.unitId ?? '', title: s.title ?? '' });
  }
  const scenarios = [...byId.values()].filter((s) => s.id);
  console.log(`scenarios resolvable from Azurite: ${scenarios.length}`);
  if (!scenarios.length) throw new Error('no scenarios found in blob storage - nothing to assign');

  const c = new Client({
    host: process.env.DB_HOST, port: +process.env.DB_PORT,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  await c.connect();
  await c.query('BEGIN');
  try {
    const eds = await c.query(`select id from educators where email like $1`, [MARKER]);
    const edIds = eds.rows.map((r) => r.id);
    if (!edIds.length) throw new Error('no generated educators found - run seed-org.js first');

    // clear only our own prior assignments
    await c.query(
      `delete from class_simulations where class_id in (select id from classes where educator_id = any($1::uuid[]))`,
      [edIds]);
    await c.query(`delete from educator_simulations where educator_id = any($1::uuid[])`, [edIds]);

    const classes = await c.query(
      `select id, educator_id, start_date, end_date from classes where educator_id = any($1::uuid[]) order by class_id`,
      [edIds]);
    console.log(`classes to assign: ${classes.rows.length}`);

    const libraryByEducator = new Map(); // educator_id -> Map(scenarioId -> unitId)
    const csBatch = [];
    let assignments = 0;

    const flushCs = async () => {
      if (!csBatch.length) return;
      const vals = [], params = [];
      csBatch.forEach((r, i) => {
        const b = i * 5;
        vals.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},true)`);
        params.push(r.classId, r.simId, r.start, r.due, r.end);
      });
      await c.query(
        `insert into class_simulations (class_id, simulation_id, start_date, due_date, end_date, is_active)
         values ${vals.join(',')}`, params);
      csBatch.length = 0;
    };

    for (const cl of classes.rows) {
      const n = randInt(MIN_SIMS, Math.min(MAX_SIMS, scenarios.length));
      const chosen = shuffled(scenarios).slice(0, n);
      const start = cl.start_date instanceof Date ? cl.start_date.toISOString().slice(0, 10) : String(cl.start_date);
      const end = cl.end_date instanceof Date ? cl.end_date.toISOString().slice(0, 10) : String(cl.end_date);
      // Due date sits between start and end so the student app has a meaningful deadline.
      const sMs = Date.parse(start), eMs = Date.parse(end);
      const due = new Date(sMs + Math.floor((eMs - sMs) * (0.4 + rnd() * 0.5))).toISOString().slice(0, 10);

      if (!libraryByEducator.has(cl.educator_id)) libraryByEducator.set(cl.educator_id, new Map());
      const lib = libraryByEducator.get(cl.educator_id);

      for (const s of chosen) {
        csBatch.push({ classId: cl.id, simId: s.id, start, due, end });
        lib.set(s.id, s.unitId);
        assignments++;
        if (csBatch.length >= 500) await flushCs();
      }
    }
    await flushCs();
    console.log(`class_simulations created: ${assignments}`);

    // educator libraries
    let libRows = 0;
    const libBatch = [];
    const flushLib = async () => {
      if (!libBatch.length) return;
      const vals = [], params = [];
      libBatch.forEach((r, i) => {
        const b = i * 3;
        vals.push(`($${b + 1},$${b + 2},$${b + 3})`);
        params.push(r.educatorId, r.unitId, r.simId);
      });
      await c.query(
        `insert into educator_simulations (educator_id, unit_id, scenario_id) values ${vals.join(',')}`, params);
      libBatch.length = 0;
    };
    for (const [educatorId, lib] of libraryByEducator) {
      for (const [simId, unitId] of lib) {
        libBatch.push({ educatorId, unitId: unitId || 'unmapped-' + simId, simId });
        libRows++;
        if (libBatch.length >= 500) await flushLib();
      }
    }
    await flushLib();
    console.log(`educator_simulations created: ${libRows}`);

    await c.query('COMMIT');
    console.log('committed');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('ROLLED BACK:', e.message);
    process.exitCode = 1;
  }
  await c.end();
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
