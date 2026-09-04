// Diff the scenario JSON keys against the `simulations` table columns.
// Run from D:\educator-back:  node local-seed/map-check.js
require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'scenarios', 'en', 'scenario');

// JSON uses camelCase / capitalised keys; the table uses snake_case for a couple of them.
const RENAME = { unitId: 'unit_id', Status: 'status' };
const norm = (k) => RENAME[k] || k;

(async () => {
  const files = fs.readdirSync(DIR);
  const keys = new Set();
  for (const f of files) {
    Object.keys(JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))).forEach((k) => keys.add(k));
  }

  const c = new Client({
    host: process.env.DB_HOST, port: +process.env.DB_PORT,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  await c.connect();
  const r = await c.query(`select column_name, data_type from information_schema.columns where table_name='simulations'`);
  const types = new Map(r.rows.map((x) => [x.column_name, x.data_type]));
  await c.end();

  const mapped = [], unmapped = [];
  for (const k of [...keys].sort()) {
    const n = norm(k);
    if (types.has(n)) mapped.push(`${k}${n !== k ? ' -> ' + n : ''} (${types.get(n)})`);
    else unmapped.push(k);
  }
  const used = new Set([...keys].map(norm));

  console.log(`scenario files: ${files.length}, distinct JSON keys: ${keys.size}\n`);
  console.log(`MAPS TO A COLUMN (${mapped.length}):\n  ` + mapped.join('\n  '));
  console.log(`\nNO COLUMN - will be dropped (${unmapped.length}):\n  ` + (unmapped.join(', ') || '(none)'));
  console.log(`\nCOLUMNS WITH NO JSON SOURCE:\n  ` + [...types.keys()].filter((x) => !used.has(x)).join(', '));
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
