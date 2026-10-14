# Google Classroom — implementation and connect steps

Review guide for RWAI-3121 / 3124 / 3125. Google Classroom is an **educator** feature. It does **not** use Canvas/Moodle LTI adapters. Admin LMS Integration stays Moodle/Canvas.

---

## Ticket split

| Ticket | What it adds | Backend | Frontend |
|---|---|---|---|
| **RWAI-3121** | OAuth connect + status | Merged to `dev` (#683) | Folded into later FE work |
| **RWAI-3124** | Disconnect, profile (“Connected as”), `openid`/`email`, URL checks, multi-school picker | Merged to `dev` (#723) | Merged to `dev` (#667) — UI lived on `/lms-integration` |
| **RWAI-3125** | List/link Google courses to app classes, CourseWork on assign, educator page `/google-classroom` | Open (#735), rebased onto `dev` | Open (#676), rebased onto `dev` locally (push with `--force-with-lease` if remote is stale) |

How these land on `dev` now: **3121 → 3124 → 3125**, each PR targeting `dev`. 3125 is the only remaining merge.

---

## What the product does

1. Educator (or admin) connects a **school** to a Google Classroom teacher account (OAuth, offline refresh token).
2. They list that teacher’s Google courses and **link one Google course ↔ one app class**.
3. When they **assign a simulation** to a linked class, the backend creates a Classroom assignment (CourseWork) with a student link.
4. Moodle/Canvas stay on **LMS Integration** (`/lms-integration`) for admins. Educators hitting that URL are redirected to `/google-classroom`.

---

## Architecture (keep these separate)

```
Educator app  ──JWT──►  Nest /api/google/*     ──OAuth + Classroom API──►  Google
                         /api/auth/google/callback
Admin LMS     ──JWT──►  Nest /api/lms/*        ──LTI──►  Moodle / Canvas
```

- GC tokens live in `google_school_connections` (per educator per school), not in LMS school config.
- Course links: `google_course_mappings`.
- CourseWork links: `google_coursework_mappings`.
- OAuth `state` is stored in Redis (`google:oauth:state:…`, 10 minutes).

---

## End-to-end flow

### A. Connect (OAuth)

```
Educator opens /google-classroom
  → GET  /api/google/schools/:schoolId/connection
  → POST /api/google/schools/:schoolId/connect
       backend stores Redis state { schoolId, educatorId }
       returns Google authorizationUrl
  → browser goes to accounts.google.com
  → Google redirects to
       GET /api/auth/google/callback?code=…&state=…
  → backend exchanges code, saves tokens + Google email/id
  → redirects to FRONTEND_URL + /google-classroom
       ?googleClassroom=connected&schoolId=…
  → UI toasts success and refreshes connection status
```

On failure the callback still redirects to the same page with `googleClassroom=error&reason=…`:

| `reason` | Meaning |
|---|---|
| `provider_denied` | User cancelled / Google error |
| `missing_code` | No auth code |
| `invalid_or_expired_state` | Redis state missing/expired |
| `token_exchange_failed` | Token endpoint rejected |
| `callback_failed` | Anything else |

**Disconnect:** `DELETE /api/google/schools/:schoolId/connection` revokes Google tokens (best effort) and deletes the DB row.

**Authorize URL check (3124):** only `https://accounts.google.com` and `https://oauth2.googleapis.com` (exact host, no credentials).

### B. List and link courses (3125)

After status is `connected`:

```
GET  /api/google/schools/:schoolId/courses
GET  /api/classes/user?school_id=:schoolId     (app classes to link to)
POST /api/google/schools/:schoolId/course-mappings
       { classId, googleCourseId, googleCourseName }
DELETE /api/google/schools/:schoolId/course-mappings/:mappingId
```

Rules:

- Connection is **per educator per school**.
- Course list shows: (1) unlinked courses the educator **owns** in Google (`ownerId` === connected `googleAccountId`), and (2) linked courses Google returned for them as a teacher. If they are not yet RW owner/co-instructor on that linked class, Connect / Re-sync **auto-adds** them as a co-instructor (`class_educators`).
- Unlinked co-taught courses stay hidden until the owner links them (missing `ownerId` / `googleAccountId` never opens the list).
- New link/provision is Google-owner only; unlink is RW class-owner only.
- Roster sync, CourseWork create/delete, and grade passback always use the **RW class owner's** Google OAuth token (not the co-instructor's). If the owner disconnects GC, co-instructors may still see linked classes in the app, but Google ops fail until the owner reconnects.
- One Google course ↔ one app class (enforced both ways).
- Class must belong to that school.
- Educator must have an active GC connection for that school.

### C. Assign simulation → Classroom CourseWork (3125)

On class-simulation assign, if the class is linked:

1. Skip if CourseWork already exists for that class + simulation.
2. Create Classroom CourseWork (100 points, optional due date).
3. Student material URL:

```
{STUDENT_FRONTEND_URL}?source=google_classroom&simulationId={id}&googleCourseId={courseId}
```

Local fallback for student URL: `http://localhost:5174`.  
Assign failures are **logged, not thrown** — the app assign still succeeds.

### D. Student auto-login (backend OAuth, same pattern as LTI)

1. Student opens the Classroom link → HS Online `/login?source=google_classroom&…`
2. Student app **full-page redirects** to Educator BE:  
   `GET /api/auth/google/student/start?simulationId=&googleCourseId=`
3. BE stores Redis OAuth state (`purpose=student_login`) and redirects to Google (openid/email).
4. Google returns to existing `GET /api/auth/google/callback` (same redirect URI as educator connect).
5. BE exchanges code → Google `sub` → `google_student_mappings` → `StudentsService.studentLogin`.
6. BE creates a one-time LTI-style session code and redirects to:  
   `{STUDENT_FRONTEND_URL}/student-dashboard?lti_launch=success&code=…`
7. Student app exchanges the code via `POST /api/lti/session/exchange` (same handler as Canvas/Moodle).

No `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is required on the student frontend.  
Manual student-code entry remains available if Google OAuth fails.

---

## Frontend surfaces

| Who | Route | What |
|---|---|---|
| Educator | Sidebar → **Google Classroom** → `/google-classroom` | Connect, disconnect, list courses, link/unlink |
| Educator | `/lms-integration` | Redirects to `/google-classroom` (query string preserved for OAuth return) |
| Admin | `/lms-integration` | Moodle/Canvas **and** GC connect (3124). No course list/link here |
| Admin | `/google-classroom` | Same panel as educator (school dropdown) |

Panel behavior:

- Single-school educator: school is auto-selected.
- Multi-school educator / admin: school dropdown (3124 review).
- Connection is **per educator per school**, not shared across educators at the school.

Redux: `src/redux/lms/GoogleClassroomRedux.ts` (Educator frontend repo)  
API prefix: `{VITE_API_URL}/api/google/schools`

---

## Backend files (3125 unique vs `dev`)

OAuth/status/disconnect already on `dev` from 3121/3124. 3125 adds:

- `src/google/google-classroom.service.ts` — Classroom HTTP (courses, CourseWork)
- `src/google/google-course-mapping.service.ts` — list/link/unlink
- `src/google/google-coursework.service.ts` — ensure CourseWork
- entities + repos + migrations `1790300000000`, `1790400000000`
- `class-simulation.service.ts` hook on assign
- controller routes for courses / course-mappings

Default OAuth return path on 3125: `/google-classroom`  
(`GOOGLE_CLASSROOM_SUCCESS_REDIRECT_PATH`; 3124 default on `dev` was `/lms-integration`)

---

## Config (no secrets in this doc)

### Google Cloud (already provisioned)

- Project: `rwt-classroom-dev`
- Consent: **Internal** (rwthrive.com + secondary domain `curionn.com`)
- Web client redirect URIs:
  - `http://localhost:3000/api/auth/google/callback`
  - `https://dev.educatorbe.realityworksai.com/api/auth/google/callback`

### Key Vault `akvdev1rwai`

| Secret | Env |
|---|---|
| `edu-google-classroom-oauth-client-id` | `GOOGLE_CLASSROOM_CLIENT_ID` |
| `edu-google-classroom-oauth-client-secret` | `GOOGLE_CLASSROOM_CLIENT_SECRET` |
| `edu-google-classroom-testuser-shared-password` | Test users only (not app env) |
| `edu-google-classroom-admin-usman-ahmad-temp-password` | Your Workspace admin temp password (stale after first login) |

### Local backend `.env`

```env
GOOGLE_CLASSROOM_CLIENT_ID=…
GOOGLE_CLASSROOM_CLIENT_SECRET=…
GOOGLE_CLASSROOM_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
GOOGLE_CLASSROOM_SUCCESS_REDIRECT_PATH=/google-classroom
FRONTEND_URL=http://localhost:5173
STUDENT_FRONTEND_URL=http://localhost:5174
```

Need Redis (OAuth state) and a current DB (run migrations).

Default scopes: `openid` + `email` + the eight Classroom scopes from the DevOps handoff.

---

## Steps to connect everything (review / QA)

### 0. Run the apps

1. Backend on `:3000` (3125 branch or `dev`+3125).
2. Educator frontend on `:5173` (3125 branch).
3. Confirm `FRONTEND_URL` and redirect URI match the Google client.

### 1. Sign in to the Educator app

Use an **educator** in school **LGS** (or the school you will connect). Create app class **GC Test 123** if it is not there.

### 2. Open Google Classroom in the app

Sidebar → **Google Classroom**.  
Status should be **Not connected**. Pick the school if you have more than one.

### 3. Connect Google

1. Click **Connect**.
2. Sign in as **`gc-teacher1@curionn.com`** (Classroom Test Users OU).
3. Consent to Classroom scopes.
4. Land on `/google-classroom?googleClassroom=connected&schoolId=…`.
5. UI shows **Connected** and **Connected as {email}**.

**Known blocker:** Workspace **2-Step Verification** currently blocks `gc-teacher1`. That is Google policy, not the app. James must enroll or **exempt** the Classroom Test Users OU. Until then, Connect always dies on Google’s 2SV page.

Your `@rwthrive.com` admin is for **admin.google.com / GCP**, not Classroom and not app Connect.

### 4. Link the seeded course

1. Course list should include **Realityworks Classroom Test Course**.
2. Select app class **GC Test 123** → **Link**.
3. Row shows Linked.

Seeded course: https://classroom.google.com/c/ODc3MTQ4MzQzMjc3

### 5. Assign a simulation (CourseWork)

1. Assign a simulation to **GC Test 123**.
2. App assign succeeds even if Google fails (check backend logs).
3. In Classroom, a new assignment appears with the student link (`source=google_classroom`).

### 6. Disconnect (optional)

**Disconnect** clears the school connection. Course mappings remain until unlinked; CourseWork in Google is not deleted on disconnect.

---

## API cheat sheet

All except the callback require educator/admin JWT.

| Method | Path |
|---|---|
| POST | `/api/google/schools/:schoolId/connect` |
| GET | `/api/google/schools/:schoolId/connection` |
| DELETE | `/api/google/schools/:schoolId/connection` |
| GET | `/api/google/schools/:schoolId/courses` |
| GET | `/api/google/schools/:schoolId/course-mappings` |
| POST | `/api/google/schools/:schoolId/course-mappings` |
| DELETE | `/api/google/schools/:schoolId/course-mappings/:mappingId` |
| GET | `/api/auth/google/callback` (no JWT; Google redirect) |

---

## Grade passback

On Assessment simulation completion (`handleStudentReportCompletion`), the backend:

1. Reuses the same best-of-up-to-3 Assessment score as Canvas/Moodle AGS
2. Looks up `google_course_mappings` + `google_student_mappings` + `google_coursework_mappings`
3. Uses the school educator OAuth token to `studentSubmissions.patch` (+ `:return`)
4. Logs attempts in `google_grade_sync_log` (pending → sent | failed); skips if unlinked / unmapped / score did not improve

## Out of scope (not this stack)

- Bulk grade import from Classroom
- Marketplace / Google verification compliance
- Mixing GC tokens into Moodle/Canvas config
- Using GC as another LTI platform

---

## Quick review checklist

- [ ] Educator never needs `/lms-integration` for GC (redirect works)
- [ ] Admin still has Moodle/Canvas on `/lms-integration`
- [ ] Connect → callback → “Connected as” email
- [ ] Disconnect revokes and clears status
- [ ] Multi-school picker is not stuck on primary school
- [ ] Authorize URL rejects non-Google hosts
- [ ] Link/unlink is 1:1 course ↔ class
- [ ] Assign creates CourseWork only when the class is linked
- [ ] Failed CourseWork does not fail the app assign
- [ ] No ACS / dotenv / throttle unrelated diffs on the GC PRs
