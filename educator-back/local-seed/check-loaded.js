// For each scenario in a local folder, report whether it is present in Azurite,
// resolvable by the backend, and assigned to any class.
// Usage (from D:\educator-back):  node local-seed/check-loaded.js <folder>
require('dotenv').config({ quiet: true });
const { BlobServiceClient } = require('@azure/storage-blob');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2];
const DIR = path.join(ROOT, 'en', 'scenario');

(async () => {
  const svc = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
  const container = svc.getContainerClient(process.env.AZURE_BLOB_CONTAINER_NAME || 'json-data');

  // what the backend actually merges: index + overlays
  const idxBuf = await container.getBlockBlobClient('en/scenarios.json').downloadToBuffer();
  const index = JSON.parse(idxBuf.toString('utf8'));
  const indexIds = new Set((Array.isArray(index) ? index : []).map((s) => s && s.id).filter(Boolean));

  const overlayIds = new Set();
  for await (const b of container.listBlobsFlat({ prefix: 'en/scenario/' })) {
    const j = JSON.parse((await container.getBlockBlobClient(b.name).downloadToBuffer()).toString('utf8'));
    if (j && j.id) overlayIds.add(j.id);
  }
  const resolvable = new Set([...indexIds, ...overlayIds]);

  const c = new Client({
    host: process.env.DB_HOST, port: +process.env.DB_PORT,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  await c.connect();
  const counts = new Map(
    (await c.query('select simulation_id, count(*)::int n from class_simulations group by 1')).rows
      .map((r) => [r.simulation_id, r.n]));
  await c.end();

  console.log(`blob index entries: ${indexIds.size}`);
  console.log(`blob overlay files: ${overlayIds.size}`);
  console.log(`total resolvable  : ${resolvable.size}\n`);

  const rows = fs.readdirSync(DIR).map((f) => {
    const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    return {
      id: j.id,
      title: String(j.title || '').trim().slice(0, 38),
      in_blob_index: indexIds.has(j.id),
      in_blob_overlay: overlayIds.has(j.id),
      class_assignments: counts.get(j.id) || 0,
    };
  });
  console.table(rows);
  const notLoaded = rows.filter((r) => !r.in_blob_index && !r.in_blob_overlay);
  console.log(notLoaded.length ? `NOT LOADED: ${notLoaded.map((r) => r.id).join(', ')}` : 'All scenarios in this folder are loaded and resolvable.');
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
