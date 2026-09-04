#!/usr/bin/env node
/**
 * teardown-org-tree.js — remove data created by seed-org-tree.js.
 *
 * Deletes STRICTLY by marker. Nothing is removed unless its name or email
 * matches the marker you pass, so this cannot walk off into real data.
 *
 *   node scripts/teardown-org-tree.js --dry-run     # default: shows what matches
 *   node scripts/teardown-org-tree.js --confirm
 *
 * Deleting a school cascades server-side (schools.service.ts:504-528): its
 * classes, their students, and class-simulation rows are all soft-deleted in one
 * transaction. Educators are NOT covered by that cascade and are deleted
 * separately here.
 *
 * NOTE: admin (`users`) rows cannot be removed — the API has no delete route for
 * them (users.controller.ts has only a profile-picture delete). If you seeded
 * admins, they must be cleaned up directly in the database.
 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const hasFlag = (n) => argv.includes(`--${n}`);
const DRY_RUN = !hasFlag('confirm');

const cfg = {
  baseUrl: (process.env.API_BASE_URL || '').replace(/\/+$/, ''),
  adminEmail: process.env.EXISTING_ADMIN_EMAIL || '',
  adminPassword: process.env.EXISTING_ADMIN_PASSWORD || '',

  // Required. Schools whose name starts with this, and educators whose email
  // starts with this, are in scope. Everything else is left alone.
  marker: process.env.SEED_TAG || '',

  // Educator emails are matched on this domain as well as the marker.
  emailDomain: process.env.SEED_EMAIL_DOMAIN || '',

  requestIntervalMs: Number.parseInt(process.env.REQUEST_INTERVAL_MS ?? '250', 10),
  reportFile: process.env.TEARDOWN_REPORT || path.join(process.cwd(), 'teardown-report.json'),
};

if (!cfg.baseUrl || !cfg.adminEmail || !cfg.adminPassword || !cfg.marker) {
  console.error('\nRequired: API_BASE_URL, EXISTING_ADMIN_EMAIL, EXISTING_ADMIN_PASSWORD, SEED_TAG\n');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastAt = 0;

async function req(method, endpoint, session, body) {
  const wait = cfg.requestIntervalMs - (Date.now() - lastAt);
  if (wait > 0) await sleep(wait);
  lastAt = Date.now();

  const headers = { 'content-type': 'application/json' };
  if (session?.accessToken) headers.authorization = `Bearer ${session.accessToken}`;
  if (session?.csrfToken) headers['x-csrf-token'] = session.csrfToken;

  const res = await fetch(`${cfg.baseUrl}/api${endpoint}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  return { ok: res.ok, status: res.status, payload };
}

const titleTag = (t) => t.charAt(0).toUpperCase() + t.slice(1);

(async () => {
  const login = await req('POST', '/auth/login', null, { email: cfg.adminEmail, password: cfg.adminPassword });
  if (!login.ok || !login.payload.data?.tokens?.accessToken) {
    console.error('Login failed: ' + JSON.stringify(login.payload).slice(0, 200));
    process.exit(1);
  }
  const session = login.payload.data.tokens;
  const adminId = login.payload.data.user?.id;
  console.log(`\nAdmin ${cfg.adminEmail} (${adminId})`);
  console.log(`Marker: schools starting "${titleTag(cfg.marker)}", educators starting "${cfg.marker}."`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN — nothing deleted' : 'LIVE — deleting'}\n`);

  // --- schools -------------------------------------------------------------
  const schoolsRes = await req('GET', '/schools/user', session);
  const allSchools = Array.isArray(schoolsRes.payload.data)
    ? schoolsRes.payload.data
    : (schoolsRes.payload.data?.schools ?? []);
  const schoolPrefix = titleTag(cfg.marker);
  const schools = allSchools.filter((s) => String(s.school_name || '').startsWith(schoolPrefix));

  console.log(`Schools: ${allSchools.length} total, ${schools.length} match the marker`);
  for (const s of schools) console.log(`   - ${s.school_name} (${s.id})`);

  // --- educators -----------------------------------------------------------
  let educators = [];
  if (adminId) {
    const eduRes = await req('GET', `/educators/admin/${adminId}`, session);
    const allEdu = Array.isArray(eduRes.payload.data)
      ? eduRes.payload.data
      : (eduRes.payload.data?.educators ?? []);
    educators = allEdu.filter((e) => {
      const email = String(e.email || '');
      const markerOk = email.startsWith(cfg.marker + '.');
      const domainOk = !cfg.emailDomain || email.endsWith('@' + cfg.emailDomain);
      return markerOk && domainOk;
    });
    console.log(`\nEducators: ${allEdu.length} total, ${educators.length} match the marker`);
    for (const e of educators) console.log(`   - ${e.email} (${e.id})`);
  } else {
    console.log('\nEducators: skipped — login did not return an admin id');
  }

  if (DRY_RUN) {
    console.log('\nRe-run with --confirm to delete the matched rows.\n');
    return;
  }

  const report = { deletedSchools: [], deletedEducators: [], failures: [] };

  // Schools first: the cascade takes classes and students with them.
  for (const s of schools) {
    const r = await req('DELETE', `/schools/${s.id}`, session);
    if (r.ok) { report.deletedSchools.push(s.school_name); console.log(`deleted school ${s.school_name}`); }
    else { report.failures.push({ type: 'school', name: s.school_name, status: r.status, msg: JSON.stringify(r.payload).slice(0, 150) }); console.log(`FAILED school ${s.school_name} -> ${r.status}`); }
  }

  for (const e of educators) {
    const r = await req('DELETE', `/educators/${e.id}`, session);
    if (r.ok) { report.deletedEducators.push(e.email); console.log(`deleted educator ${e.email}`); }
    else { report.failures.push({ type: 'educator', name: e.email, status: r.status, msg: JSON.stringify(r.payload).slice(0, 150) }); console.log(`FAILED educator ${e.email} -> ${r.status}`); }
  }

  fs.writeFileSync(cfg.reportFile, JSON.stringify(report, null, 2));
  console.log(`\nDeleted ${report.deletedSchools.length} schools, ${report.deletedEducators.length} educators, ${report.failures.length} failures`);
  console.log(`Report: ${cfg.reportFile}\n`);
})();
