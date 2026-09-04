// Compare a local scenario folder against what is stored in Azurite.
// Usage (from D:\educator-back):  node local-seed/blob-diff.js <folder>
require('dotenv').config({ quiet: true });
const { BlobServiceClient } = require('@azure/storage-blob');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.argv[2];
if (!ROOT) { console.error('usage: node local-seed/blob-diff.js <folder>'); process.exit(1); }

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);

// local relative path -> blob name (the zip root scenarios.json maps to en/scenarios.json)
function toBlobName(rel) {
  const p = rel.split(path.sep).join('/');
  if (p === 'scenarios.json') return 'en/scenarios.json';
  return p;
}

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full));
  }
  return out;
}

(async () => {
  const svc = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
  const container = svc.getContainerClient(process.env.AZURE_BLOB_CONTAINER_NAME || 'json-data');

  const files = walk(ROOT).sort();
  console.log(`comparing ${files.length} local files against blob container\n`);
  console.log('  STATUS     LOCAL BYTES   BLOB BYTES  NAME');
  let same = 0, diff = 0, missing = 0;

  for (const rel of files) {
    const localBuf = fs.readFileSync(path.join(ROOT, rel));
    const blobName = toBlobName(rel);
    const client = container.getBlockBlobClient(blobName);
    if (!(await client.exists())) {
      missing++;
      console.log(`  MISSING  ${String(localBuf.length).padStart(11)}            -  ${blobName}`);
      continue;
    }
    const blobBuf = await client.downloadToBuffer();
    const equal = sha(localBuf) === sha(blobBuf);
    if (equal) same++; else diff++;
    console.log(`  ${equal ? 'same   ' : 'DIFFERS'}  ${String(localBuf.length).padStart(11)} ${String(blobBuf.length).padStart(12)}  ${blobName}`);
  }
  console.log(`\nsame: ${same}   differs: ${diff}   missing from blob: ${missing}`);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
