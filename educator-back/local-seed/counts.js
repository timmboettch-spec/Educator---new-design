require('dotenv').config({ quiet: true });
const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  await c.connect();
  const tables = ['users','educators','schools','educator_schools','classes','students',
    'simulation_catalog','simulations','simulation_library','educator_simulations',
    'class_simulations','simulation_reports','invites','products','role'];
  const out = [];
  for (const t of tables) {
    try { const r = await c.query(`select count(*)::int n from ${t}`); out.push({ table: t, rows: r.rows[0].n }); }
    catch (e) { out.push({ table: t, rows: 'ERR: ' + e.message.slice(0, 40) }); }
  }
  console.table(out);

  const cols = async (t) => {
    const r = await c.query(
      `select column_name, data_type, is_nullable, column_default
       from information_schema.columns where table_name=$1 order by ordinal_position`, [t]);
    console.log(`\n=== ${t} ===`);
    console.log(r.rows.map(x =>
      `  ${x.column_name} : ${x.data_type}${x.is_nullable === 'NO' ? ' NOT NULL' : ''}${x.column_default ? ' default ' + String(x.column_default).slice(0,30) : ''}`
    ).join('\n'));
  };
  for (const t of ['schools','educators','classes','students','simulation_catalog']) await cols(t);
  await c.end();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
