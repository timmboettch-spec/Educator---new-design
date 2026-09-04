// Create/reset a local District Admin login. Idempotent on email.
// Run with cwd = D:\educator-back so bcrypt/pg/dotenv resolve.
require('dotenv').config();
const { Client } = require('pg');
const bcrypt = require('bcrypt');

const EMAIL = 'realityworks@rwthrive.ai';
const PASSWORD = 'realityworks2709';
const FULL_NAME = 'Realityworks Admin';
const ROLE = 'District Admin';
const SALT_ROUNDS = 10; // matches AuthConstants.SALT_ROUNDS

(async () => {
  const c = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await c.connect();

  const role = await c.query('select id from role where role_name = $1', [ROLE]);
  if (!role.rows.length) throw new Error(`role "${ROLE}" not found — run: npm run seed:roles`);
  const roleId = role.rows[0].id;

  const hash = await bcrypt.hash(PASSWORD, SALT_ROUNDS);

  // Login normalizes to trim().toLowerCase(), so store the email lowercased.
  const res = await c.query(
    `insert into users (email, password, status, full_name, is_license_active, role_id)
     values ($1, $2, 'ACTIVE', $3, true, $4)
     on conflict (email) do update
       set password = excluded.password,
           status = 'ACTIVE',
           full_name = excluded.full_name,
           is_license_active = true,
           role_id = excluded.role_id
     returning id, email, full_name, status, is_license_active`,
    [EMAIL.toLowerCase(), hash, FULL_NAME, roleId],
  );

  console.log('user upserted:');
  console.table(res.rows);

  // Prove the stored hash validates the intended password.
  const check = await c.query('select password from users where email = $1', [EMAIL.toLowerCase()]);
  console.log('bcrypt prefix stored:', check.rows[0].password.slice(0, 4));
  console.log('bcrypt.compare(correct password) =', await bcrypt.compare(PASSWORD, check.rows[0].password));
  console.log('bcrypt.compare(wrong password)   =', await bcrypt.compare('wrong-password', check.rows[0].password));

  await c.end();
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
