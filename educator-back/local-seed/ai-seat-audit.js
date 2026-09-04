/*
 * Replicates ClassSimulationService.requiresAiSeats() for every catalog scenario, so we
 * can see which simulations charge AI seats and which are free -- and cross-checks that
 * against what was actually deducted during seeding.
 *
 * Run from D:\educator-back:  node local-seed/ai-seat-audit.js
 */
require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const { BlobServiceClient } = require('@azure/storage-blob');

// Mirrors isAiCategoryLabel() in class-simulation.service.ts
function isAiCategoryLabel(value) {
  if (!value) return false;
  const n = String(value).trim().toLowerCase();
  if (!n) return false;
  if (n === 'ai' || n.includes('artificial intelligence')) return true;
  if (n.split(/[^a-z0-9]+/).some((t) => t === 'ai')) return true;
  return n.startsWith('ai') && n.includes('sim');
}

const readJson = async (container, name) => {
  const b = container.getBlockBlobClient(name);
  if (!(await b.exists())) return null;
  return JSON.parse((await b.downloadToBuffer()).toString('utf8'));
};

(async () => {
  const svc = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
  const container = svc.getContainerClient(process.env.AZURE_BLOB_CONTAINER_NAME || 'json-data');

  const byId = new Map();
  for (const s of (await readJson(container, 'en/scenarios.json')) || []) if (s?.id) byId.set(s.id, s);
  for await (const b of container.listBlobsFlat({ prefix: 'en/scenario/' })) {
    const s = await readJson(container, b.name);
    if (s?.id) byId.set(s.id, s);
  }
  const units = (await readJson(container, 'units.json')) || [];
  const unitById = new Map(units.map((u) => [String(u.id).trim(), u]));

  const c = new Client({
    host: process.env.DB_HOST, port: +process.env.DB_PORT,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  await c.connect();

  const libRows = await c.query('select unit_id, category from simulation_library');
  const libByUnit = new Map();
  for (const r of libRows.rows) {
    if (!libByUnit.has(r.unit_id)) libByUnit.set(r.unit_id, []);
    libByUnit.get(r.unit_id).push(r.category);
  }
  const simRows = await c.query('select id, unit_id, class, department from simulations');
  const simById = new Map(simRows.rows.map((r) => [r.id, r]));

  const out = [];
  for (const [id, scenario] of byId) {
    const sim = simById.get(id) || {};
    let reason = '';
    let ai = false;

    if (isAiCategoryLabel(sim.class)) { ai = true; reason = `simulations.class="${sim.class}"`; }
    else if (isAiCategoryLabel(sim.department)) { ai = true; reason = `simulations.department="${sim.department}"`; }
    else if (isAiCategoryLabel(scenario.class)) { ai = true; reason = `scenario.class="${scenario.class}"`; }
    else if (isAiCategoryLabel(scenario.department)) { ai = true; reason = `scenario.department="${scenario.department}"`; }
    else {
      const unitId = String(sim.unit_id ?? scenario.unitId ?? '').trim();
      if (!unitId) reason = 'no unit_id -> free';
      else {
        const cats = libByUnit.get(unitId) || [];
        if (cats.some(isAiCategoryLabel)) { ai = true; reason = `simulation_library.category for unit ${unitId}`; }
        else {
          const u = unitById.get(unitId);
          if (u && isAiCategoryLabel(u.category)) { ai = true; reason = `units.json category="${u.category}"`; }
          else reason = `unit "${unitId}" not AI-categorised -> free`;
        }
      }
    }
    out.push({ scenario: id, title: String(scenario.title || '').trim().slice(0, 34), charges_seats: ai, why: reason.slice(0, 52) });
  }

  out.sort((a, b) => Number(b.charges_seats) - Number(a.charges_seats) || a.scenario.localeCompare(b.scenario));
  console.table(out);
  console.log(`AI (charge seats): ${out.filter((x) => x.charges_seats).length}   FREE: ${out.filter((x) => !x.charges_seats).length}`);

  // Cross-check against what seeding actually consumed.
  const spend = await c.query(`
    select coalesce(sum((allocated_tokens)::text::int),0)::int consumed,
           coalesce(sum((tokens)::text::int),0)::int remaining
      from educators where email like '%.rwthrive.test'`);
  const expected = await c.query(`
    select coalesce(sum(cnt),0)::int expected_if_all_ai from (
      select cs.class_id, count(distinct cs.id) * (
        select count(*) from students s where s.class_id = cs.class_id and s.is_active = true) cnt
      from class_simulations cs group by cs.class_id) t`);
  console.log('\nactual seats consumed  :', spend.rows[0].consumed);
  console.log('if EVERY sim were AI   :', expected.rows[0].expected_if_all_ai);
  console.log('educator seats remaining:', spend.rows[0].remaining);

  await c.end();
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
