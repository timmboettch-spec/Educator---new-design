# Educator App Backend

Manages educators, classes, students, and the simulations assigned to them; reports outcomes back from the student-facing simulation system.

## Language

**Simulation** (catalog entry, `Simulation`/`SimulationV2`):
A definition of a scenario a student can run — what it's about, not whether anyone has done it.
_Avoid_: Scenario (used interchangeably in code via `scenario_id`, but prefer Simulation in discussion)

**My Library**:
The Simulations an Educator has saved for themselves, shown on the educator's library screen. Draft and archived Simulations never appear in it, even if saved. Removing a Simulation takes it out of My Library but does not touch Previews or ClassSimulations.
_Avoid_: Favorites (the catalog's `myFavorite` flag is the same saved state under another name), saved simulations

**Catalogue**:
Every published Simulation (not draft, not archived) an Educator can browse, whether or not they saved it. My Library is the part of the Catalogue the Educator saved. The wire name is `catalog`.

**Library filter**:
A way of narrowing My Library to the Simulations that match. The filters are Learner Level, Target Audience, Modality, Required Product Name, Difficulty and Unit, plus a search by Simulation title. Within one filter, picking several values matches any of them; across filters a Simulation must match all of them. Duration is a planned seventh filter and is not defined yet.

**Learner Level**:
The two-way grouping of a Simulation's audience, `Secondary` or `Post-Secondary`. Audience text mentioning post-secondary is Post-Secondary; text mentioning secondary or high school is Secondary; any other non-empty text (for example `BSN`) is Post-Secondary; no text belongs to neither.
_Avoid_: Level, grade (Difficulty is a different thing)

**Target Audience**:
The Simulation's own audience text as authored (for example `High School Allied Health`), before it is grouped into a Learner Level.

**Modality**:
Whether a Simulation runs with an AI avatar (`Avatar`) or without one (`Workstation`).
_Avoid_: Mode, type

**Required Product Name**:
The name of the product a Simulation needs, as typed by its author. A filter on this attribute only; it says nothing about what the educator's district has bought.

**Unit**:
The group a Simulation belongs to. A Simulation has one current Unit, and that is the one it runs under and the one the catalogue and My Library show and filter by. A My Library entry has no Unit of its own: if the Simulation is moved to another Unit, the entry follows it.

**ClassSimulation**:
The assignment of a Simulation to a Class — declares a class _can_ run it, independent of whether any student has.
_Avoid_: Assignment (not used in code, but sometimes meant when people say "assigned simulation")

**Attempt**:
One time a student ran a Simulation to completion in the student-facing app. Every Attempt is recorded in Postgres, identified by its transcript; the app reads Attempts only from Postgres, so an older Attempt that has not been backfilled from the Blob store is not visible anywhere in the app — see [ADR-0009](docs/adr/0009-attempts-in-simulation-reports-blob-retired.md).
_Avoid_: Completion (ambiguous — see Report below), Submission

**Preview**:
An Educator running a Simulation themselves in practice mode, before assigning it to a Class. It is never an Attempt and never produces a Report. Only Educators can Preview, and only Simulations they could see in the catalog (not draft or archived).
_Avoid_: "preview attempt" (collides with Attempt), "trial run", "test run"

**Preview Allowance**:
How many Previews an Educator may start for one Simulation: 3, per Educator per Simulation, with no reset. Starting a Preview uses one up for good, with no refund, whether or not the student-facing app then opens. It is independent of My Library, so removing and re-adding a Simulation does not restore it.
_Avoid_: "remaining attempts", "tries left" (the FE's `tries_left` is unrelated trial messaging)

**Report** (`SimulationReport` entity):
Synonym for an Attempt: one row in `simulation_reports`. Every Attempt is stored and listed; none is singled out as "the" Report — see [ADR-0009](docs/adr/0009-attempts-in-simulation-reports-blob-retired.md).
_Avoid_: Completion (as a synonym for this specific DB row — "completed" in product language usually just means "has a Report")

**Completion**:
Loosely used in product/ticket language to mean "a student finished a Simulation." Maps to an Attempt — see [ADR-0009](docs/adr/0009-attempts-in-simulation-reports-blob-retired.md). Not the same as a Simulation being Completed (below).

**Practice Attempt** / **Assessment Attempt**:
An Attempt run in Practice or Assessment mode; the student picks the mode per run. Practice Attempts are unlimited. Assessment Attempts are capped at the Max Attempts.

**Max Attempts**:
How many Assessment Attempts a student gets for one Simulation: 3. It follows the student and the Simulation, not the Class, so a Class Transfer or re-assignment does not reset it.
_Avoid_: Preview Allowance (an educator-side limit, unrelated)

**Simulation Progress**:
One student's standing on one Simulation: how many Practice and Assessment Attempts they have used, and whether the Simulation is still open to them. With no Attempts, the Simulation is not started.

**Completed** (Simulation):
A student has used all Max Attempts on a Simulation. It is no longer listed among that student's Simulations, and no further Attempts of either mode are allowed.
_Avoid_: Completion (that means a single Attempt)

**Forfeit**:
A student giving up their remaining Assessment Attempts on a Simulation. Allowed only after at least one Assessment Attempt and before the Max Attempts are used. A Forfeited Simulation is no longer listed among the student's Simulations, and no further Attempts of either mode are allowed.
_Avoid_: Early completion (the student-app event that triggers a Forfeit, not the Forfeit itself)

**Blob store** (`reports.json` in Azure Blob Storage):
The legacy store of Attempts. A cold archive: the app neither writes nor reads it, and it is used only as the source for backfilling Attempts into Postgres — see [ADR-0009](docs/adr/0009-attempts-in-simulation-reports-blob-retired.md).
_Avoid_: Reports.json (file name, not the concept)

**Student Code** (`student_id` column):
The short `CCC-XXXX` code a student uses to join a class: a 3-character prefix from the class name plus a 4-character random suffix. It is unique across all students (not per class), because it is the student's login key. It identifies the student to humans, not the row — it can be revoked (emptied) or regenerated, and is not the student's primary key.
_Avoid_: Student ID (the column name, but easily confused with the primary key `id`)

**Student import**:
Adding many students to one class from a CSV file. Each row succeeds or fails on its own: valid rows are added, invalid or duplicate rows are reported back, and one bad row never blocks the rest.
_Avoid_: Bulk create (a different operation — generating N students with auto-assigned Student Codes)

**Class End Date**:
The calendar date a Class is scheduled to finish. It is independent of the Class's status: a Class past its end date can still be active, and "finished" in the class list means only that this date has passed.
_Avoid_: Expiry, finished status

**Class Transfer**:
Handing a whole Class, with all its students, from one educator to another. It never moves an individual student between classes.
_Avoid_: Student transfer, class move

**Invite acceptance**:
An invited educator claiming their account by setting a password, which activates them in one step. An invite can be accepted only once.
_Avoid_: Signup, registration

**Recipient room**:
The addressable group of all live connections belonging to one notification recipient (an educator, an admin, or a student by Student Code). A real-time push goes to the recipient, so every open tab or device receives it; it is never sent to one specific connection. See [ADR-0008](docs/adr/0008-cross-replica-socketio-redis-pubsub-rooms.md).
_Avoid_: socket, socket id (a recipient has many)

**Timeline block**:
One expected step in a Simulation's scenario timeline (an action, order, vital reading, PPE step, or patient-data question), optionally with an expected start and duration, and prerequisite and follow-up blocks.
_Avoid_: Event, step (ambiguous with what a student actually did)

**Sequence chain**:
The ordered list of Timeline block ids a scenario declares. When present it replaces each block's own prerequisites and follow-ups with its immediate neighbours.

**Timeline analysis**:
The deterministic, non-AI scoring of an Attempt against a Simulation's Timeline blocks: which blocks were completed or missed, whether each was on time, and whether the Sequence chain was respected. Patient-data blocks are deferred to AI analysis.

**Compare series**:
One school, class or student whose completions are shown beside the others, month by month, when an educator switches the Simulations Completed chart from Total to Compare. Per month, the series counts add up to the Total.
_Avoid_: Breakdown (the separate drill-down view of whole-timeframe totals)

**Seat**:
One unit of AI-simulation capacity allocated to an educator by their admin, drawn from a school's subscription.
_Avoid_: Token (the column name, but "token" means an auth token everywhere else)

**Seat request**:
An educator asking their admin to allocate more Seats. It only notifies the admin and allocates nothing itself. It stays addressed to the admin the educator had when they sent it, even if the educator later moves to another admin. An educator can send at most one per cooldown window, and a request that never reached the admin does not count.
_Avoid_: Seat allocation (what the admin does in response)

**Guided Path**:
A user's remembered first-run progress for one role. There is one per user and Selected role, so an account holding two roles keeps separate progress for each. The frontend owns what the progress contains; the backend only stores and returns it.

### Auth

**Default-deny**:
Every HTTP route, in both the root app and `/students-backend`, requires a valid, non-blacklisted access token unless it is marked `@Public()`. A single global `AuthGuard` enforces this — see [ADR-0005](docs/adr/0005-single-global-default-deny-auth-guard.md).
_Avoid_: "secured controller" (security isn't a per-controller opt-in)

**Public route**:
A route (or whole controller) marked `@Public()`. Legitimate only if it issues credentials, is an infrastructure probe, is called by a third party that verifies itself (LTI, Google OAuth), or serves content that is shareable by design (the public simulation). The student-backend telemetry controller is the one tracked exception.
_Avoid_: "open", "unguarded"

**Role-selection token**:
A `purpose: 'login'` token issued to a multi-role account before it calls select-role. Accepted only on `@AllowRoleSelectionToken()` routes (select-role, `me`, logout); 401 everywhere else.
_Avoid_: "login token" on its own (ambiguous with the student login token)

**Selected role**:
The role the token's `type` claim grants for this session (`admin` = district admin). It is what the Role gate checks — see [ADR-0006](docs/adr/0006-selected-role-rbac.md).
_Avoid_: using it interchangeably with Account roles

**Account roles** (`roles[]`):
Every active role on the account, re-read from the database on each request; `['student']` for student tokens. The Role gate deliberately never reads these.

**Role gate**:
The `@RequiredRoles(...)` check. It passes when any required role matches the Selected role (any-of). Roles are flat: no role implies another, so a route open to several roles lists each. A route-level annotation replaces the controller-level one, and every route must declare exactly one of `@Public()`, `@AllowRoleSelectionToken()` or `@RequiredRoles(...)`.
