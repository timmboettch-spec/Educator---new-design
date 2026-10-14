import { randomUUID } from 'crypto';
import { importPKCS8, SignJWT } from 'jose';
import pg from 'pg';
import { decryptSecret } from '../src/lms/utils/lms-secret-crypto';
import { buildAgsScoreUrl } from '../src/lms/utils/lms-url.util';
import '../src/env-loader';

async function getToken(
  tokenEndpoint: string,
  clientId: string,
  privateKeyPem: string,
  platformKeyId: string,
  scope: string,
): Promise<string> {
  const privateKey = await importPKCS8(privateKeyPem.replace(/\\n/g, '\n').trim(), 'RS256');
  const assertion = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: platformKeyId })
    .setIssuer(clientId)
    .setSubject(clientId)
    .setAudience(tokenEndpoint)
    .setIssuedAt()
    .setExpirationTime('2m')
    .setJti(randomUUID())
    .sign(privateKey);

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
      scope,
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Token failed (${response.status}): ${body}`);
  }

  return (JSON.parse(body) as { access_token: string }).access_token;
}

async function main(): Promise<void> {
  const client = new pg.Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USERNAME ?? 'educator',
    password: process.env.DB_PASSWORD ?? 'educator_local_dev',
    database: process.env.DB_DATABASE ?? 'educator_dev',
  });
  await client.connect();

  const { rows } = await client.query<{
    client_id: string;
    token_endpoint: string;
    platform_private_key_pem: string;
    platform_key_id: string;
  }>(`
    SELECT client_id, token_endpoint, platform_private_key_pem, platform_key_id
    FROM lms_school_config
    WHERE school_id = '94a55c2b-1c3a-4d71-9024-d6189047e7a8' AND status = 'active'
    LIMIT 1
  `);
  await client.end();

  const cfg = rows[0];
  const pem = decryptSecret(cfg.platform_private_key_pem);
  const studentClientId = 'i7yoKHW82KIhTsv';
  const educatorClientId = cfg.client_id;
  const lineItemUrl =
    'https://moodle.realityworksai.com/mod/lti/services.php/12/lineitems/14/lineitem?type_id=4';
  const scoreUrl = buildAgsScoreUrl(lineItemUrl);
  const scoreScope = 'https://purl.imsglobal.org/spec/lti-ags/scope/score';
  const lineItemScope = 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem';

  for (const clientId of [studentClientId, educatorClientId]) {
    console.log(`\n=== OAuth client_id: ${clientId} ===`);
    try {
      const token = await getToken(cfg.token_endpoint, clientId, pem, cfg.platform_key_id, scoreScope);
      console.log('token: ok');

      const scoresRes = await fetch(scoreUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.ims.lis.v1.scorecontainer+json',
        },
      });
      console.log('GET scores:', scoresRes.status, (await scoresRes.text()).slice(0, 1500));

      const lineRes = await fetch(lineItemUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.ims.lis.v2.lineitem+json',
        },
      });
      console.log('GET lineitem:', lineRes.status, (await lineRes.text()).slice(0, 800));
    } catch (err) {
      console.log('error:', err instanceof Error ? err.message : String(err));
    }
  }

  const collectionUrl =
    'https://moodle.realityworksai.com/mod/lti/services.php/12/lineitems?type_id=4';

  for (const scope of [
    'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
    'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
  ]) {
    try {
      const t = await getToken(cfg.token_endpoint, studentClientId, pem, cfg.platform_key_id, scope);
        headers: {
          Authorization: `Bearer ${t}`,
          Accept: 'application/vnd.ims.lis.v2.lineitemcontainer+json',
        },
      });
      console.log(`\nLine items with scope [${scope}] -> ${res.status}`);
      console.log((await res.text()).slice(0, 2500));
    } catch (err) {
      console.log(`scope [${scope}] token error:`, err instanceof Error ? err.message : err);
    }
  }

  const postToken = await getToken(
    cfg.token_endpoint,
    studentClientId,
    pem,
    cfg.platform_key_id,
    scoreScope,
  );
  const payload = {
    timestamp: new Date().toISOString(),
    scoreGiven: 85,
    scoreMaximum: 100,
    activityProgress: 'Completed',
    gradingProgress: 'FullyGraded',
    userId: '8',
  };
  const postRes = await fetch(scoreUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${postToken}`,
      'Content-Type': 'application/vnd.ims.lis.v1.score+json',
    },
    body: JSON.stringify(payload),
  });
  console.log('\n=== POST score userId=8 ===');
  console.log('status', postRes.status);
  console.log('body', (await postRes.text()).slice(0, 1000));

  const nrpsScope = 'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly';
  const nrpsToken = await getToken(
    cfg.token_endpoint,
    studentClientId,
    pem,
    cfg.platform_key_id,
    nrpsScope,
  );
  const nrpsUrl =
    'https://moodle.realityworksai.com/mod/lti/services.php/CourseSection/12/bindings/3/memberships';
  const nrpsRes = await fetch(nrpsUrl, {
    headers: {
      Authorization: `Bearer ${nrpsToken}`,
      Accept: 'application/vnd.ims.lti-nrps.v2.membershipcontainer+json',
    },
  });
  console.log('\n=== NRPS bindings/3 ===');
  const nrpsBody = await nrpsRes.text();
  console.log(nrpsRes.status, nrpsBody.slice(0, 4000));

  let members: Array<{ user_id?: string; status?: string; name?: string }> = [];
  try {
    const parsed = JSON.parse(nrpsBody) as { members?: typeof members };
    members = parsed.members ?? [];
  } catch {
    // ignore
  }

  for (const member of members.filter((m) => m.status === 'Active').slice(0, 5)) {
    const userId = member.user_id ?? '';
    if (!userId) continue;
    const attempt = await fetch(scoreUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${postToken}`,
        'Content-Type': 'application/vnd.ims.lis.v1.score+json',
      },
      body: JSON.stringify({ ...payload, userId }),
    });
    console.log(`POST score userId=${userId} -> ${attempt.status}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
