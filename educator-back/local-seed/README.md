# Local seed / inspection scripts

Local-only helpers for the `educator_dev` database on `127.0.0.1:5434`.
Excluded from git via `.git/info/exclude` — these are not part of the repo.

**Always run from `D:\educator-back`** so `dotenv`, `pg`, and `bcrypt` resolve:

```bash
cd /d/educator-back
node local-seed/seed-org.js
```

| Script | What it does |
|---|---|
| `seed-org.js` | Generates 7 schools → 15 educators each (105) → 10 classes each (1,050) → 3–10 of each educator's classes populated with 20–30 students. Idempotent. |
| `create-user.js` | Creates/resets the District Admin login `realityworks@rwthrive.ai`. |
| `counts.js` | Row counts + column dumps for the main tables. |
| `probe-azure.js` | Checks whether the commented-out Azure dev DB credentials in `.env` are usable. Reports only presence/outcome, never secret values. |

## Logins

| Account | Password | Role |
|---|---|---|
| `realityworks@rwthrive.ai` | `realityworks2709` | District Admin |
| all 105 generated educators | `Educator2709!` | Educator |

Educator emails follow `first.last@<schoolabbr>.rwthrive.test`
(abbrs: CHH, IRR, MVI, NGB, PVM, SMU, WBS).

## Idempotency

`seed-org.js` tags everything it creates via the `.rwthrive.test` educator email domain.
A re-run deletes only rows carrying that marker, then rebuilds. It uses a seeded PRNG,
so re-runs reproduce identical data.

The pre-existing fixture — educator `local.dev@rwthrive.local`, class "Local Dev Class",
student code `REALITY` — is deliberately **never** touched.

## Not done yet: simulation assignment

`simulation_catalog` (browse metadata) and `simulations` (runnable scenario content) are
both **empty**, and the catalog controller exposes only `GET`/`DELETE` — there is no create
endpoint and no seed data in the repo. So no `class_simulations` / `educator_simulations`
rows were created; there is nothing to assign.

Filling it needs one of:
1. The `sqladmin` password for `psql-dev1-rwai-edu` **plus** an Azure Postgres firewall rule
   for this machine's IP (the `.env` block has host/port/user/db but **no** password).
2. A catalog export file to load locally.
3. Fabricated rows — makes the UI look real, but the student app cannot run them, since real
   scenario content lives in Azure Blob.

## Gotcha: CSRF on API calls

Every non-login API call needs the login response's `csrfToken` echoed back as an
`x-csrf-token` header, plus the login cookies. Without it: `"CSRF token missing in header or body"`.

```bash
RESP=$(curl -s -c /tmp/cj.txt -X POST http://localhost:6002/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"realityworks@rwthrive.ai","password":"realityworks2709"}')
# then send: -b /tmp/cj.txt -H "Authorization: Bearer <accessToken>" -H "x-csrf-token: <csrfToken>"
```
