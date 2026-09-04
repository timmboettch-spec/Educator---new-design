// Probe whether the commented-out Azure dev DB credentials in D:\educator-back\.env
// are present and usable for a READ-ONLY catalog copy.
// Prints only presence/shape and connection outcome -- never credential values.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(process.cwd(), '.env');
const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);

// Pull the commented Azure block: lines like "# DB_HOST=..."
const azure = {};
for (const l of lines) {
  const m = l.match(/^\s*#\s*(DB_HOST|DB_PORT|DB_USERNAME|DB_PASSWORD|DB_NAME)\s*=\s*(.+?)\s*$/);
  if (m) azure[m[1]] = m[2];
}

const PLACEHOLDER = /^(<.*>|xxx+|todo|changeme|your[-_ ]?password|\.\.\.|\*+|)$/i;
console.log('=== commented Azure block ===');
for (const k of ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_NAME']) {
  const v = azure[k];
  if (!v) { console.log(`  ${k}: ABSENT`); continue; }
  if (k === 'DB_PASSWORD') {
    console.log(`  ${k}: present, length=${v.length}, looksLikePlaceholder=${PLACEHOLDER.test(v)}`);
  } else {
    console.log(`  ${k}: ${v}`);
  }
}

const missing = ['DB_HOST', 'DB_USERNAME', 'DB_PASSWORD', 'DB_NAME'].filter((k) => !azure[k]);
if (missing.length) {
  console.log('\nCannot attempt connection - missing:', missing.join(', '));
  process.exit(0);
}
if (PLACEHOLDER.test(azure.DB_PASSWORD)) {
  console.log('\nCannot attempt connection - DB_PASSWORD is a placeholder, not a real secret.');
  process.exit(0);
}

(async () => {
  const c = new Client({
    host: azure.DB_HOST,
    port: Number(azure.DB_PORT || 5432),
    user: azure.DB_USERNAME,
    password: azure.DB_PASSWORD,
    database: azure.DB_NAME,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    statement_timeout: 20000,
  });
  try {
    await c.connect();
    console.log('\nCONNECTED to Azure dev DB (read-only intent).');
    const n = await c.query('select count(*)::int n from simulation_catalog');
    console.log('  simulation_catalog rows available:', n.rows[0].n);
    const s = await c.query('select id, title, unit, category, target_audience from simulation_catalog order by id limit 5');
    console.log('  sample:');
    console.table(s.rows);
    await c.end();
  } catch (e) {
    console.log('\nCONNECTION FAILED:', e.message);
    console.log('  (Azure Postgres firewall must allowlist this machine IP, per the .env comment.)');
    try { await c.end(); } catch {}
    process.exit(1);
  }
})();
