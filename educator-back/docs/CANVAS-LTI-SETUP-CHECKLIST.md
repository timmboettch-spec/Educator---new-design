# Canvas LTI 1.3 — Setup Checklist

Administrator / DevOps checklist to connect **Canvas** to Realityworks (**Educator** + **HS Online** student app) using LTI 1.3.

This matches the current backend behavior: two LTI tools, school config in Realityworks, NRPS roster sync, and role-based launch handoff.

---

## At a glance

| Stage | Where | Outcome |
|-------|--------|---------|
| 1. Prepare | Realityworks + Canvas | Admin access and public API URL available |
| 2. Register Educator tool | Canvas Admin | Educator Client ID + Deployment ID |
| 3. Register Student tool | Canvas Admin | Student Client ID + Deployment ID |
| 4. Configure Realityworks | LMS Integration UI / API | Both tool configs saved for the school |
| 5. Add tools to course | Canvas course | Launch points available |
| 6. Validate | Canvas + Realityworks | Teacher → Educator; student → HS Online |

---

## 0. Engineering readiness (already in code)

| Area | Location |
|------|----------|
| Canvas NRPS adapter | `src/lms/adapters/canvas.adapter.ts` |
| Canvas REST fallback | same adapter: course users, list courses, role enrich, email lookup |
| Shared NRPS parser | `src/lms/utils/nrps.util.ts` |
| Adapter factory | `LmsAdapterFactory` + `lms.module.ts` |
| Default Canvas OIDC helpers | `resolveDefaultLtiEndpoints(LmsType.CANVAS, issuer)` |
| LTI login / callback / launch | `src/lti/lti.controller.ts`, `lti.service.ts` |
| Large Canvas Client ID handling | `src/lti/lti-jwt.service.ts` (raw JWT `aud` / `azp`) |
| Role-based launch routing | Instructor → Educator; Learner → HS Online (either tool) |
| Unit / integration coverage | `tests/unit/lms/*`, `tests/unit/lti/*`, `tests/integration/lti/*` |

---

## 1. Public API base URL

Set a public HTTPS API base that **includes the Nest `/api` prefix**:

```text
API_BASE_URL=https://<your-public-host>/api
```

Examples:
- Production-style: `https://api.yourdomain.com/api`
- Local tunnel: `https://<tunnel>.trycloudflare.com/api` or `https://<tunnel>.ngrok-free.app/api`

Also set (for post-launch redirects):

```text
FRONTEND_URL=https://<educator-app-host>          # or http://localhost:5173 for local-only handoff
STUDENT_FRONTEND_URL=https://<hs-online-host>   # or http://localhost:5174 for local-only handoff
```

**Important**
- Canvas Developer Keys use **only** the API host (section 2).
- Do **not** put Educator / HS Online URLs in Developer Keys.
- For local testing: API must be public (tunnel); frontends may be `localhost` if you launch Canvas in a browser on the same machine.

---

## 2. Tool URLs for Canvas Developer Keys

All paths are relative to `API_BASE_URL` (already ending in `/api`).

### Educator tool

| Canvas field | Value |
|--------------|--------|
| Key Name | Realityworks Educator Portal |
| OpenID Connect Initiation URL | `{API_BASE_URL}/lti/login` |
| Redirect URIs | `{API_BASE_URL}/lti/callback` |
| Target Link URI | `{API_BASE_URL}/lti/launch` |
| JWK Method | Public JWK URL |
| Public JWK URL | `{API_BASE_URL}/lti/jwks` |

### Student tool

| Canvas field | Value |
|--------------|--------|
| Key Name | Realityworks Student Portal |
| OpenID Connect Initiation URL | `{API_BASE_URL}/lti/studentlogin` |
| Redirect URIs | `{API_BASE_URL}/lti/studentcallback` |
| Target Link URI | `{API_BASE_URL}/lti/studentlaunch` |
| JWK Method | Public JWK URL |
| Public JWK URL | `{API_BASE_URL}/lti/studentjwks` |

Use exact URLs (no trailing-slash drift).

---

## 3. Canvas instance prerequisites

- [ ] Instructure-hosted **or** self-hosted confirmed
- [ ] Prefer **Test** / **Beta** for first setup (not Production)
- [ ] Admin access with **Developer Keys** permission
- [ ] Free-for-Teachers is **not** used (cannot create LTI Developer Keys)
- [ ] Test course with at least one instructor and one student

### Hosted platform endpoints (reference)

| Env | Issuer | OIDC Auth | JWKS | Token |
|-----|--------|-----------|------|-------|
| Production | `https://canvas.instructure.com` | `https://sso.canvaslms.com/api/lti/authorize_redirect` | `https://sso.canvaslms.com/api/lti/security/jwks` | `https://sso.canvaslms.com/login/oauth2/token` |
| Beta | `https://canvas.beta.instructure.com` | `https://sso.beta.canvaslms.com/api/lti/authorize_redirect` | `https://sso.beta.canvaslms.com/api/lti/security/jwks` | `https://sso.beta.canvaslms.com/login/oauth2/token` |
| Test | `https://canvas.test.instructure.com` | `https://sso.test.canvaslms.com/api/lti/authorize_redirect` | `https://sso.test.canvaslms.com/api/lti/security/jwks` | `https://sso.test.canvaslms.com/login/oauth2/token` |

Institution base URL example: `https://yourschool.instructure.com` (store as `lmsBaseUrl`).

Self-hosted: use that instance’s issuer + auth + JWKS + token URLs.

**Local Canvas Docker note:** stock local JWKS keys may be &lt; 2048 bits. Backend allows a local-issuer crypto fallback only for local Canvas hosts. Hosted Canvas uses strict verification.

---

## 4. Create and deploy 2 LTI Developer Keys

Admin → Developer Keys → **+ LTI Key**.

For **each** key (Educator + Student):

- [ ] Paste tool URLs from section 2
- [ ] Privacy level: **Public** (email required for educator auto-login)
- [ ] Enable LTI Advantage service: retrieve user data for the course context (NRPS)
- [ ] Toggle key **On**
- [ ] Copy **Client ID**

Deploy each app:

- [ ] Admin → Settings → Apps → + App → **By Client ID** (account-level preferred)
- [ ] Copy **Deployment ID** for each install
- [ ] Keep Educator and Student IDs clearly labeled (do not cross them)

Also add the apps to the test course if not inherited from the account.

---

## 5. Configure Realityworks (per school, both tools)

Configure **Educator** and **Student** separately via the authenticated **LMS Integration** UI (or the authenticated LMS config API).

Do **not** use legacy public helpers — `POST /api/lti/bootstrap-config` and `/api/lti/debug-launch` were removed. They accepted unsigned JWTs and must not be used to seed or inspect LMS config on any environment (local, cloud, or prod).

### Required fields

| Field | Educator | Student |
|-------|----------|---------|
| `lmsType` | `canvas` | `canvas` |
| `toolType` | `educator` | `student` |
| `issuer` | Canvas issuer (hosted table above) | same |
| `clientId` | Educator Client ID | Student Client ID |
| `deploymentId` | Educator Deployment ID | Student Deployment ID |
| `authEndpoint` | Canvas OIDC authorize URL | same family |
| `tokenEndpoint` | Canvas token URL | same family |
| `jwksUrl` | Canvas JWKS URL | same family |
| `lmsBaseUrl` | Institution Canvas URL | same |
| `sharePii` | `true` when email/name needed | `true` when needed |
| `lmsApiToken` | Optional when NRPS works; **required** for Canvas REST roster fallback | Optional |


API reference:

- `POST /api/lms/schools/configure`
- Verify: `GET /api/lms/educator/config?toolType=educator` (sensitive values redacted)

### Educator account rule

Create the Realityworks educator with the **same email** as their Canvas login so LTI auto-login can match the user.

---

## 6. Course setup in Canvas

- [ ] Publish the course before adding people (if required by your Canvas workflow)
- [ ] Enroll instructor(s) and student(s)
- [ ] Ensure Realityworks Educator and/or Student tools are available (nav or External Tool assignment)
- [ ] For assignment launches: Submission Type = External Tool → select the correct Realityworks key → open in new tab recommended

---

## 7. Validation

### Educator launch

- [ ] Instructor opens Educator tool / assignment in Canvas
- [ ] Lands in Educator without a separate Realityworks password login
- [ ] Course / class context is correct

### Student launch

- [ ] Student opens Student tool / assignment (or Educator tool — see role routing below)
- [ ] Lands in HS Online with auto-login (no access code)
- [ ] Can see assigned simulations for that course after educator adds them

### Role-based routing (current product behavior)

| Canvas role | Opens Educator tool | Opens Student tool |
|-------------|---------------------|--------------------|
| Instructor / Teacher | → Educator | → Educator |
| Learner / Student | → HS Online | → HS Online |

Wrong-tool clicks are routed by **role**, not blocked with `educator_role_required` (unless the role is unrecognized).

### Roster (NRPS primary, REST fallback)

- [ ] Instructor/student roles recognized
- [ ] Students map to the correct class
- [ ] Repeat launches do not create duplicate class/student records
- [ ] Optional: set `lmsApiToken` (Canvas access token) + `lmsBaseUrl` so roster can fall back to  
  `GET /api/v1/courses/:id/users?include[]=enrollments` when NRPS fails

---

## 8. Troubleshooting (redirect `reason=`)

| Reason | Likely cause | What to check |
|--------|--------------|---------------|
| `school_not_configured` | No LMS config for school | Save Educator/Student config in Realityworks |
| `email_required_from_lms` | Canvas did not send email | Developer Key privacy = **Public** |
| `nrps_required` | Roster service unavailable | Enable NRPS / context membership scope |
| `not_course_instructor` | User not an instructor in context | Canvas enrollment role |
| `educator_role_required` | Unrecognized / non instructor-learner role | Role claims on the launch |
| `deployment_mismatch` | Deployment ID mismatch | Compare Canvas Deployment ID to Realityworks config |
| `invalid_token` | JWT validation failed | Client ID, issuer, JWKS, Developer Key URLs |
| `educator_not_registered` | No matching Realityworks educator | Same email as Canvas; user exists in school |
| `student_not_found` | No mapped student | Roster sync / student mapping for that LMS user |

---

## 9. Grade passback (AGS) — required for Canvas grades

Grade passback uses **LTI Assignment and Grade Services** on the **Student** Developer Key.
The same AGS path is used for Moodle and Canvas (`LtiAgsAdapter` via `LmsGradeService`).

### Canvas Admin → Student Developer Key → Additional Settings

Enable **Assignment and Grade Services** and grant at least:

| Scope | Purpose |
|-------|---------|
| `https://purl.imsglobal.org/spec/lti-ags/scope/score` | POST scores into the gradebook |
| `https://purl.imsglobal.org/spec/lti-ags/scope/lineitem` | Create/list line items (optional but useful) |
| `https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly` | Read existing line items |

Without the **score** scope, Realityworks can authenticate (NRPS works) but **cannot** write grades.

### Capture a line item (assignment mapping)

1. In the Canvas course, create an **Assignment** with Submission Type = **External Tool** → Realityworks **Student** tool.
2. Have the student open that assignment once (LTI launch).
3. Backend `captureAgsMapping` stores `lms_assignment_mapping` (line item URL + class + simulation when the class has one sim).

### Trigger passback

- **Auto:** Assessment-mode report completion → `submitGradePassback` → AGS score POST to Canvas/Moodle.

---

## 10. Final checklist

- [ ] Educator Developer Key on + Client ID + Deployment ID recorded
- [ ] Student Developer Key on + Client ID + Deployment ID recorded
- [ ] Student key has AGS **score** scope
- [ ] NRPS / privacy configured
- [ ] Educator + Student configs saved in Realityworks (`lmsType=canvas`)
- [ ] `API_BASE_URL` public and includes `/api`
- [ ] Canvas Keys match current API host exactly
- [ ] Instructor launch → Educator OK
- [ ] Student launch → HS Online OK (creates AGS mapping when launched from graded assignment)
- [ ] Course context + simulations OK
- [ ] Roster sync OK when enabled
- [ ] Grade appears in Canvas after Assessment completion

---

## References

- Admin user guide: Realityworks LTI Canvas Integration (Administrator Setup Guide)
- https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.lti_dev_key_config
- https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.lti_launch_overview
- https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.provisioning.md
