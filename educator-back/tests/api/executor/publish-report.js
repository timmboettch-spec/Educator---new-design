/* eslint-disable */
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

const reportsDir = path.resolve(__dirname, '../reports/html');

function fail(msg) { console.error(msg); process.exit(1); }

if (!fs.existsSync(reportsDir)) fail(`Reports folder not found: ${reportsDir}`);

const files = fs.readdirSync(reportsDir)
  .filter((f) => f.endsWith('.html'))
  .map((f) => ({ name: f, time: fs.statSync(path.join(reportsDir, f)).mtime.getTime() }))
  .sort((a,b) => b.time - a.time);

if (files.length === 0) fail('No HTML report files found in ' + reportsDir);

const latest = files[0].name;
const latestPath = path.join(reportsDir, latest);
const latestCopy = path.join(reportsDir, 'latest-report.html');

fs.copyFileSync(latestPath, latestCopy);

// Determine provider
const provider = process.env.PUBLISH_PROVIDER || process.env.PUBLISH_MODE || 'local';
let publicUrl = process.env.PUBLIC_URL || '';

async function uploadToS3() {
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const bucket = process.env.S3_BUCKET;
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  const prefix = process.env.S3_PREFIX ? process.env.S3_PREFIX.replace(/\/+$/,'') : '';
  if (!bucket) fail('S3_BUCKET environment variable is required for S3 publishing.');

  const client = new S3Client({ region });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const remoteName = (prefix ? `${prefix}/` : '') + path.basename(latestPath);
  const latestKey = (prefix ? `${prefix}/` : '') + 'latest-report.html';

  const put = async (key, filePath) => {
    const body = fs.readFileSync(filePath);
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ACL: 'public-read', ContentType: 'text/html' }));
  };

  await put(remoteName, latestPath);
  await put(latestKey, latestCopy);

  // Build public URL
  if (publicUrl) return publicUrl.endsWith('/') ? publicUrl + 'latest-report.html' : publicUrl + '/latest-report.html';
  return `https://${bucket}.s3.${region}.amazonaws.com/${latestKey}`;
}

function serveLocal() {
  // If PORT provided, use it
  const port = parseInt(process.env.REPORT_PORT || '8080', 10);
  // We'll use a very small static server using Node
  const http = require('http');
  const finalPath = latestCopy;
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/' || url === '/latest-report.html') {
      const html = fs.readFileSync(finalPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    // try serve other files by name
    const fp = path.join(reportsDir, url.replace(/^\//,''));
    if (fs.existsSync(fp)) {
      const ctype = fp.endsWith('.html') ? 'text/html' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': ctype });
      fs.createReadStream(fp).pipe(res);
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  });

  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      const url = `http://localhost:${port}/latest-report.html`;
      resolve({ url, server });
    });
  });
}

(async () => {
  let url;
  try {
    if (provider === 's3') {
      url = await uploadToS3();
    } else {
      const { url: u, server } = await serveLocal();
      url = u;
      setTimeout(() => { server.close(); }, 30000);
    }
    
    if (process.env.OPEN_REPORT === 'true') {
      const startCommand = process.platform === 'win32'
        ? `start "" "${url}"`
        : process.platform === 'darwin'
          ? `open "${url}"`
          : `xdg-open "${url}"`;

      child_process.exec(startCommand);
    }

  } catch {
    process.exitCode = 2;
  }
})();
