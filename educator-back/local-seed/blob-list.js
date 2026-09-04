// List blobs in the local Azurite container the backend reads scenarios from.
// Run from D:\educator-back:  node local-seed/blob-list.js
require('dotenv').config({ quiet: true });
const { BlobServiceClient } = require('@azure/storage-blob');

const CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER = process.env.AZURE_BLOB_CONTAINER_NAME || 'json-data';

(async () => {
  if (!CONN) throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set');
  const svc = BlobServiceClient.fromConnectionString(CONN);

  console.log('containers:');
  for await (const c of svc.listContainers()) console.log('  -', c.name);

  const container = svc.getContainerClient(CONTAINER);
  const exists = await container.exists();
  console.log(`\ncontainer "${CONTAINER}" exists: ${exists}`);
  if (!exists) return;

  const blobs = [];
  for await (const b of container.listBlobsFlat()) blobs.push({ name: b.name, bytes: b.properties.contentLength });
  console.log(`blobs in "${CONTAINER}": ${blobs.length}`);
  blobs.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 60).forEach((b) =>
    console.log(`  ${String(b.bytes).padStart(9)}  ${b.name}`));
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
