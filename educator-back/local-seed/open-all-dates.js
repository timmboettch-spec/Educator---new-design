/*
 * Makes every generated class and simulation assignment open RIGHT NOW through year end.
 *
 *   classes             -> status ACTIVE, is_active true, start 2026-01-01, end 2026-12-31
 *   class_simulations   -> start 2026-01-01, due 2026-12-31, end 2026-12-31, is_active true
 *   students            -> status ACTIVE, is_active true
 *
 * Scoped to generated educators (email domain `.rwthrive.test`) so the pre-existing
 * local.dev fixture is left alone. Safe to re-run.
 *
 * Run from D:\educator-back:  node local-seed/open-all-dates.js
 */
require('dotenv').config({ quiet: true });
const { Client } = require('pg');

const START = '2026-01-01';
const END = '2026-12-31';
const MARKER = '%@%.rwthrive.test';

(async () => {
  const c = new Client({
    host: process.env.DB_HOST, port: +process.env.DB_PORT,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  await c.connect();
  await c.query('BEGIN');
  try {
    const eds = await c.query('select id from educators where email like $1', [MARKER]);
    const edIds = eds.rows.map((r) => r.id);
    if (!edIds.length) throw new Error('no generated educators found');
    console.log(`scope: ${edIds.length} generated educators`);

    const cl = await c.query(
      `update classes set status='ACTIVE', is_active=true, start_date=$2::date, end_date=$3::date
       where educator_id = any($1::uuid[])`, [edIds, START, END]);
    console.log(`classes opened:            ${cl.rowCount}`);

    const cs = await c.query(
      `update class_simulations set start_date=$2, due_date=$3, end_date=$3, is_active=true
       where class_id in (select id from classes where educator_id = any($1::uuid[]))`,
      [edIds, START, END]);
    console.log(`class_simulations opened:  ${cs.rowCount}`);

    const st = await c.query(
      `update students set status='ACTIVE', is_active=true where educator_id = any($1::uuid[])`, [edIds]);
    console.log(`students activated:        ${st.rowCount}`);

    await c.query('COMMIT');
    console.log('\ncommitted');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('ROLLED BACK:', e.message);
    process.exitCode = 1;
  }
  await c.end();
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
