# CLAUDE.md — Educator App (frontend)

> **Keep this file current.** Update it in the same turn you change config, find
> or fix a defect, or lose time to a trap. Correct wrong entries rather than
> appending a second version. Mark what is *verified* vs *inferred*.

Vite + React app for educators and admins: class management, student rosters,
simulation assignment, and viewing student reports.

---

## Ground rules

- **Local only.** Nothing is committed or pushed; no cloud services configured.
- **The Cloudflare tunnel is a deliberate exception** —
  `educatorapp.rwthrive.ai` → `localhost:6001`. Do not propose stopping it.

## Topology

| | |
|---|---|
| This app | `localhost:6001`, public via `https://educatorapp.rwthrive.ai` |
| Runs as | NSSM service `educator-front` (Automatic), `node_modules/vite/bin/vite.js` |
| API target | `VITE_API_URL=https://educatorbackend.rwthrive.ai` |
| Backend | `D:\educator-back` on `localhost:6002` + local Postgres 17 on `5434` |

**The API URL goes through the tunnel, not direct to localhost.** That still
reaches the *local* backend — verified: a student that exists only in the local
database resolves identically via `educatorbackend.rwthrive.ai` and
`localhost:6002` (same UUID). Traffic leaves and returns via Cloudflare, but the
data is local.

Use **npm**, not pnpm — the README's pnpm instructions do not work here.

## Logins

| Role | Credentials |
|---|---|
| Educator | `<first.last>@<school-abbr>.rwthrive.test` / `Educator2709!` |
| Admin | `realityworks@rwthrive.ai` / `realityworks2709` |

An educator only sees **their own** classes. To see everything, use the admin
account. Pick an educator with real data rather than an empty class — the
backend `CLAUDE.md` has a query for that, or ask for the one with the most
reports.

## Viewing student reports

**Classes → the class → the student → View Report** (also `/report-detail`).
Relevant components: `pages/class/SimulationReportPage.tsx`,
`components/class/student/ReportDetailView.tsx`,
`components/class/ReportSubTable.tsx`.

**The live report/transcript views are copies of the student app's components**,
not `ReportDetailView.tsx` (which is DEAD CODE — unused). The report route
`/report-detail` → `SimulationReportPage` → **`src/student-reports/StudentReportView.tsx`**
(`variant="educator"`); the transcript route `/transcript/:id` →
`UserTranscriptPage` → **`src/student-reports/transcript/page.tsx`**
(`StudentTranscriptView`, `variant="educator"`). These are in-repo copies of the
student app's report/transcript pages, switched only by `variant` (retry count
`educator?1:10`, loading/error copy, `classNameOverride`, the extra Email Report
modal). Don't diff against `ReportDetailView.tsx`.

> **PROTOTYPE CAVEAT — reports/transcripts are NOT fully in sync with the student
> app.** The report and transcript views shown here (both **in-app** and the
> **downloaded PDF**) are point-in-time copies and **do not include all the
> updates since made to the reports in the student app.** The intended end state
> is that the educator portal shows the **exact same** report/transcript views —
> in-app AND PDF — as the **current, updated student app**.
>
> **The changes made to the LIVE student app are the source of truth** — re-sync
> these educator copies to match it; any divergence here is prototype drift, not a
> deliberate educator-specific design. See the **RWAI-3031** epic and its child
> work items (**RWAI-3035, RWAI-3030, RWAI-3032, RWAI-3033, RWAI-3034**) for the
> full details and examples of the report/transcript changes to mirror.

**Re-synced to be replicas of the student app (2026-08-28).** The educator copies
had drifted; realigned to `D:\student-app\frontend\app\reports\[id]\`:
- **Report:** primary orange `#FB6033` → brand `#db8833` (also fixed off-brand);
  hover `#D94A1F` → `#ED621F`. The **Overall Performance Score card** was rebuilt
  from a pale-peach card to the student's **bold-orange gradient**
  (`linear-gradient(279.14deg,#F28B20,#ED621F)`) with a **white inset pill** holding
  a **score-tier `Trophy`** (gold ≥95 / silver 86–94 / bronze 80–85 / none <80) +
  the `#db8833` number and an "out of 100" caption. Section headings
  (Executive Summary h2, rubric-name h3 in `rubrics-section.tsx`) → `#db8833`.
- **Transcript:** page bg `#FFF5F3` → `#f5f6f8`; title dropped the 48px dark
  "Full User Transcript" for the student's small **`text-[#db8833]` "{mode} Report
  Transcript"** (locale `fullUserTranscript` = "Report Transcript"; header meta
  labels now orange). The message list changed from **chat bubbles + avatar
  circles** to the student's **flat `divide-y` timeline** (`space-y-3` →
  `divide-y divide-gray-200`; each row `py-5 first:pt-0`, no `bubbleBg`/avatar):
  gray clock + speaker pill above the text, student turns right-aligned, SBAR box
  in `orange-*`. `speakerStyles.avatarBg/bubbleBg/color` are now unused by the
  message render (kept on the object; still used by the PDF RGB map).

The Class Management table lists each attempt with Mode (Practice/Assessment),
Score, Status, Time Spent and Completed At, plus **View Report** and
**View Transcript**.

Reports are read **live from blob storage** by the backend, not from Postgres —
so `simulation_reports` being empty is normal and not the reason a report is
missing.

## Simulation catalog, library & seats

- **The library is NOT empty by default anymore.** A new educator's library is
  auto-populated with every available sim on first load (backend
  `educator-simulations.service.ts` — removable, capped while the catalog is
  small). The old "start empty, add from catalog" mental model is stale. The
  catalog (`/simulation-catalog`) is **not scoped by the redemption code** — it
  shows every active scenario; the library inherits that same set.
- **Add Educator no longer forces seats (fixed this session).**
  `pages/educator/index.tsx` validated `tokens` as `.required().min(1)` on
  create, blocking manikin-only customers; now `min(0)` so 0 seats is allowed
  (backend already accepted zero). Defect #1 in the entitlement spec.
- **Seats deduct at assignment**, one per active student, up front, and are
  **not refunded** on removal (backend behaviour). Avatar/AI assignments charge;
  manikin ones do not.
- **Planned entitlement model.** Four products from *modality* × *audience*
  (P1–P4), seat vs hardware-key gates, seat reservation + bundles. See the spec
  "Simulation Products and Entitlement Model" and the backend `CLAUDE.md` →
  *Simulation library & entitlement model*. Phase-1 logic lives in educator-back
  `src/common/entitlement/product.ts`.

---

## UI / UX brand conventions (polish session, 2026-08-27) — verified

A large brand-consistency pass across admin/educator/schools/products. Conventions
now expected site-wide:

- **Brand palette only.** Orange `#db8833` (`primary-500`), light gray `#e9e9e9`,
  dark gray `#5f6060`, white. **"Peach" (`primary-50` / `primary-100` as a
  *background*) is banned** — replace with `#e9e9e9`. Non-brand orange `#F97316`
  (`rgba(249,115,22,…)`) is also banned; use `#db8833` / `rgba(219,136,51,…)`.
- **EXCEPTION — healthcare product-family gradient (marketing-approved).** The
  **simulation-details hero banner** (`components/simulation/Simulationdetail.tsx`)
  deliberately uses the healthcare family — teal **`#7dc7b7`** / **`#4f9096`** →
  navy **`#323464`** — as a `linear-gradient(135deg, …)` with white text, a
  `bg-black/10` legibility overlay + title `text-shadow`, white info-chip cards
  (`border-white/25 bg-white/10`) and a white CTA pill (`text-[#323464]`). This is
  the ONLY place the healthcare palette is allowed; the rest of the details page
  (section headers etc.) stays Realityworks orange. Don't "fix" this gradient as
  off-brand. **Details-page layout:** each section is its own **rounded card** via
  a shared `CollapsibleCard` (title + `ChevronDown`), **all collapsed by default**
  (`overviewOpen`/`additionalDetailsOpen`/`studentBriefingOpen`/`sbarOpen`/
  `facilitationDocsOpen` start `false`): Simulation Overview, Additional Details
  (**single-column** as of 2026-09-01 — was 2-col; `grid-cols-1`), Student
  Briefing (single-column), SBAR (single-column), Facilitation
  Documents (2-col). **No 3-column grids.** The hero **logo thumbnail + Share
  button were removed**; page bg is `#f7f8fa` so the white cards read; the rare
  `whats_new`/`simulation_privacy` blocks were dropped. **Body text bumped to
  `text-base` (2026-08-28)** across all detail cards — Simulation Overview,
  Additional Details (its `text-xs` field labels → `text-sm`), Student Briefing,
  and SBAR — for readability (was `text-sm`/`text-xs`). **Free-text values render
  as bullet points** via a shared `BulletedText` helper (splits on newlines,
  strips any leading `•/-/*`, one `<li>` per line) — **always bulleted, so even a
  single-line value gets one dot** (only a fully-empty value falls back to a
  `<p>`): applied to the Overview Learning Objective, every Student Briefing
  field, and every SBAR field. **The hero's last chip was relabeled `CATEGORY` →
  `MODALITY` and moved to the far-left (first) position, before Target Audience**
  (value still `categoryText` = derived-from-`avatarEnabled`; label is a literal
  `"Modality"`, not `t.labelCategory`).
- **Meaningful-color exceptions** (deliberate, keep them): status semantics use
  green = active/OK, yellow/amber = expiring soon/pending, red = expired/inactive
  (e.g. `ProductEntitlements` StatusPill, LMS "Ready" badge). These are the *only*
  non-brand hues allowed. **Status chips are unified** via a shared
  `components/common/StatusPill.tsx` (`tone` = success/warning/danger/neutral)
  used by the Products, Schools and Educators tables — a **light tint + dark
  same-hue text** (green-100/green-800 etc.), chosen because solid
  white-on-green/yellow fails WCAG AA for small text. Don't reintroduce the old
  solid pills (`bg-green-600 text-white`, `MetricBadge` active/pending/inactive).
- **10px font floor.** Nothing below `text-[10px]` anywhere. ™/® render as
  superscript via `components/common/Trademark.tsx#superscriptTrademarks` (glyph
  pinned to 10px).
- **Rounded, not sharp.** List containers and their orange header bars are
  `rounded-2xl` (`ListTable` header end-cells get `rounded-tl/tr-2xl`). Avoid
  square containers/bars.
- **Dropdown menus** (`ui/Select`, `ui/MultiSelect`, `ui/CustomSelect`,
  `ui/DropdownMenu`): hover/focus = `#e9e9e9` + black; selected = `#5f6060` +
  white. Never peach.
- **Active filter icon** = dark gray `#5f6060` bg + white icon.

**Filters are multi-select + searchable.** `components/ui/MultiSelect.tsx` (portal
dropdown, chips, Select all / Clear all, optional `onCreate`). `FilterPanel` gained
opt-in `multiple`/`values`/`onValuesChange`; single-select consumers are
unaffected. **`EducatorFilterState` is now arrays** (`educator_ids`, `school_ids`,
`statuses`); the schools page filter uses the same array shape. Chip keys are
composite `"<field>::<value>"`.

**TRAP — portaled dropdown search inside a `Modal` loses focus every keystroke.**
`Modal`'s focus trap (`handleFocusIn`) yanks focus back to the dialog whenever
anything outside `modalRef` is focused; a `MultiSelect`/`Select` menu is portaled
to `document.body`, so its search input kept losing focus. Fix: portal roots carry
`data-select-dropdown` and `Modal` skips focus-trapping for
`target.closest('[data-select-dropdown]')`. Keep that attribute on any new
portaled menu used in a modal.

**Inline school creation** from the Create/Edit Educator modal: `MultiSelect`
`onCreate` → modal `onCreateSchool` prop → parent dispatches
`PostSchoolRequest({ school_name, status:'ACTIVE', user_id })`, refreshes schools,
returns `{id, school_name}`.

**View School modal shows school-level usage** (avatar seats used + hardware
hours used) via a `schoolUsage` prop computed in `schools/index.tsx`
(`schoolTokenMap` aggregate + the same hardware-hours placeholder formula as the
table); gated on `hasAvatar`/`hasWorkstation`. **The Edit School "add a new
educator" form can associate products** — a `MultiSelect` of `productOptions`
(from `listProductUnits`); `onCreateEducator` now carries `productKeys`, and the
parent resolves the new educator's id by email after the invite refresh, then
`setEducatorProductAssociations` (best-effort; localStorage notes).

**School ↔ educator association is managed from the school modals** (`CreateSchoolModal`).
View mode lists associated educators read-only; edit mode adds a `MultiSelect`
(add/remove existing) plus an inline name+email form to create a new one. The
Schools table's **Educators count is a button** that opens the edit modal.
Wiring (parent `schools/index.tsx`): add = `AddEducatorSchoolRequest({educatorId,
school_id})`, remove = `RemoveEducatorSchoolRequest({educatorId, schoolId})`,
create = `InviteEducatorRequest({full_name, email, school_id, status:'ACTIVE',
tokens:0})`, then refresh with `GetEducatorByUserRequest()`. The relationship
lives on the educator (`educator.schools[]` / `school_id`), so association counts
are derived by filtering educators, not a school field.

**Entitlement-gated visibility (PROTOTYPE / PLACEHOLDER mode).**
`utils/entitlements.ts#getEntitlementFlags` returns `{ hasAvatar, hasWorkstation }`.
When `hasAvatar` is false, ALL seat/avatar-seat UI hides (table columns, the
"Remaining Avatar Seats" pills, the allocate/remove-seat fields + notes in the
educator & school modals); when `hasWorkstation` is false, all hardware-hours UI
hides. **The helper's real logic derives these from the admin's subscriptions,
but a `PROTOTYPE_SHOW_ALL = true` flag currently forces BOTH true** so avatar
seats *and* hardware hours render everywhere for UI review. The **"Hardware Hours
Used"** columns (Educators & Schools) show **deterministic placeholder numbers**
(`… / 1,500 hrs`) — hardware usage isn't tracked per school/educator yet. For the
FINAL version, set `PROTOTYPE_SHOW_ALL = false` (gating by real entitlement) and
replace the placeholder hardware numbers with real data.

**Notification Center** (`components/account/NotificationCenter.tsx`) — a fuller
manager for received notifications, rendered on the **admin Dashboard** above
Activity At-A-Glance (collapsible, minimized by default). Reuses the header-bell
store (`NotificationsRedux`: mark read/unread, delete, mark-all-read, clear-all).
Quick filters are **role-aware** (admin vs educator show different category sets
keyed to `NotificationType`), plus date-range and oldest/newest sort. The
separate `NotificationPreferences` (Account page) is the on/off + frequency
config. **`NotificationPreferences` defaults everything OFF (opt-in) as of
2026-09-02** — `isOn = prefs[key] === true` (absent = off), `toggle` flips on
`prev[key] !== true`; the **only** always-on item is the **locked Password reset
email** (`forgot_password`, both portals). Applies to admin AND educator lists.
Descriptions were rewritten to be fuller/plain-language for non-expert users, and
the admin **"Low seat warning" → "Low avatar seat warning"** (desc spells out it's
the avatar-seat pool and does NOT apply to workstation/manikin products).
Neither Account section (Profile Info, Notification Preferences) is collapsible —
that was tried and reverted. **(2026-09-03)** The **"Platform invitation"** admin
email pref was removed entirely (the invite goes to the invitee, not the admin).
Descriptions were rewritten again in plainer language; each `NotifItem` gained a
**`recurring?`** flag rendered as a **Recurring / One-time tag** next to the label,
and the card now shows a **legend** explaining the frequency options (Immediately /
Daily digest / Weekly digest) + what the tags mean.

**Educator dashboard "My Products & Usage" — active-only + per-product detail
(2026-09-03).** `pages/dashboard/educator/index.tsx`: the section shows **only
ACTIVE (non-expired) products** (`isProductActive(licensedThrough)` filter on
`listProductUnits`); label relabeled **"My Active Associated Products"**. Each
avatar card shows **"Remaining allocated seats: N"** (`seatsTotal − seatsConsumed`)
and every card shows **"Expires {date}"** (right-aligned). The **Request More
Seats** button moved up **next to each Avatar Simulations section header**
(`ProductSection` gained an `action` slot) — removed from the usage breakdown.
Expanding "My Products & Usage" now **opens every subsection at once**
(`setProductsOpen` also sets associated/usage/avatar/workstation open).
**`RequestSeatsModal`** is wider (`max-w-2xl`) and takes a **`products`** prop:
an inline `MultiSelect` picks which active avatar products, with per-product seat
inputs (+ "Currently available: N"); the total feeds `requested_seats` and a
per-product breakdown is appended to the note (no backend field).

**Class-management sim sub-table — metadata chips (2026-09-03).** `Simsubtable.tsx`
renders small catalog-style chips **under each sim title** (learner level ·
modality · difficulty · duration) via `simMetaChips(sim, meta)`. The assignment
record rarely carries this metadata, so the sub-table **fetches the library
catalog** (`fetchMyLibrarySimulations` + `selectSimulationLibraryData` from
`GetSimulationRedux`, if not already loaded) and looks the scenario up by
**`simulation_id`** into a `scenarioMetaById` map — that `meta` is preferred, the
assignment's own fields are the fallback. Each chip is omitted when its field is
empty (note `avatarEnabled` is un-backfilled locally so modality reads
"Workstation"; `duration` comes from the catalog, not the assignment).

**Avatar-seat guard on assignment (2026-09-03).** `AddSimulationModal` blocks
assigning an **avatar** sim when the educator has **no active associated avatar
products** or **insufficient remaining avatar seats** for the assignment
(needed = #avatar-sims × Σ selected-class student counts vs summed remaining seats
from active online `listProductUnits`). Shows a red `seatWarning` banner + disables
Create. (Rarely triggers locally since `avatarEnabled` is un-backfilled → no sim
reads as avatar.)

**Sidebar icons (2026-08-28).** `layout/Sidebar.tsx` now renders real
**lucide-react** glyphs in both collapsed and expanded states (previously it drew
the first letter when collapsed and text-only when expanded; the old
`public/assets/sidebar/*.svg` imports are gone). Map: Dashboard→`Home`,
Schools→`School`, Educators→`Users`, My Products→`Package`, LMS
Integration→`Plug`, Account→`CircleUser`, Class Management→`Presentation`
(blackboard), My Simulation Library→`Library`, Simulation Catalog→`BookOpen`.

**First-time setup guides (`components/onboarding/`).** A sticky gradient stepper
banner (Start · Step 1–4 · Finish) anchored at the top of the portal pages via
`layout/DashboardLayout.tsx` (mounted just inside `<main>`, above the page). Two
siblings, each returns `null` unless it applies:
- **`AdminSetupTracker`** + `hooks/useAdminSetupProgress.ts` (admin): Configure
  Account · LMS · Schools · Educators; gated on real data (active school/educator
  + LMS decision). Copy (2026-09-02): the LMS opt-out button reads **"Skip this,
  we're not doing it"** and the "Recorded: …" confirmation span was removed; the
  Create-Educator(s) step dropped its second "Associating products … is not
  required" sentence.
- **`EducatorSetupTracker`** + `hooks/useEducatorSetupProgress.ts` (educator,
  added 2026-09-01; **reordered 2026-09-03 so Configure Account is LAST**):
  **Start · Accept invitation → Step 1 Identify Associated Products (Dashboard) →
  Step 2 Add Simulations from the Catalog → Step 3 Add Your Classes → Step 4 Batch
  Assign Simulations (My Simulation Library) → Step 5 Configure Account → Finish**.
  (`index`/`label` renumbered; the `account` step object moved to the end of the
  `steps` array.) Each step's `instructions` is a **`string[]`
  of bullet lines** (rendered by a `Bullets` `<ul>` helper in the component); the
  Finish node has its own bullets (relabeled "FINISH", not "STEP 5"). Anchored to
  the educator surfaces (`/educator-dashboard`, `/classes`, `/simulationlibrary`,
  `/simulation-catalog`, `/account`); steps complete from **light-touch "visited"
  localStorage signals** (`rw_edu_setup_*_<userId>`), and Catalog/Classes ALSO
  complete from real store data (`selectSimulationLibraryData`/`selectClasses`
  length > 0). The hook is **read-only from the store — no fetches** (avoids the
  authenticated rate limit, same rule as the admin one). Role split: admin hook =
  `role !== 'educator'`, educator hook = `role === 'educator'`, so exactly one
  shows (and only on its own allowed routes). Dismiss persists per-user; the
  component clones the admin styling exactly (brand palette + `bg-gradient-btn`
  header, no LMS branch).
Icons are `aria-hidden`; the `Link`'s existing `aria-label={item.name}` +
`aria-current` carry the accessible name in both states, and the collapsed
tooltip stays. Menu items are typed `MenuItem[]` with `icon: LucideIcon`.

**Admin Dashboard — attention tile, filtered nav buttons, clickable usage rows
(2026-08-28).**
- **Usage Monitoring attention tile** sits above the product list: counts
  products "needing attention" = entries flagged `low` (final 10% of
  seats/hours) **or** `expiringSoon` (within `EXPIRING_SOON_DAYS = 60` of the
  license end date), across the entitlement-filtered editions. Both flags now
  live on the usage `Entry` (plus `code` = redeem code). Button → `/products`.
- **Usage rows are clickable** → `navigate('/products', {state:{productKey:
  code}})`. `products/index.tsx` reads `location.state.productKey` and passes it
  as `ProductEntitlements`'s new `initialSearch` prop (pre-fills the search,
  which matches on `r.u.key` = entitlement key, filtering to that product).
- **Activity Overview buttons** are now multiple per card (`ProgressCard` gained
  an `actions[]` prop alongside the legacy single `action`). Schools card:
  **View Active Schools (n)** then **View Inactive Schools (n)**; Educators card:
  **Active (n) / Pending (n) / Inactive (n)**. Each navigates with
  `state:{status}` — educators already applied it; the **schools page gained a
  `status` nav-state effect** mirroring it. Counts come from new
  `DashboardOverview` fields (`inactiveSchools`, `pendingEducators`,
  `inactiveEducators`) computed in `DashboardOverviewRedux` from the raw
  schools/educators arrays (with derived fallbacks on the dashboard).

**"Needing Attention" tiles on Schools / Educators / Products (2026-08-28,
reworked same day).** Each list page renders a compact `ProgressCard`
**in the header's empty middle band, beside the page title** (only when the
count > 0) so it adds no full-width row / extra scroll. Counts run across the
**full** dataset, independent of the current search/filter. Conventions:
- **Placement** via `PageHeader`'s new **`centerContent`** slot (Schools &
  Educators) — `order-last w-full lg:order-none lg:flex-1 lg:max-w-xl`, so it
  drops to its own row on small screens. **Products** portals its tile into the
  **page header** (between the "Products" title and *Add Entitlement Key*): the
  tile lives in `ProductEntitlements`, so `products/index.tsx` renders an empty
  slot `<div ref={setAttentionSlot} className="…empty:hidden">` and passes the
  node as the **`attentionSlot`** prop; `ProductEntitlements` `createPortal`s the
  tile there (falls back to inline render when `attentionSlot === undefined`).
  `empty:hidden` collapses the slot when nothing needs attention.
- **Caution icon** `AlertTriangle` upper-right on **all three** (was
  School/Users/Alert). **`largeActions`** prop on `ProgressCard` bumps the button
  size (`text-sm px-4 py-2`) for these page tiles only — dashboard tiles keep the
  small `text-xs px-3 py-1`.
- **Buttons apply the REGULAR filter** and **open the filter panel**
  (`setIsFilterOpen(true)`), so the selection shows in the normal filter
  fields + chips — **not** a separate "Showing:" pill. Schools
  `applyAttentionFilter` / Educators `applyEducatorAttention` set the standard
  filter state; **Products `applyProdFilter`** sets `appliedAdv`/`pendingAdv`
  (`educators:[NO_EDUCATORS_VALUE]` / `statuses:['Expiring soon']` /
  `pctRanges:['91-100']`) and clears the `attention`/`assoc` shortcut state. The
  Products "Approaching Usage Limit" count (`prodApproaching`) uses the **91–100%
  band** so it matches the `pctRanges:['91-100']` filter it applies (the old
  `isLowUnit`/`attention:'low'` shortcut is gone from the tile; `isLowUnit` still
  backs the dashboard `attention:'low'` deep-link).
- **Facets:** Schools = inactive / no educators; Educators = no school / no
  products / pending invite / **avatar product but no seats allocated**
  (2026-09-02); Products = no educators / expiring soon / approaching usage limit.
  The Educators-tile buttons are all worded **"View Educators …"** and the
  avatar-no-seats facet uses a new `AVATAR_NO_SEATS_VALUE` sentinel in the
  `productAssoc` filter (matches educators with ≥1 `kind==='online'` associated
  product whose summed `getEducatorProductAllocation` across those products is 0 —
  set `avatarNoSeatsEducatorIds`, recomputed on `notesVersion`). The sentinel is
  also an option in the Associated Products FilterPanel field + renders a chip
  ("Avatar product, no seats allocated").

**Entitlement gating now also covers Dashboard Usage Monitoring and Products.**
`ProductEntitlements` filters editions + modality chips + summary stats by
`hasAvatar`/`hasWorkstation`; the Dashboard Usage Monitoring filters its editions
the same way. (Prototype mode still shows both.)

**`ProductEntitlements`** (My Products) is a single flat, fully-sortable table
(orange header like Schools/Educators). **Column order (reordered 2026-08-28):**
Product · Associated Product (hardware) · Unit Name · **Associated Educators** ·
Usage · % Used · **Start Date · End Date** · Status · **Actions**. Classifies
real subscriptions the same way the dashboard's Usage Monitoring does; falls back
to placeholder editions when nothing classifies.

**`Modal` body scroll = `overflow-y-auto` (dropped `scrollbar-hide`).** The
brand scrollbar shows **only when content overflows**; small dialogs (e.g. the
sign-out confirm) show no scrollbar or scroll arrows. `scrollbar-gutter:stable`
reserves the gutter so content doesn't shift when it appears. (An earlier
`overflow-y-scroll` "always visible" version was wrong — it forced scroll arrows
onto every dialog; `auto` matches "visible when content extends beyond".)

**TRAP — the table renders from ONE ordered `COLUMNS` descriptor** (`{key, label,
align, width, sortable}`) that drives the `<colgroup>`, the `<thead>` sort buttons
**and** the `<tbody>` cells (via an in-component `renderCell(key, r)` switch). To
reorder/add a column, edit `COLUMNS` only — do **not** re-introduce the old split
of a `HEADERS` map + hand-written manual `<th>`/`<td>` for educators/status/
actions (that was the source of header↔body drift). `sortValFor` covers most
keys; `'educators'` still sorts specially in the row comparator (from
`notes[key].educatorIds.length`), and `'actions'` is `sortable:false`.

**% Used filter is multi-select** (`appliedAdv.pctRanges: string[]`, OR-logic
across `PCT_RANGES`), matching the other multi-select filters. Was a single
`pctRange: string`; chips are keyed `pctRanges::<value>`.

**Product rows → View/Edit Product modal + admin-local notes (2026-08-28).**
The **Entitlement Key column was removed** from the table (shown only in the
modal); **Unit** was renamed **Unit Name**; an **Actions** column (Eye/SquarePen,
like the Schools table) was added, and clicking anywhere on a row opens the modal
(action buttons `stopPropagation`). `components/myproducts/ProductDetailModal.tsx`
is a `max-w-2xl` `Modal` styled like the school/educator modals: **view** shows
all fields + associated educators with a **Back + Edit Product** footer; **edit**
lets the admin change only the **Unit Name** and **Associated Educators**
(searchable `MultiSelect`), Back + Save. Associations are **notes only — no
entitlement/seat/hours impact**; they persist in **localStorage** via
`utils/productNotes.ts` (`product_notes_v1`, keyed by entitlement key: `{unitName?,
educatorIds[]}`) since there's no backend for them. Educator options come from
`products/index.tsx` (`GetEducatorByUserRequest`). The dashboard→products
deep-links still work: `initialSearch` (row click → entitlement key) and
`initialAttention` (`expiring|low|active|expired`, with a clearable "Showing:"
chip; `isLowUnit` = final 10% of seats/hours). Product modal field order:
Product · [Associated Product] · Unit Name · Entitlement Key · Start/End ·
**Status/% Used · Usage** (status/%used sit right above usage). The table has an
**Associated Educators count column** before Actions. `ProductEntitlements`
exports `listProductUnits(subscriptions)` → `{key,label}[]` (same classification
+ placeholder fallback) so other screens can offer products as options.

**Inline edit + educators popover + unified modal on the products table
(2026-09-02).** In `ProductEntitlements`:
- **Unit Name is click-to-edit inline** — clicking the cell shows an input +
  Check/X (commit via `commitUnitEdit` → `persistNote`; Enter commits, Escape
  cancels).
- **The Associated Educators count opens a popover** — reuses the (now
  generalized) **`AssociatedProductsPopover`** for the product→educators direction:
  new optional props **`title` / `subjectLabel` / `bodyLabel` / `noteText`** (default
  to the educator→products wording); here `title="Associated Educators"`,
  `subjectLabel="Product"`, options = `educatorOptions`, values = the note's
  `educatorIds`, `onChange` → `persistNote(key,{educatorIds})`. Same inline
  MultiSelect + header Save/Cancel as everywhere else.
- **`ProductDetailModal` (View AND Edit) associated-educators now uses the same
  collapse + inline + header Save/Cancel pattern** and is **editable in view mode
  too** via a new **`onEducatorsChange`** prop (persists immediately, so no need to
  enter edit mode). The count `(#)` + read-only chip list track `selectedEducators`.
- **`persistNote(key, partial)`** merges over the existing note (saveProductNote
  OVERWRITES the whole record) so editing the unit name or educators no longer
  **wipes the `allocations`** — a latent bug in the old `handleSaveProduct`.

**Popover fits without an outer scrollbar (2026-09-02).** `MultiSelect` gained an
inline-only **`listMaxHeight`** prop (px cap on the options list). `AssociatedProductsPopover`
no longer scrolls its body — it passes `listMaxHeight = max(140, panelMaxHeight − 270)`
so **only the inner product/educator list scrolls**; it opens on whichever side
(above/below the trigger) has more room and caps to that space, so it never clips
off-screen. The header subject name **wraps** (`break-words`, was `truncate`).

**More Status relabels + badge/note cleanup (2026-09-02).**
- Filter + column labels: **Schools → "School Status"**, **Educators → "Educator
  Status"**, **Products → "Product Status"** (locale en/es + code fallbacks +
  applied-chip labels).
- The header **"Remaining Avatar Seats: N" pill was removed** from the Schools AND
  Educators pages (the aggregate admin-pool number is stale now that seats are
  per-product). `availableAvatarSeats`/`adminSeatData` stay for other uses.
- The **"Associating educators is for your own tracking …" note was removed
  everywhere** (product→educators popover, View/Edit Product modals); the popover
  hides its note box when `noteText` is empty.

**Two-step delete confirmation everywhere (2026-09-02).** New reusable
**`components/modal/TwoStepDeleteModal.tsx`** (internal `step` 1→2; step 1 = "are
you sure", step 2 = final "can't be undone" with a red confirm button; resets to
step 1 on open). Wired into the destructive actions: **educator delete**
(`educator/index.tsx`, replaced the old single-step `DeleteEducatorModal` — that
file is now unused), **school delete** (`schools/index.tsx` — `handleDeleteClick`
now opens `isDeleteOpen` instead of `modalMode:'delete'`), and **product-association
removal** (`EducatorProductsSubtable` trash → `pendingDissociate` → confirm →
`onDissociate`, previously immediate). Use this modal for any new delete/remove so
the 2-step flow stays consistent.

**`EducatorProductsSubtable` — richer inline seat editing (2026-09-02).** The
Avatar Seats Allocated cell: **0 renders as an orange-border chip** (matching the
0-educators/0-products chips); the **number is click-to-edit** (enters the same
edit mode as the Edit pencil); edit mode now has **−/+ steppers around a manual
number `<input>`** (clamped to `availableToAllocate`); the **Check/X confirm/cancel
stay in the Actions column** (required).
**Reverse association on the educator modal (2026-08-28).** The **Edit Educator**
modal lets the admin associate/dissociate products (searchable `MultiSelect` of
`listProductUnits` options); **View Educator** lists the associated products.
Wiring: `pages/educator/index.tsx` builds options from the admin's own
`getParsedUser().subscriptions`, seeds `assocProductKeys` via
`getProductKeysForEducator(id)` on open, and reconciles on change with
`setEducatorProductAssociations(id, keys, allKeys)` (both in `utils/productNotes.ts`).
Same `product_notes_v1` store, both directions.

**Associated-Products count is clickable + richer association menu (2026-09-01).**
On the admin **Educators** table the **Associated Products count is a `<button>`**
(dotted-underline when >0, orange chip when 0) that opens
**`components/modal/AssociatedProductsPopover.tsx`** — an inline popover
(portaled, `role="dialog"`, positioned under the count) containing the **SAME
associated-products `MultiSelect`** as the edit modal (searchable, option
`subLabels` = usage + expiry), so the admin **sees and edits associations inline
with no extra modal click**. `values` seed from `productKeysByEducator[id]`
(real-else-placeholder, so the selection matches the count chip); `onChange` calls
`setEducatorProductAssociations` + bumps `notesVersion` (count updates live).
Closes on outside-click / Escape / resize / **page-scroll** (scrolling inside the
panel or the MultiSelect's `[data-select-dropdown]` list is ignored); the trigger
`stopPropagation`s so it doesn't fire the row's view-modal click. **Width =
`max-w-2xl` (672px, matching the view/edit educator modals), viewport-clamped,
right-aligned to the trigger.** It **flips above/below** the trigger and caps
`maxHeight` with an internal `overflow-y-auto` body so it **never clips off-screen**.
A **header** shows "Associated Products" + the **educator name** + an **X close**;
an **"Add product"** button (opens the MultiSelect's `role="button"` trigger via a
wrapper ref) makes it obvious you can add more.

**Per-educator products subtable (2026-09-02).** Clicking an **educator row** (or
the **chevron by the name**) now **expands `components/educator/
EducatorProductsSubtable.tsx`** under it (via `ListTable renderSubRow` +
`expandedEducatorId`) — styled like the class sub-tables (dark `#5a6475` header).
One row per associated product license: **Product Name · Avatar Seats Used
(avatar only, PLACEHOLDER) · Avatar Seats Allocated (avatar only, editable) ·
Hardware Hours Used (workstation only, PLACEHOLDER) · Status** (derived from
`licensedThrough`). **All columns are sortable** (shared `SortableHeader`; values
derived once in a memo, n/a cells sort as `-1`, status by an Active<Expiring<Expired
rank). The popover header shows a larger **"Educator: {name}"** in brand orange. **Row-click no longer opens the View Educator modal — that's
now the eye action icon only** (per product owner); the Associated Products count
still opens the popover (its `stopPropagation` prevents the row expand).
**Per-avatar-product seat allocation** is edited inline here and persists to a new
**`allocations: Record<educatorId, number>`** field on each `product_notes_v1`
note (`getEducatorProductAllocation`/`setEducatorProductAllocation`/
`setEducatorProductAllocations` in `utils/productNotes.ts`); editing bumps
`notesVersion`. **Usage numbers are deterministic placeholders** (labeled in a red
note) — no per-educator-per-license usage feed exists yet. **Products are required
on create** in both `CreateEducatorModal` and the `CreateSchoolModal` add-educator
inset (which also got a **`border-2 border-primary-400`** orange outline). The
**association note** (popover + `CreateEducatorModal` + `CreateSchoolModal`) now
reads *"Associating a product informs the educator the products they have access
to use and allows for tracking of products used."* **Products are REQUIRED on
create** in `CreateEducatorModal` when the admin has products to associate
(`productsRequired = create && productOptions.length > 0`) — red asterisk on the
label + inline error + submit blocked (`productError`). The **View Educator modal's Active/Closed
Classes sections default collapsed** (`activeClassesOpen`/`closedClassesOpen` init
`false`). **Every product-association
`MultiSelect`** (Edit Educator modal + the Edit School "add a new educator" form)
now shows, per option, the **product name (label) + usage + expiry** via the
`MultiSelect` `subLabels`: `listProductUnits` gained a **`usageSummary`** field —
avatar/online → **remaining** seats out of total ("18 of 25 seats remaining"),
workstation → **used** hours out of total ("734 of 1,500 hours used") — and each
option's `subLabels = [usageSummary, "Expires {licensedThrough}"]`. The existing
`usage` field ("used / total") is unchanged (the educator dashboard parses it);
`usageSummary` is the menu-specific phrasing. `productOptions` prop types on
`CreateEducatorModal`/`CreateSchoolModal` widened to carry `subLabels`.

**Associated-Products subtable — Actions, seat steppers, confirm/cancel, license
sub-lines (2026-09-02).** Follow-ups on `EducatorProductsSubtable.tsx`:
- **Columns** are now Product Name · Avatar Seats Used · Avatar Seats Allocated ·
  Hardware Hours Used · **Expiration Date** · **Product Status** · **Actions**
  (the main Educators-table Status header was relabeled **"Educator Status"** to
  disambiguate). Under the product name an **indented license sub-line**: avatar →
  *"N seats purchased · M remaining"*; **workstation → *"N hours licensed · M
  remaining"*** (both license-level, from `p.seatsTotal/seatsConsumed` and
  `p.hoursLimit/hoursUsed` — distinct from the per-educator PLACEHOLDER used/hours
  columns).
- **Seats allocated stays read-only until the row's Edit (SquarePen) action**,
  which reveals **−/+ steppers** editing a **`draftValue`** (pending). Minus
  disabled once `draftValue <= seatsUsed`; plus disabled when the license has no
  unallocated seats left (`availableToAllocate = seatsTotal − seatsAllocatedToOtherEducators`).
  **Confirm (Check) commits** `setEducatorProductAllocation`; **X cancels/reverts**
  (nothing persists until Check). Edit is disabled for workstation rows.
- **Actions** also has a **Trash2 delete** = dissociate the product (`onDissociate`).
- **Popover association changes are ALSO confirm/cancel now** — `AssociatedProductsPopover`
  edits a **`draft`** (seeded from `values` on open); a footer **Save changes /
  Cancel** appears only when `draft` differs from the committed set (`onChange(draft)`
  commits, Cancel reverts). Same check/X pending-flow as the subtable.
- **"Add Product Association" button below the subtable** (shown only while the
  subtable is expanded, **centered**). `AssociatedProductsPopover` gained a
  **`variant?: "count" | "button"`** prop — `"button"` renders a gradient *Add
  Product Association* pill (Plus icon) instead of the count chip; it opens the
  **same** popover (same options/values/onChange/draft flow), anchored to the
  button. Wired in `educator/index.tsx` `renderSubRow` (now returns a `<>`
  fragment: subtable + the button in a `mx-3 mb-4 -mt-2 justify-center` row).
- **Educators list dropped the top-level "Avatar Seats Remaining" + "Hardware
  Hours Used" columns** (2026-09-02) — those figures now live per-license in the
  subtable, not aggregated on the row. `hasWorkstation` flag no longer used there.

**View/Edit Educator modal — per-product educator usage + cumulative total box
(2026-09-02).** `CreateEducatorModal.tsx`: each **Associated Products** box now
nests **"This educator's usage"** for that specific product — avatar → *Allocated
/ Used / Remaining*, workstation → *Hardware hours used*. Figures are deterministic
PLACEHOLDERS computed with a local `usageHash` that **matches
`EducatorProductsSubtable`'s formulas exactly** (allocated = admin-local
`getEducatorProductAllocation`; used = `hash%(allocated+1)` or `hash%20`; hours =
`100+hash%1300`) so the modal and the expanded subtable agree. The usage box was
**relabeled "Educator's Total Product Usage"** and now shows **cumulative** values
= the **sum of the per-product figures** (not the backend `totalTokens/tokensUsed/
remainingTokens` it used before), so the total equals the sum of the nested boxes;
a `text-[10px]` placeholder caption is appended.

**Per-avatar-product seat inputs in the Edit-School add-educator inset
(2026-09-02).** The single "Allocate Avatar Seats" field was replaced by **one
seat input per SELECTED avatar product** (seats are per-avatar-product). Requires
the product **`kind`** in the form options, so `productOptions` on
`CreateSchoolModal` widened to `{value,label,subLabels?,kind?}` and
`schools/index.tsx` now maps `kind: u.kind`. State moved from `newEducatorSeats:
string` to **`newEducatorAllocations: Record<key,string>`**; `selectedAvatarProducts`
= selected options with `kind==='online'`. `onCreateEducator` payload gained
**`allocations: Record<key, number>`** (plus `seats` = their sum, for the invite
`tokens`); `handleCreateEducatorForSchool` persists each via
`setEducatorProductAllocation(newEducatorId, key, seats)` after resolving the new
educator by email. **(2026-09-02)** The inset's products field was relabeled
**"Active Associated Products (#)"** and its MultiSelect collapsed behind an
**"Add / Edit Associated Products"** button (mirroring the educator modal):
`showProductSelector` + a `productSnapshot` for Cancel-revert; check collapses
(keep), X reverts to the snapshot + collapses. The per-avatar-product seat inputs
stay visible below as the seat-allocation list. **Polish (2026-09-02):** the
Save/Cancel buttons moved into the **header row** (right of the label, replacing
the Add/Edit button while open) so the portaled MultiSelect dropdown no longer
covers them; **"ADD A NEW EDUCATOR" is now orange** (`text-primary-500`); all inset
field labels bumped `text-xs text-gray-600` → **`text-sm text-gray-700`** to match
the School Name/Status `FormField` labels; each avatar-product seat row is now a
**half-width input + right-half "Avatar seats available: N"** specific to that
product (the single bottom aggregate line was removed). Per-product available =
`seatsTotal − seatsConsumed`, threaded as a new **`availableSeats`** field on
`CreateSchoolModal`'s `productOptions` (mapped in `schools/index.tsx`). The unused
`availableAvatarSeats` prop is no longer destructured (kept on the type).

**Expired products fall off + Edit-Educator association confirm/cancel + inline
seat editing (2026-09-02).** `CreateEducatorModal.tsx` + `educator/index.tsx`:
- **Only ACTIVE (non-expired) products are surfaced** for an educator everywhere
  (count, subtable, popover, view/edit modal). `educator/index.tsx` computes
  `activeProductKeySet` (product's `licensedThrough` in the future or unset) +
  `activeProductUnits`; `productOptions`, `productKeysByEducator`,
  `associatedProductDetails`, and the `openModal` `assocProductKeys` seed are all
  filtered to it. Expired keys are hidden from display but **NOT deleted** from
  `product_notes_v1` (reconcile uses active-only `allKeys`, so expired
  memberships are left untouched).
- The **field label is now "Active Associated Products (#)"** (view + edit).
- **EDIT-mode selector is collapsed behind an "Add / Edit Associated Products"
  button** (2026-09-02) — `showProductSelector` state (false by default, reset on
  open/save via the reseed effect). Clicking reveals the MultiSelect (editing a
  modal **`draftProductKeys`**, seeded from `associatedProductKeys`) with a
  lower-right **check (Save) / X (Cancel)** row: **Save** persists (`onAssociated
  ProductsChange(draft)` when dirty) **and collapses**; **Cancel** reverts the
  draft and collapses. When collapsed, only the label + count + button + the clean
  saved list show. CREATE mode always shows the selector (live `onChange`, no draft).
- **The general "Add Avatar Seats" / "Remove Avatar Seats" fields were REMOVED
  from EDIT mode** (2026-09-02) — avatar seats are allocated **per specific
  product** in the clean list's steppers now, so the un-product-specific
  add/remove was redundant. `removeSeatsInput`/`setRemoveSeatsInput` are no longer
  destructured in the modal (kept on the prop type so the parent still compiles).
- **CREATE mode also allocates seats per avatar product** (2026-09-02, matching
  the Edit-School inset): the single "Allocate Avatar Seats" field was replaced by
  **one input per SELECTED avatar product** (`selectedAvatarProductsCreate` =
  options with `kind==='online'` that are selected; needs `kind` on the modal's
  `productOptions` prop). Modal state `createAllocations: Record<key,string>`; an
  effect syncs the sum to `formik.tokens` (invite total) + calls new prop
  **`onCreateAllocationsChange(Record<key,number>)`** (counting only selected
  avatar keys, so deselecting drops seats). Parent (`educator/index.tsx`) holds
  `createAllocations` state, resets it in `handleAddEducator`, and after resolving
  the new educator by email persists each via `setEducatorProductAllocation`.
  The per-product inputs only appear once an avatar product is selected.
- After saving, a **clean list of the committed products** renders below the
  MultiSelect (EDIT mode) — a shared `renderProductBox(p, editable)` used by both
  view (read-only) and edit (editable). Avatar boxes show **Allocated / Used /
  Remaining**; editable ones get an **edit pencil → −/+ steppers + Check/X**
  (same seat-limit math + placeholders as `EducatorProductsSubtable`, via a local
  `usageHash` + `totalAllocatedForKey`). Persists with
  `setEducatorProductAllocation`; new **`onProductNotesChange`** prop bumps the
  parent `notesVersion` so the table count/subtable refresh. `associatedProductDetails`
  prop widened with `seatsTotal?/seatsConsumed?` for the stepper bounds.

**One consistent products/seats pattern across ALL these modals (2026-09-02).** The
associated-products selector + seat allocation now behave identically in the Edit
Educator modal, **Create Educator modal**, the Edit-School add-educator inset, and
the `AssociatedProductsPopover`:
- **Selector collapsed behind an "Add / Edit Associated Products" button**; opening
  reveals the MultiSelect. **Save changes (✓) / Cancel (✗) live in the header row**
  (next to the label / X-close), NOT below the input — so the portaled dropdown can
  never hide them (was the reported bug: clicking out discarded edits with no
  visible Save). Save commits (`onChange`/`onAssociatedProductsChange(draft)`) + collapses;
  Cancel reverts the draft. Create Educator now uses the SAME `draftProductKeys` +
  header Save/Cancel as Edit (was: always-open live selector).
- **The revealed selector uses `MultiSelect`'s new `inline` prop (2026-09-02)** —
  renders the **search + checkbox list directly inline** (always open, no chip
  trigger, no portal), so the selection shows **once** (as checked rows) instead of
  duplicated in a chips box + dropdown, and nothing overlays the Save/Cancel. `inline`
  is opt-in on the shared `components/ui/MultiSelect.tsx` (default behavior
  unchanged); applied to all three product selectors + the `AssociatedProductsPopover`
  (whose now-redundant "Add product" button + `openProductSelect`/`selectWrapRef` were
  removed). Inline mode skips `autoFocus` on the search box.
- **Avatar seat rows**: note **first** (under the "Allocate Avatar Seats" /
  "Saved products & seat allocation" label), then per avatar product a **half-width
  input + right-half "Avatar seats available: N"** specific to that product.
  Per-product available = `seatsTotal − seatsConsumed`, threaded as **`availableSeats`**
  on the modal `productOptions` (mapped in `educator/index.tsx` + `schools/index.tsx`).
  The old single aggregate "Remaining/Avatar Seats Available" line + `adminAvailableSeats`
  usage were dropped (`adminAvailableSeats` no longer destructured in
  `CreateEducatorModal`).

**Schools table 0-educators chip + View-School "Add Educator" (2026-09-02).**
Clicking a school's **Educators count when it's 0** now opens the Edit School modal
with the inline **"Add a new educator" form auto-expanded** (`handleAddEducatorForSchoolModal`
sets edit mode + `addEducatorOnOpen`); a count **> 0** still opens View School. New
`CreateSchoolModal` props **`autoOpenAddEducator`** (an effect sets `showAddEducator`
to it, keyed on `[autoOpenAddEducator, selectedSchool.id, modalMode]` so it resets per
open) and **`onAddEducatorFromView`** (a **"Add Educator"** button in the View-School
"Associated Educators (#)" header → parent switches to edit + auto-opens the form).

**Hardware hours shown as total-used only; school Avatar-Seats-Remaining removed
(2026-08-28).** Hardware hours are shared, not allocated per school/educator, so
both list tables show **"N hrs"** (not "used / cap"). The **Schools table dropped
its Avatar Seats Remaining column** (seats are allocated to educators, not
schools; Avatar Seats Used — the aggregate — stays). The **View Educator modal's
Associated Products** now show per-product usage: online-avatar products show
"X / Y avatar seats used", workstation products show "X / Y hardware hours used",
plus a **"Licensed through {date}"** line per product (`listProductUnits` returns
`{key,label,kind,usage,licensedThrough}` — `licensedThrough` = `fmtDate(validThrough)`;
passed as `associatedProductDetails`). **No roll-up total** — a per-kind roll-up
summary was tried in the modal and a roll-up subline on the Educators table, but
**both were removed per the product owner**; the modal lists per-product usage
only and the Educators table shows just the associated-product **count**.

**Educator's Product Usage box (2026-08-28).** The educator modal's usage box
(both view & edit) is titled **"Educator's Product Usage"** (mirrors the View
School modal's **"School's Product Usage"**) and is **gated on the KINDS of
associated products**, not the entitlement flag: `hasAvatarProduct` (any
`kind==='online'` in `associatedProductDetails`) shows **Avatar seats allocated /
used / remaining** (`totalTokens`/`tokensUsed`/`remainingTokens`);
`hasHardwareProduct` (any `kind==='workstation'`) shows **Hardware hours used**
(deterministic placeholder `120 + tokensUsed%1300`, same as the Educators table —
hardware hours aren't tracked per educator yet); both kinds → both sets. The whole
box hides when the educator has no associated products. Rendered from one shared
`productUsageBox` const used in both modes (replaced the old two separate
"Educator's Avatar Seats" boxes; the view-mode "Remaining" is no longer a
click-to-edit link — use the footer Edit button). Layout is `flex flex-wrap` with
each stat `flex-1 min-w-[90px]`; built from a `usageStats[]` array where **each
label reserves two lines (`min-h-[2.25rem]`)** so every value sits on the SAME row
even when some labels wrap and others don't (keep this when adding stat boxes —
numbers must stay row-aligned).

**Collapsible classes (2026-08-28).** Both the educator modal's **Active Classes**
and **Closed Classes** section
headers are toggle buttons (`activeClassesOpen`/`closedClassesOpen` state,
`ChevronDown` that `-rotate-90`s when collapsed) that expand/collapse each list.
**Closed classes now match the active-class row format** — name · **N inactive
students** (`getInactiveStudentCount` = roster entries with status ≠ ACTIVE, 0
when the roster isn't populated) · N sims attempted (previously they showed only
sims attempted).

**Educators table shows Associated Products, not Avatar Seats Used (2026-08-28).**
The list table's **"Avatar Seats Used" column was replaced by "Associated
Products"** (always-on, not avatar-gated; Avatar Seats Remaining stays under
`hasAvatar`). Count comes from a `productCountByEducator` map (reverse of
`product_notes_v1`, memoized on a `notesVersion` bumped when associations change),
rendered with the **orange chip border when zero**. Seat usage still shows in the
view/edit educator modals. The educator filter gained an **Associated Products**
facet — `EducatorFilterState.productAssoc?: string[]` with buckets `none` (0) /
`one` (1) / `many` (2+), applied via `productAssocBucket()`.

**Dashboard product tile buttons** (order): View Active · Approaching Limit ·
Expiring Soon · **Expired** (new `attention:'expired'` filter). The **Product
Health** tile is **positively oriented** to match the other ProgressCards —
value/bar/subtext show products that **do NOT need attention** out of active
(`active - attention`), so a fuller bar = healthier; the buttons still drill into
the negative facets. Usage Monitoring
is a **3-column layout** (Product · **Associated Educators** header, centered ·
Amount Used) — each row shows the associated-educator count (from
`product_notes_v1` by entitlement code) in its own centered column, with the
**orange chip border when zero**. A second **Educator Coverage** tile sits beside
Product Health (grid) showing active products with associated educators; its
buttons **Manage Unassigned / Assigned Products** deep-link with
`state:{assoc:'none'|'some'}`. **Usage Monitoring rows wrap, not truncate** — the
product/unit label span is `flex-1 min-w-0 break-words` (was `truncate`) with the
row `items-start`, so on narrow widths the "Licensed Unit · KEY · …" text wraps
and stays visible instead of clipping to an ellipsis.

**Active-products only across the Usage-Monitoring surfaces (2026-09-02).** The
Usage-Monitoring **table hides expired units** (each `Entry` carries `expired`;
the render filters `e.entries.filter(!expired)` and drops editions with no active
entries) and its header reads **"Active Product"**. The **Product Health** and
**Product Associations** tiles now count over **active (non-expired) products
only**: `productStats.expiring/low/attention` derive from `activeEntries` (not the
full set; `expired` stays a full-set count for its own button), and
`coverageStats.allWith/allWithout` derive from `active` too. Copy gained "Active":
"N / M **active** products …", "View **Active** Products Approaching Limit /
Expiring Soon", "Manage All/Associated/Unassociated **Active** Products", and "% of
**active** products have no associated educators". The **View Expired Products**
button is unchanged (still counts expired).

**Tan `#f2efe9` retired in favour of brand `#e9e9e9`** (row hover/selected
states): admin dashboard Usage-Monitoring rows, `ProductEntitlements` table row
hover, and `NotificationCenter` selected-row all now use `#e9e9e9` (the tan was a
non-brand color). Don't reintroduce `#f2efe9`.

**Notifications de-peached + brand-orange dots (2026-09-01, admin + educator).**
Both shared notification surfaces — the header **`layout/NotificationPanel.tsx`**
dropdown and the dashboard **`account/NotificationCenter.tsx`** — had a peach
unread-row tint: panel `bg-primary-50/50`, center `bg-[#faf9f7]` → both now
`bg-[#e9e9e9]/60`. The panel's per-type **unread dots** (previously a rainbow —
cyan/indigo/green/purple/emerald/rose) are now **`bg-primary-500`** brand orange
in `TYPE_CONFIG`; the ONLY kept non-brand dots are the **semantic warning yellows**
(low-seat warnings) and neutral gray `GENERAL`. `NotificationCenter` dots were
already `bg-primary-500`. Both components render in admin AND educator portals, so
the change is consistent across both.

**Educator-portal parity (2026-08-28).** Reviewed the educator dashboard
(`pages/dashboard/educator/index.tsx`) against the admin changes. It has **no
chart / timeframe-dropdown / export / ProgressCard / activity-tile surfaces**, so
most admin dashboard changes have no educator equivalent. The one shared
inconsistency fixed: **`components/dashboard/MetricsCard.tsx`** (educator metric
cards) used peach `bg-primary-50` behind its icon + `border-primary-100`; both
swapped to brand (`bg-[#e9e9e9]` icon circle, `border-gray-100`) to match the
admin "no peach behind icons" pass. Shared components (`NotificationCenter`,
`NotificationPreferences`, `ConfirmationModal`) update both portals at once.

**Products filters (2026-08-28).** `ProductEntitlements` FilterPanel gained
**Associated Educators** (multi-select, from `educatorOptions`) and **% Used**
(single-select range: 0–10 / 11–50 / 50–90 / 91–100, via `PCT_RANGES` +
`pctNumber`). Both are in `appliedAdv` (`educators[]`, `pctRange`) with chips.
Plus an `initialAssoc` prop (`none|some`) — the association-presence filter used
by the dashboard coverage buttons, shown as a clearable "Showing:" chip like
`initialAttention`.

**Table sortability, action tooltips + Educators inline actions (2026-08-28).**
Every list column is now sortable. Derived columns that aren't on the row object
sort in-component: **Products → Associated Educators** (`onSort('educators')`,
special-cased in the row comparator via the notes count); **Educators →
Associated Products / Hardware Hours** (`SortableEducatorField` gained
`associatedProducts`/`hardwareHours`; `filteredEducators` sorts them itself, else
`sortEducators`); **Schools → Hardware Hours Used** (`School.hardwareHoursUsed`
derived in `filteredSchools` + added to `numericFields`). Action buttons across
all three tables carry `title` (hover) + `aria-label` (keyboard/AT) + focus-visible
rings. The **Educators Actions changed from a 3-dot dropdown to inline icons**
matching Schools/Products: `Eye` view · `SquarePen` edit · `ArrowLeftRight`
**Transfer classes** · `Send` resend (pending only) · `Trash2` delete
(actionColWidth widened to `minmax(170px,210px)`; DropdownMenu import removed).
`MultiSelect.handleCreate` now closes its portal dropdown + clears search after
`onCreate` (fixes the lingering "remnant box" over the inline add-educator form).
`ProgressCard` dropped `justify-between` (uses `mt-auto` on actions) so
side-by-side tiles' value rows + progress bars align; `tallValue` reserves two
value lines on the Product Health / Product Associations tiles.

**Bottom Add buttons (2026-08-28).** Schools and Educators pages repeat their
**Add School / Add Educator** button below the table (`handleAddSchool` /
`handleAddEducator`) so users needn't scroll back to the header. **The Class
Management page (`pages/class/index.tsx`) does the same** — a centered **Add
Class** button below the table; both it and the header button call the shared
`handleAddClass()`.

**Class Management "Classes Needing Attention" tile (2026-08-28).** The
educator-portal Class Management page now renders the dashboard's **Classes
Needing Attention** `ProgressCard` in the `PageHeader`'s **`centerContent`** slot
(only when the count > 0), mirroring the admin Educators/Schools "needing
attention" tiles. Count runs across the **full** class list (independent of the
current search/tab/filter): `classAttention` buckets = **no active students**
(`getActiveStudentCount === 0`) / **no assigned sims** (`sims.length === 0`) /
**unread reports** (`needAttentionByClassId[id] > 0`); the metric is the Set-union
`needing.size`. The upper-right icon is the **non-clickable `AlertTriangle`**
caution glyph (pass `icon` WITHOUT `onIconClick` → `ProgressCard` renders a plain
icon, not a button) — NOT the dashboard card's clickable `Presentation` icon.
Buttons filter the table **in-place** via the existing `idFilter` "Showing:" chip
(`applyAttentionFilter(list, label)` sets `activeTab='all'` + `idFilter`); **View
All Classes** clears the chip (`setIdFilter(null)`).

**Class Management status quick-filter tabs REMOVED (2026-08-28).** The
`StatusTabs` row (All / Active / Need Attention / Draft / Archived) is gone from
`pages/class/index.tsx` — status filtering now lives only in the FilterPanel
(`classStatusOptions`). `activeTab` state stays (typed `ClassTabKey`, still
imported type-only from `StatusTabs`) and is pinned to `'all'`; the deep-link and
attention-tile helpers still call `setActiveTab('all')`. Dropped along with it:
the `classTabs` memo, the `selectNeedAttentionCount` selector, and the default
`StatusTabs` import + `ClassStatusTab` type. (The `StatusTabs` component file is
untouched — other consumers, if any, are unaffected.)

**Roster import REMOVED from the Create Class modal (2026-08-28).**
`components/class/Classformmodal.tsx` no longer offers **Import Roster** — the
Students field is now a single **Enter Number** manual count input (create mode
only). `studentMode` is narrowed to `'manual' | null` and driven by the input
(non-empty → `'manual'`, empty → `null`); the CSV/Excel file picker,
`handleFileChange`, `handleStudentModeChange`, `fileInputRef`, `selectedFile`,
`fileError`, and the `CustomRadio` import were all removed. The parent
`onSubmit(values, studentMode, file, setFileError)` signature is unchanged — the
modal now passes `null` for the file and a no-op `setFileError`, so the parent's
now-dead `'import'` branch never runs.

**Filter UX consistency across list pages (2026-08-28).** Educators / Schools /
Products all: applied-filter chips render **below** the filter panel (shared
`FilterChips`, `text-sm`; Products' inline `advChips` bumped to match), the panel
**auto-closes on Apply** (`setIsFilterOpen(false)`), and the presence/relationship
filters show the **real entity list plus a sentinel "No associated …" option**
rather than none/one/many descriptors: Schools "Associated Educators" =
`__no_educators__` + educator names; Educators "School" = `__no_schools__` +
school names; Educators "Associated Products" = `__no_products__` + product names
(from `listProductUnits`, backed by `productKeysByEducator`); Products "Associated
Educators" = `__no_educators__` + educator names. The `__no_*__` sentinels match
rows with a zero count; select them alongside real values (OR logic). Educator
count/keys come from `productKeysByEducator` (real notes else placeholder).
`MultiSelect` chips are `text-sm px-3 py-1`; modal helper notes are `text-xs`
(never below the 10px floor) for readability.

**Buttons, icon-hover, filters, misc (2026-08-28).**
- **Modal primary buttons use the gradient** (`bg-gradient-btn text-white
  hover:opacity-90`, matching `Button variant="gradient"`) — not solid
  `bg-primary-500`. Applied across CreateSchoolModal / CreateEducatorModal /
  ProductDetailModal footers + inline actions.
- **Educator-portal action buttons → gradient (2026-08-28).** Prominent
  educator-facing buttons that were solid `bg-primary-500 hover:bg-primary-600`
  now use **`variant="gradient"`** (keeps the default `h-10` size — these Buttons
  set no `size`, so the gradient variant's `h-[48px]` is overridden by the
  default size; only `size="lg"` gets the tall pill). Converted: educator
  dashboard **Request More Seats** + **Manage Classes**, Account **Request More
  Seats** (Change Password / Edit Profile were already gradient), **RequestSeatsModal**
  submit, and the three **ClassCard** buttons (Manage Student / Manage Sims / View
  Reports). Still solid on purpose: the small catalog "Add" **pills**
  (AllSimItems / LevelItems / FavouriteSimulations / UnitList / ViewAll*) and
  filter chips — they read as chips, not primary actions; convert only if asked.
- **Modal info notes share ONE style** (the gray-tinted, orange-text helper boxes
  under fields): **`text-sm text-primary-700 bg-[#e9e9e9] rounded-md px-3 py-2`** —
  regular weight (no `font-medium`), identical padding. **`text-sm` (14px), bumped
  from `text-xs` for accessibility.** Used in CreateEducatorModal (×2),
  CreateSchoolModal (×2), ProductDetailModal. Keep any new modal note on this exact
  class so size/weight/color/padding stay consistent.
- **Clickable-icon hover = brand light gray `#e9e9e9`, never peach** — all
  `hover:bg-primary-50` on icon buttons was swept to `hover:bg-[#e9e9e9]`
  site-wide (peach `primary-50/100` bg stays banned). Icon buttons themselves
  have **no resting background**.
- **Schools "Associated Educators" filter lists educator NAMES** (multi-select,
  `educatorIds`; a school matches if any selected educator is associated via
  `school_id`/`schools[]`). The none/one/many *presence* bucket (`educatorAssoc`)
  still exists but only as the dashboard "with/without educators" nav filter, not
  a visible field.
- **Edit School add-educator form requires name + a valid email** (same regex as
  the Create Educator Yup `.email()`), with an inline error + disabled Add.
- Educator edit-mode **Avatar Seats** block + View School **Product Usage** use
  the same centered label-over-value grid. View School's associated-educator rows
  put classes/students in a right stacked column at `text-sm`.

**Global brand scrollbars (2026-08-28).** `index.css` has a site-wide `*`
scrollbar rule: orange (`#db8833`) thumb, transparent track, with a 3px
transparent border + `background-clip:padding-box` that **insets the thumb** so
it never overhangs a (rounded) container edge. The old per-component
`[&::-webkit-scrollbar*]` overrides were stripped from Modal / MultiSelect /
Select / NotificationCenter / the modals so they inherit this. Don't re-add
custom scrollbar colors — rely on the global rule.

**Dashboard layout (2026-08-28).** **Activity this week** stays a section INSIDE
the Activity Overview card (2×2 number-tile grid, below the ProgressCards — do
NOT hoist it above the grid). Each of its four tiles now has a left icon
(`Presentation` classes · `GraduationCap` students · `ClipboardList` assignments ·
`CheckCircle2` "Attempted Simulations This Week") — **plain orange icon, no peach
`bg-primary-50` behind it** (banned). **Narrow-tile behaviour is a CONTAINER
QUERY, not a viewport breakpoint** — the tiles can be narrow even on a wide screen
because the 2-col dashboard makes the Activity card narrow, so a `sm:`/`md:` media
query is the wrong tool. The tile grid is `[container-type:inline-size]`; when it
is `≤360px` wide, `index.css` `@container` rules give each `.week-tile`
`flex-direction:column; text-align:center` and **hide the `.week-tile-icon`**, so
the number + label take the full width and center instead of wrapping beside the
icon. Above that the tile stays an icon-left row. Number is `text-xl sm:text-2xl`;
tile is `overflow-hidden`. (No Tailwind container-query plugin here — the
`@container` rule is hand-written in `index.css`.) A **Schools with Educators**
`ProgressCard` sits between Schools Active and Educators (metric = active schools
with ≥1 associated educator / active schools; buttons deep-link `/schools` with
`state:{status:'ACTIVE',educatorAssoc:'with'|'without'}`, which the schools status
effect maps to the `educatorAssoc` bucket filter). `ProgressCard` gained a second
icon slot (`icon2`/`onIcon2Click`) for the School+Users pairing. Count comes from
`DashboardOverview.schoolsWithEducators` (computed in the thunk from real
`school_id`/`schools[]`). **Sim chart controls:** timeframe dropdown moved first
(left) so the toggles/exports stay put; tiny PNG/PDF/CSV image icons replaced with
readable `Download`+label buttons; chart container got `overflow-hidden` to kill
the phantom scroll space.

**Schools filter — Associated Educators bucket** (none/one/many) sits between the
School and Status filters (`educatorAssocBucket` on `educatorCount`). The
educators-table **Associated Products count** uses deterministic placeholder
associations for UI review (`placeholderProductKeys`, ~1-in-4 get 0 to keep the
orange no-products chip) when no real localStorage association exists.

**Notifications UI + deep-links (2026-08-28).** Bell icon precedes the title in
both the header **NotificationPanel** dropdown and the dashboard
**NotificationCenter**. Both gained a **Settings gear** → `navigate('/account',
{state:{scrollTo:'notification-preferences'}})`; the Account page scrolls
`#notification-preferences` to the top (its section carries that id + `scroll-mt`,
and a `Settings` icon precedes its heading). The dropdown also has a **Go to
Notification Center** footer button → the user's dashboard with
`state:{scrollTo:'notification-center'}`. **NotificationCenter now renders on BOTH
dashboards** — admin (`role="admin"`) and educator (`role="educator"`, added
2026-08-28) — each with the scroll-to effect on `#notification-center`. The
NotificationCenter header settings icon is a `role="button"` span (the header is
itself a `<button>`, so no nested buttons). **Account → Profile Information**:
the Edit Profile button moved up into the avatar row (right-aligned), dropping the
tall `my-10` bottom block to shorten the section.

**NOT DONE — "associated educators pre-populate the educator's library as
favorites" is backend-blocked.** Investigated 2026-08-28: (1) "favorite" =
`SectionItem.myFavorite` = "in my library"; the add endpoints
(`educator-simulations/add-to-library[-bulk]`) act **only on the authenticated
user** — there is NO admin-acting-for-educator route, so an admin can't populate
another educator's library. (2) There is **no reliable edition→simulation map**:
sims carry no audience/modality enum (`avatarEnabled` is un-backfilled — all
false locally; audience is only heuristic name-parsing on *products*). So this
needs backend work: an admin bulk-add-for-educator route **and** a unit/scenario→
edition classification (or a catalog query param). The product↔educator
association built here is the prerequisite/notes layer; it does not touch any
library today.
**UPDATE 2026-08-28 (per product owner):** the edition→sim mapping IS possible
from existing fields — `learnerLevel` = audience (Secondary vs Post-Secondary),
`avatarEnabled` = modality (true → online avatar, false → workstation). So the
online-avatar edition→sim selection is doable client-side (once `avatarEnabled`
is backfilled — currently all false locally). Remaining blockers: (1) **still no
admin-acting-for-educator library endpoint** (the real gate), and (2) mapping a
workstation product to its specific **manikin/simulator** needs more fields that
don't exist yet.

**Row-click → View modal, then View → Edit (Schools + Educators, 2026-08-28).**
`ListTable` gained an opt-in `onRowClick(row)` prop — wired only on the data
cells (not the Actions cell), so the eye/edit/trash icons and the three-dot
menu keep firing only their own handlers. Any interactive element *inside* a
data cell must `e.stopPropagation()` so it doesn't also trigger the row click
(done for the Schools **Educators-count** button and the Educators
**SchoolsPopup `+N`** button). Both list pages pass
`onRowClick={(row) => …view…}`.
- **Schools:** clicking a row (or the Educators-count value) opens **View
  School**. `CreateSchoolModal` view footer now has **Back + Edit School**
  (`onEditFromView` → parent `handleEditSchool(selectedSchool)`), and each
  associated-educator row is a button (`onEducatorClick`) that navigates to
  `/educators` with `state:{ viewEducatorId }`.
- **Educators:** clicking a row opens **View Educator** (`openModal(row,
  "view")`). `CreateEducatorModal` view footer has **Back + Edit Educator**
  (`onEditFromView` → `openModal(selectedEducator, "edit")`), and view mode
  shows an **Avatar Seats** summary (Allocated `totalTokens` / Used `tokensUsed`
  / Remaining `remainingTokens`), gated on `hasAvatar`.
- **Deep-link:** the educators page reads `location.state.viewEducatorId` in a
  once-guarded effect (placed *after* `openModal` so it's in scope), waits for
  `allEducators` to contain the id, opens the view modal, then clears nav state
  via `navigate(replace, {state:{}})`. This uses a **distinct** key from the
  existing `educatorId` deep-link (which only filters/highlights) so the two
  don't collide. The schools page has the mirror: `location.state.viewSchoolId`
  → opens View School (distinct from `schoolId`, which only filters).

**Class/seat detail in the view modals + cross-navigation (2026-08-28).**
- **Modal width:** `CreateSchoolModal` and `CreateEducatorModal` both pass
  `className="max-w-2xl"` to `Modal` (default is `max-w-md`; tailwind-merge lets
  the override win) — kept identical so all these modals match. The small
  delete-confirm dialog stays default width. `MultiSelect` gained an opt-in
  `chipClassName` (school edit modal uses `text-sm px-3 py-1` for bigger chips).
- **Class metrics** come from `GetEducatorClassesRequest(educatorId)` →
  `/api/class-transfers/educator/{id}/classes` (returns full `Class[]`, the same
  slice Transfer Class uses). Helpers live in `utils/classUtils.ts`:
  `isActiveClass`/`isClosedClass` (via `getEffectiveClassStatus`; **closed =
  ARCHIEVED or INACTIVE/ended**), `getActiveStudentCount` (roster filtered by
  ACTIVE status, falls back to `total_no_of_students`), `getSimsAttempted`
  (`reportCount ?? reports.length ?? Σ student.attempt`). **Caveat:** the
  class-transfers endpoint may not populate `reports`/`reportCount`, so
  sims-attempted can read low/0 without a per-class report fetch or a backend
  change — see the data-model notes.
- **View Educator modal** fetches the educator's classes on open (`openModal`
  view branch dispatches clear + request), then `CreateEducatorModal` renders
  **Active Classes** (name · active students · sims attempted) and **Closed
  Classes** (name · sims attempted). The **School chips are clickable**
  (`onSchoolClick` → navigate `/schools` with `viewSchoolId`), and the
  **Remaining** avatar-seats number is a button → `onEditFromView` (opens edit).
- **View School modal** fetches classes for **every** associated educator in a
  `Promise.all` batch (one request per educator — no bulk endpoint) when the
  view modal opens, aggregating `{activeClasses, activeStudents}` into a state
  map passed as `educatorClassCounts`; each educator row shows
  "N active classes · M active students" under the name/email.

**Educator dashboard — two-column admin-style layout (2026-08-28, current).**
`pages/dashboard/educator/index.tsx` is a **`lg:grid-cols-3`** layout below the
sticky header + NotificationCenter (the old 4 header metric tiles + `MetricsSummary`
are GONE). Many pieces are independently collapsible (each its own `React.useState`
+ `ChevronDown`). There is **no educator My Products page** (Sidebar entry
commented out in `educatorMenuItems` + `trialMenuItems`; `/products` is admin-only)
and **no links to `/products`** anywhere on the educator side.
- **LEFT column (`lg:col-span-1`, ~1/3):** a collapsible **"Alerts & Activity
  Overview"** card (`alertsOverviewOpen`) with two subsections:
  - **Activity Overview** — a 2-col grid of **two explicit column stacks**
    (`classActivityTiles` LEFT, `otherActivityTiles` RIGHT — kept as separate
    stacks so columns stay grouped with unequal counts; each tile is an
    `ActivityTileCard`, `.week-tile` container-query classes). LEFT (class-specific):
    Active Classes · Classes with Unread Reports · Classes Closing (14 Days). RIGHT:
    Active Students · Total Unread Reports · Classes w/ Students Near Avatar Limit.
    (Removed per the product owner: Classes with Sims Due 7d, Sim Assignments Due
    7d, Unread Reports Last 7 Days, Sims Completed This Week.) **Every tile except
    Active Students is clickable** → `goToClasses(list, label)` navigates to
    `/classes` with **`state:{filterClassIds, filterLabel}`** (Active Classes = all
    active ids; both unread tiles = `attention.unread`; Closing = `attention.closingSoon`;
    Near-Avatar-Limit = a deterministic placeholder subset `nearAvatarLimitClasses`).
    `ActivityTileCard` renders as a `<button>` when `onClick` is set. **Class page
    side:** `pages/class/index.tsx` reads `location.state.filterClassIds` into an
    `idFilter` state, restricts `filteredClasses` to those ids, shows a clearable
    **"Showing: {label} (n)"** `#5f6060` chip, and strips the nav-state on mount.
  - **Alerts** — the **Classes Needing Attention** `ProgressCard`: metric =
    **# of DISTINCT classes** with any issue (`classesNeedingAttentionCount`, a
    Set-union of noStudents/noSims/unread ids); class icon (`Presentation`,
    clickable → `/classes`); buttons **View All Classes (n)** · View Classes with
    Unread Reports / No Students / No Assigned Sims. (The former "Upcoming & Usage
    Limits" card was dissolved into the Activity Overview due/closing tiles.)
  - Then the multi-school card (only when `getParsedUser().schools.length > 1`).
- **RIGHT column (`lg:col-span-2`, ~2/3):** a collapsible **"My Products & Usage"**
  card (`productsOpen`, no count in the header) with two collapsible subsections:
  - **My Associated Products (n)** (`associatedProductsOpen`; count stays visible
    when collapsed) — a **matrix**: audience columns (Secondary Education Edition |
    Post-Secondary, via `productAudience(label)` = `/post[-\s]?secondary/`) × three
    stacked grid rows (audience headers, Avatar row, Workstation row) so the
    **AVATAR/WORKSTATION headers align across both columns** regardless of item
    count; a light `w-px bg-gray-200` divider at `left-1/2` runs down the centre
    gap (lg+). Each header shows a **light-gray count**; each `ProductSection`
    (avatar/workstation, by `kind`) shows its cards or **"No currently associated
    products."** Buckets via `bucketProduct`; product name = `label.split(' · ')[0]`,
    associated Realityworks product = `parts[1]` when `kind==='workstation'`.
  - **My Usage** (`usageOpen`) — **My Avatar seats used / allocated**
    (`purchased - remaining` / `purchased`, real), and **My Hardware hours used**
    per workstation product ("My use of the {product} — used / max", `parseUsage`
    of each `listProductUnits` usage string). (The "students near avatar-hour
    limit" row was removed.) Placeholder note styled like the admin sample-data
    box: `text-xs text-red-600 bg-[#e9e9e9] rounded-md px-3 py-2`.
  - **Empty state** (no products) → a "Request Product Association" button opening
    `RequestProductAssociationModal` (checklist of all org products; submit → toast
    placeholder, no admin-request endpoint yet).
- **Below the grid (full width):** the existing "My Active Classes" list and the
  **"Simulations Completed" chart** (Chart.js Bar; **Class** dropdown + **timeframe**
  dropdown 3/6/12/24/All Time + PNG/PDF/CSV export via `chartRef.toBase64Image` +
  `jsPDF`; month-bucketing mirrors admin `reportChartData`; reports→class via
  `reportsByClassId` from each student's `user_id`/`student_id`; date via
  `reportDate()`).
- **Real vs placeholder:** REAL = class counts, active students, sims-completed-this-
  week, unread reports (all/7-day/per-class), due-≤7-days & closing-≤14-days (from
  real sim `due_date`/class `end_date`), avatar seats used/allocated, the chart.
  PLACEHOLDER (clearly labeled) = avatar/hardware **hours**, classes-near-avatar-
  limit (deterministic from a `usageSeed` hash of the user id); the associated-
  products set itself is placeholder (real per-educator association store is
  admin-local `product_notes_v1`, not readable educator-side — backend-blocked).

**Educator-portal brand pass (2026-08-28).**
- **Class Management table** (`components/class/Useclasscolumns.tsx`): class-name
  font is brand gray `#5f6060` (was `text-primary-400`); the **Students / Sims /
  Reports chips have NO resting fill** (`bg-transparent`, gray text/icon, gray
  border). The **Sims chip icon is `Monitor`** (a computer screen, 2026-08-28) —
  it replaced the old `TestTube` rotated 45° that read as a pencil; no rotation.
  The **Students chip icon is `GraduationCap`** (2026-08-28) — matching the
  student icon used elsewhere (dashboard `MetricsSummary`, `ClassCard`); replaced
  the plain `User` glyph. Orange fill/border is reserved for the **attention** states
  (selected/expanded = solid orange; Reports `hasNew` = orange outline, dropping
  the banned peach `bg-primary-50`). The **Status pill uses the shared admin
  `StatusPill`** (light tint + dark text) via `classStatusTone` (ACTIVE→success,
  INACTIVE/ATTENTION→warning, ARCHIEVED→danger, DRAFT→neutral) — replaced the old
  solid `bg-green-600 text-white` etc.
- **Educator dashboard icons are brand-orange lucide, no background** (matching
  the admin portal): `MetricsCard` takes a `LucideIcon` (was an `<img>` src +
  gray circle); `MetricsSummary` passes **Presentation** (classes) ·
  **GraduationCap** (students) · **CheckCircle2** (simulations) · **FileText**
  (reports). `ClassCard`'s per-class stats use the same GraduationCap /
  CheckCircle2 / FileText (dropped `student.svg` / `sims.svg` / `report.svg`).
  Rule going forward: dashboard/stat icons = `text-primary-500`, no bg (they're
  display, not clickable); only clickable icon buttons get a `hover:bg-[#e9e9e9]`.

**New notification type `PRODUCTS_ASSOCIATED` (2026-08-28).** Educator-facing:
fires when an admin associates new products with the educator. Added to the
`NotificationType` union (`NotificationsRedux`), `NotificationCenter` `TYPE_LABELS`
+ a **"Products"** educator quick-filter group (`EDUCATOR_GROUPS`, types
`['PRODUCTS_ASSOCIATED']`) + `actionFor` → `/products`, `NotificationPanel`'s
`TYPE_CONFIG` (orange dot), and **both** `NotificationPreferences` educator lists
(`IN_APP_EDUCATOR` + `EMAIL_EDUCATOR`, id `products_associated`). No backend
emitter yet — this is the FE surface (type + center + preferences).

**Export Student Codes CSV (per class, 2026-08-28).** The class-level "…" menu
(`components/class/Classrowactions.tsx`) has an **"Export Student Codes (CSV)"**
item (always enabled, above Class Status). `handleExportCodesCsv` builds a CSV
with metadata rows (Class Name, School `row.school_name`, Start/End dates,
**Generated** = today) then a `Student Code,Student Name` table — one row per
`row.students[].student_id` (the code shown in the UI = `student_id`) with a
**blank Student Name column** for the educator to annotate. Downloaded via a Blob
+ `URL.createObjectURL`. The Edit-Class modal's Update/Add buttons
(`Classformmodal.tsx`) use the gradient (`bg-gradient-btn`), not solid orange.

**Sim sub-table — inline date editing + avatar time-remaining (2026-08-28).**
- **`components/class/Simsubtable.tsx`:** the **Start / Due / Close date cells are
  inline-editable** (click → `<input type="date">`; `editingDate` state; on change
  `saveInlineDate` dispatches `updateSimulationRequest({simId, start_date,
  due_date, end_date})` — the SAME thunk the EditSimulationModal uses, all dates
  as `MM-DD-YYYY` — then `FetchSimulationsByClass({classId})` + a toast). Disabled
  when `isClassArchived`. The **"Create Simulation Assignment"** button is now
  gradient (`bg-gradient-btn hover:opacity-90`).
- **Status column → "Assignment Status"; archived indicator + recolored legend
  (2026-08-28).** `Simsubtable.tsx`: the status header is now **Assignment
  Status** (`simSubtable.headerStatus`). Colors by assignment state:
  **ongoing = dark gray `#5f6060`, future = brand orange `#db8833`, expired =
  red** (`STATUS_COLOR`, used for the date cells). **Sim names** are dark gray
  `#5f6060`, or **light gray `#e9e9e9` when the simulation itself is archived**
  (`isSimArchived` = `/archiv/i` on `sim.scenario_status`), with a **light-gray
  `#e9e9e9` dot indicator** (bordered for visibility) beside the name — shown only
  for archived (previously-assigned) sims. **Assignment Status pill:** archived
  OR past-close → **Closed** (red), future → **Future** (orange text on `#e9e9e9`),
  else **Active** — the shared green `StatusPill` (`tone="success"`) so it matches
  Active pills across the educator/admin portals. **Legend** is now 3 items: light-gray = Archived
  Simulation, orange = Future Assignment, red = Closed Assignment (`legendArchived`
  added; `legendFuture`/`legendExpired` relabeled; the old orange/green/red
  Ongoing/Future/Expired dots are gone). **NOTE — the spec conflicted on the
  Future color (color-change list said orange, the legend line said green); orange
  was used throughout for legend↔table consistency.** Light gray `#e9e9e9` was
  chosen for "archived" specifically because it's none of the ongoing/future/
  expired dot colors, per the request.
- **`components/class/student/Studentsubtable.tsx`: Time Remaining only for
  avatar classes.** Shows `-` unless the class has an avatar/AI sim assigned
  (`hasAvatarSim` = `selectSimulationsByClassId(classId)` `.some(isAISimulation(sim.avatarEnabled))`).
  When it does, the cap is **40h per student code** (was a 400h default) minus
  time spent. (Note: `avatarEnabled` is un-backfilled locally → all classes read
  `-` until the backend backfills it — see the "AI Seats Required" known issue.)
- **Sim sub-table sort now uses the shared `SortableHeader` (2026-08-28).** The
  old inline `↑/↓/↕` text-arrow `<th>`s were replaced with `SortableHeader`
  (lucide caret), matching every other table in the app, and **all data columns
  are sortable** — Sim Name, Start/Due/Close, **Assignment Status, Started,
  Completed, Average** (Reports/Actions stay non-sortable). New sort keys in the
  `sortedSims` comparator: `status` (future<ongoing<past<archived via
  `getSimStatus`/`isSimArchived`), `started`/`completed`/`average` (from the
  `simStats` map; average parsed from its `%` string). The **Started/Completed/
  Average numbers are `text-base` + centered** (headers `justify-center` too).
- **The Reports column header + chip read "Reports / Transcripts"**
  (`simSubtable.headerReports`/`reportsButton`).

**Class Management table grouped by school + inline-editable dates (2026-08-28).**
- **Grouped by school:** the **School Name column was removed**; classes now
  render under **full-width school group headers** (`#e9e9e9` bar). `ListTable`
  gained an opt-in **`groupBy?: (row)=>string`** prop — when set it renders a
  group header whenever the key changes and **disables internal pagination**
  (all rows render; data must be pre-ordered so same-group rows are contiguous).
  `pages/class/index.tsx` builds `groupedClasses` (reorders `sortedClasses` so
  schools are contiguous, alphabetical, "No School" last) and passes
  `groupBy={resolveSchoolNameForGroup}`. Other `ListTable` consumers are
  unaffected (opt-in).
- **Dates under the class name, inline-editable:** the Class Name cell is now a
  `ClassNameCell` component (in `Useclasscolumns.tsx`) showing **Start – End**
  (MM-DD-YYYY) beneath the name. Click the dates → two `<input type="date">` + a
  **green check (confirm) / X (cancel)**; confirm calls `onUpdateClassDates(row,
  start, end)` (new hook prop) → page `handleUpdateClassDates` dispatches
  `UpdateClassRequest` (recomputes status via `computeClassStatus` unless
  DRAFT/ARCHIEVED/INACTIVE) + `patchClassInStore` + refresh. Disabled for
  archived classes. The hook's old `resolveSchoolName`/`schoolNameById` (and the
  `getParsedUser` import) were removed with the school column.
- **School group header styling:** `ListTable` gained a **`renderGroupHeader?:
  (key)=>ReactNode`** prop; the class page passes `School: {name}` (raw "No
  School" when unknown). The header is now a **rounded `#e9e9e9` bar** (inner
  `rounded-lg pl-5 pr-4 py-2` inside an outer `px-3 py-2`), and the **class
  identity is indented deeper** than the school label (`ClassNameCell` root has
  `pl-6`). The **Start – End date text is `text-sm`** (was `text-xs`).
- **More class filters (2026-08-28):** FilterPanel field order is **School →
  Class Name → Class Status → Class Start Date (on/after) → Class End Date
  (on/before)**. **School, Class Name, and Class Status are all multi-select**
  (`MultiSelect`, with Select all / Clear all); dates are `type:'date'` (dayjs
  `isBefore`/`isAfter` day-comparisons). `FilterState` gained optional
  `classNames?: string[]` / `statuses?: string[]` (UPPERCASE effective status) /
  `schools?: string[]` / `startDate?` / `endDate?` (the old single
  `className`/`status` are vestigial). Reset clears everything.
- **Applied-filter chips + active state (2026-08-28), mirroring the admin
  tables:** on Apply the panel **auto-closes** (`setFilterOpen(false)`) and
  **`FilterChips`** (`components/simulationcatalog/FilterChips`, `#e9e9e9` chips)
  render below the header — one chip per applied value, each removable, plus
  Clear All (`handleRemoveClassFilter` splits `field::value` and updates BOTH
  `appliedFilter` and `filterValues`). The **filter icon button shows an active
  state** when `hasActiveClassFilters`: dark-gray `#5f6060` fill + white icon +
  an orange count badge.

**Report modals reworked (2026-08-28) — `StudentReportsModal.tsx` +
`SimulationReportsModal.tsx`.** Both now: **title = "Reports"** with a centered
**header block** below it — **orange field labels + dark-gray values** — showing
`School:`, `Class:` (resolved from `allClasses` by `classId` + `getParsedUser`
fallback), then `Student Code:` / `Simulation:`. **No `subtitle`.** **Widened to
`max-w-[1280px]`** (fits a 1366-wide screen). **Footer pinned** via the Modal
`footer` prop (Total Time / Avg Score / count; the "click a row to open" text is
gone) so it stays visible while the attempts scroll in the body (thead is
`sticky top-0`). **View Report is orange (`bg-primary-500` white) when the report
is unread (`isReportNew`), gray otherwise**, matching View Transcript; the
**peach row highlight was removed** (rows are white/`hover:bg-gray-50`).
**`StudentReportsModal` also has per-column sorting** (shared `SortableHeader`;
new sort state + comparator over student_code/mode/sim_name/score/status/
time_spent/completed_at). The per-student **Reports chip** in
`student/Studentsubtable.tsx` is **gray normally, orange (white text) when that
student has unread reports** (`hasUnread` on the row, from `isReportNew` over the
student's reports).

**Student sub-table "Student Code Status" column (2026-09-01).** A column sits
**just before Actions**: a green `StatusPill` **Active** normally, or a red
(`tone="danger"`) **Revoked** pill when the student's code is revoked
(`isStudentRevoked(s._original)` = `!student.student_id`). Added a `<col>` +
`headers` entry and bumped `visibleColCount` 7 → 8. **Both the Reports /
Transcripts and Student Code Status columns are sortable** (`field: "reports"` /
`"codeStatus"`): the `sortedRows` comparator special-cases them — `reports` sorts
by `hasUnread`, `codeStatus` by `isStudentRevoked(_original)` (both 0/1 with the
`_index` tiebreak).
- **`ClassActionReportsModal.tsx`** (class "…" menu → **View Reports /
  Transcripts**) got the **same full treatment** (2026-08-28): title "Reports" +
  School/Class header block, `max-w-[1280px]`, pinned footer, per-column
  `SortableHeader` sorting, sticky header, **peach removed** (row tint gone;
  View Report is orange-when-unread / **gray-when-read**).
- **`SimulationReportsModal` reached parity (2026-09-01):** it now has per-column
  `SortableHeader` sorting (student_code/mode/sim_name/score/status/time_spent/
  completed_at via a `sortedReports` comparator) **and** the unread treatment
  (**View Report is orange `bg-primary-500` when the report is unread**
  (`isReportNew(r.id, r.isNew, viewedReportIds)`), gray otherwise). **Per-column
  filtering** on the report modals is the only remaining TODO across all of them.

**Bulk "mark reviewed/unreviewed" across all report surfaces (2026-09-01).** A
checkbox multi-select (per-row + select-all header checkbox with `indeterminate`,
`accent-white` for a plain black check) + a toolbar with **Mark reviewed / Mark
unreviewed** (act on the selection) and **Mark all reviewed / Mark all
unreviewed** now lives on **all four** report surfaces: `StudentReportsModal`,
`ClassActionReportsModal`, **`SimulationReportsModal`** (the per-sim Reports chip),
and **`ReportSubTable`** (the inline expanded reports table on the Class page).
Reviewed dispatches the array-aware **`MarkReportViewed`** thunk (local + backend
PATCH); Unreviewed dispatches the **local-only `markReportUnviewed`** reducer
(new inverse of `markReportViewed` in `GetClassRedux`, also array-aware — there is
no backend un-view endpoint). The three **action menus** (class
`Classrowactions`, student & sim sub-tables) also carry **Mark All Reports
Reviewed / Unreviewed** items right after the report/transcript actions, scoped to
that class / student / sim's report ids. The student sub-table's **Reports column
header + chip** read **"Reports / Transcripts"** (`headerReports`/`reportsButton`).
The **sim actions menu** (`Simsubtable`) also gained an **Export Transcripts**
item (`menuExportTranscripts`, action `export_transcripts`) right after Export
Reports — it opens `ExportTranscriptModal` with the same `source:{type:'sim',…}`
shape Export Reports passes to `ExportReportModal` (new `transcriptSim` state).

**Target-row navigation highlight de-peached (2026-09-01).** When you navigate
between the class-management tables (into a sim's reports, class→sim table, etc.)
the matched row(s) get a brief highlight. That highlight was the banned peach
`bg-primary-100` and is now brand light gray **`bg-[#e9e9e9]`** in
`Simsubtable.tsx` (`isHighlighted` — row + sticky first cell) and
`ReportSubTable.tsx` (`isTargetRow` — note it matches by `scenarioId`, so all
attempts of that sim highlight together). `ListTable`'s `targetRowId` only jumps
to the right page (no tint), and the student sub-table's pin only reorders, so
those needed no change.

**Peach purge + read/unread button convention (2026-08-28).** App-wide, the
report **View Report / Reports / "Reports / Transcripts" buttons/chips** follow:
**orange (`bg-primary-500` white) only when there are unread reports, else light
gray (`bg-gray-50 border-gray-200 text-gray-600`)**; View Transcript is always
gray. Applied to `ReportSubTable` (row peach tint also removed), `Simsubtable`
per-sim chip (`getReportsForSim` + `isReportNew`), the per-student chip in
`Studentsubtable`, and all three report modals. No more `bg-primary-50/100` on
these.

**Sims sub-table: frozen first column + read-only extras (2026-08-28).** The
**Sim Name column is frozen** on horizontal scroll (`sticky left-0` + solid bg on
the header `<th>` and each row's first `<td>`; header keeps `sticky top-0`).
The **Sims Completed column lost its green color** (plain gray). **Add Student**
button → **gradient**.

**Simulation Catalog quick-filters + filter order (2026-08-28).**
`pages/Simulation/simulationcatalog/index.tsx` gained **big quick-filter buttons**
— **Learner Level** (Secondary / Post-Secondary) + **Modality** (Avatar /
Workstation) — above the browse sections. Each toggles on/off and they combine
(all four combinations); `quickAudience`/`quickModality` state feeds
`matchesQuickAudience`/`matchesQuickModality` into the `filteredSections` matcher
(audience via `targetAudience`/`learnerLevel` regex, modality via `avatarEnabled`)
and Reset clears them. The FilterPanel **field order** is now
`learnerLevel → targetAudience → modality → productName → difficulty → unit →
duration` (existing backend fields sorted by a `FILTER_ORDER` array; the 3 new
keys slot in once added). **Caveat:** modality keys off `avatarEnabled`
(un-backfilled locally → all Workstation), so it won't visibly split local data
yet.

**Create Simulation Assignment modal rework (`AddSimulationModal.tsx`,
2026-08-28).** Wider (`max-w-xl`), gradient Create button. **"Simulation
Modality"** (was Product Category) is now a **dropdown at the TOP** + a new
**Target Audience** dropdown; both `filterModality`/`filterAudience` narrow the
searchable Simulation Name list (`filteredScenarios` by `scenarioModality`
(avatarEnabled→Avatar/Workstation) + `scenarioAudience` (learnerLevel→Secondary/
Post-Secondary)). The old read-only category field was removed. A **Simulation
Details info panel** (Difficulty / Duration / Clinical Setting / Description /
Learning Objectives, only rows that have values) renders below the duration
fields once a sim is selected. Same un-backfilled caveat for modality/audience.

**Multi-class / multi-sim + School selector (2026-09-01).** Widened to
`max-w-3xl`. A new **School** `SelectField` sits above Class Name; options are the
distinct schools across the educator's active classes (`schoolKeyOf` = id-or-name,
`NO_SCHOOL_KEY` bucket), it **defaults to the only school** when there is one
(`schoolDefaultedRef`), and it **filters** the Class Name list. **Class Name is now
a `MultiSelect`** (`summarize` → "N selected", searchable); each option renders
**multi-line** — class name on line 1, then **indented** school + `{start} – {end}`
(MM-DD-YYYY via `fmtClassDate`) sub-lines, via a new **`subLabels?: string[]`**
option field on `MultiSelect` (sub-lines are indented `pl-3 text-xs text-gray-500`,
also matched by the type-to-search). **Simulation Name is also a `MultiSelect`**
(`selectedSimValues`). **The Unit field was removed** (2026-09-01). State moved
from `selectedClass: Class|null` → `selectedClassIds: string[]` +
`selectedSchoolId`; `handleClassesChange`/`handleSchoolChange`/
`handleSimulationsChange` replace the single-select handlers. **No class is
selected by default** (only the School defaults when there's one); selecting a
class prefills the date range from the first selected class. **Submit loops every
selected class × every selected simulation**
(`targetClassIds`), the one date range applied to all, with per-**sim**
`reduceToken` (`isAISimulation(sim.avatarEnabled)`, that class's student count).
`MultiSelect`'s portal carries `data-select-dropdown`, so search keeps focus
inside the `Modal`. **Class-context mode (`classId` set) now renders the SAME
School + Class selectors (2026-09-01)** — `showClassFields` is always true; on
open it **seeds** them from the inherited class (`classCtxSeededRef`:
`selectedSchoolId = schoolKeyOf(class)`, `selectedClassIds = [classId]`, dates from
the class), and they stay **editable** so the educator can add more classes /
change school just like from the library. Submit always uses `selectedClassIds`
(no more `isClassContext` single-class branch); `reduceToken` falls back to the
`students` prop for the seeded class. The seed/school-default effect keys on
`isOpen` so it re-applies on every reopen.

**Inline "create a class" from the assignment modal (2026-09-01).** Mirrors the
admin inline school/educator flow: the Class Name `MultiSelect` has `onCreate`
(only when a school is selected) — typing a name that doesn't match shows a
**Create class "…"** row that opens an inline **New Class form** (school shown
read-only from the selected school, editable name prefilled, Start/End date
inputs, a **required Class Status** dropdown (Active / Draft / Inactive /
Archived), and **optional # Students**). `onCreate` returns `null` (a class needs
dates, so it can't auto-create from a name) and the form's **Create Class** button
does the work: `handleCreateClass` dispatches **`PostClassRequest`**
(`school_id` = `resolvedSchoolId()`, `class_name`, dates, the **user-chosen
`status`**, `user_id`, `total_no_of_students` only when entered), then
`FetchClassesRequest()` refresh + auto-selects the new class id and prefills the
assignment dates. **`schoolOptions` now merges the educator's own
`getParsedUser().schools` (authoritative ids) with class-derived schools**, so a
class can be created for a school that has no classes yet, and the school-default
(only-one-school) logic considers both. Applies to every use of the shared
`AddSimulationModal` (library bulk + class sub-table).

**Misc (2026-08-28):** the student sub-table **Student Code cell is left-aligned**
(header already was); the **"View All Classes" button was removed** from the
Classes Needing Attention card on both the Class Management page and the educator
dashboard. Report/sub-table scroll containers use **`rounded-xl`** so the header
bar + table have rounded corners.

**My Simulation Library adopts the catalog filter structure (2026-09-01).**
`pages/Simulation/simulationlibrary/index.tsx` was converted from the old
`FilterBar` (All / Recently Used / Recently Added tabs) + single-select common
`FilterPanel` to the **catalog-parity filter surface**: the caption "Simplify
your search with filters" + `SearchBar` + the unified quick-filter buttons
(Secondary/Post-Secondary · Avatar/Workstation · Easy/Medium/Hard, via
`toggleQuickFilter`/`quickActive`) + the **icon-only filter button** (dark-gray
`#5f6060` + orange `activeFilterCount` badge) + the **7-field multi-select
searchable `FilterPanel`** (Learner Level · Target Audience · Modality · Required
Product Name · Difficulty · Unit · Duration) + `simulationcatalog/FilterChips`.
Filtering is now **client-side** over `selectSimulationLibraryData` (the raw
library list) — the redux panel-filter machinery (`applyPanelFilter`,
`selectFilteredSimulations`, `selectAppliedFilters`, `FilterBar`, the tabs) is no
longer used here (those exports still exist for any other consumer). The
**panel** filters run in the page; the **title search** is delegated to
`SimulationGrid` (controlled `searchValue`/`onSearchChange`, so it runs once). The
grid keeps its **grid/list `ViewToggle`** (the catalog View-All is grid-only) and
the updated cards (`Simulationcard` chips + list-view Learner Level → Target
Audience → Modality → Product → Difficulty → Duration columns). The page **still
has an `<h1>` title** — the "remove headings" ask was ambiguous vs. the page's
own identity, so only the redundant tabs were removed; flag if the title should
go too. Helpers mirror `SimCatalogGrid` but typed for `Simulation`
(`simLevel`/`simModality`/`simProduct`/`simUnit`, `matchDurationToRange`).
- **Grid tiles (`Simulationcard`) restyled to the catalog tile layout
  (2026-09-01).** Chips are now **overlaid on the tile image** (top-left, white
  `bg-white/90` chips over a `from-black/70` scrim), and the **simulation name
  sits at the bottom of the tile** in white (`line-clamp-3`) — like `AllSimItems`.
  Row 1 = learner level + modality; **row 2 = difficulty + duration on the same
  line (duration just right of difficulty)**. The old below-image chips row + dark
  `<h3>` title were removed; the **Assign to Class (gradient) / More Info (gray)
  buttons stay below the image**. The `AI Seats Required` badge moved from the
  overlapping `top-3 right-3` to `top-11 right-2` (under the heart), clear of the
  bottom title.
- **List-view header is brand orange (2026-09-01).** `components/ui/table.tsx`
  `TableHeader` default was the **non-brand** orange `bg-[#F58220]` → now
  `bg-primary-500` (brand `#db8833`). `ui/table` is used **only** by
  `SimulationGrid`, so this is scoped to the library list view.
- **Bulk assign + alphabetical order (2026-09-01).** Library sims are sorted
  **alphabetically by title** (`panelFiltered` `.sort(localeCompare)`). A
  **bulk-select** flow lets the educator pick several sims and assign them to one
  or more classes at once: `Simulationcard` (grid) shows a **top-left selection
  checkbox** beside the chips and `SimulationGrid` (list) a **leading checkbox
  column** with a select-all header, both driven by `selectedIds` +
  `onToggleSelect` props threaded from the page's `selectedSimIds` state. A
  toolbar above the grid offers **Select all (n) / Clear / "Assign N to
  Class(es)"** (`handleBulkAssign`). Assigning opens the **same
  `AddSimulationModal`** with the new **`simulationIds?: string[]`** prop, which
  pre-selects all of them (the effect matches every id in `allScenarios`);
  `onAssigned` clears the selection. Single-tile Assign now also routes through
  `simulationIds=[id]`. The modal's multi-class × multi-sim submit does the rest.

**Class-management "Create Simulation Assignment" already inherits multi-sim
(2026-09-01).** The class sub-table's Create button opens the same
`AddSimulationModal` in **class-context** (`classId` set → School/Class selectors
hidden, the class is fixed); because Simulation Name is now the shared
`MultiSelect` for all modes, that modal already supports assigning **several
simulations at once** to the class — no separate change was needed.

**Sim sub-table header sorting + column title (2026-09-01).** The
**Reports / Transcripts** header is now sortable (`SortableHeader`, `field:
"reports"`) — the `sortedSims` comparator sorts by **# of unread reports** per sim
(`getReportsForSim(s).filter(isReportNew).length`; deps gained `viewedReportIds` +
`classReports`). **Report views' last column renamed "Actions" → "View Reports / Transcripts"**
via locale — `reportsModal.headerActions` (Student + Simulation modals),
`classActionReportsModal.headerActions`, **and `reportSubTable.headerActions`**
(the inline expanded reports table) — en + es. The sub-table Actions columns
(`simSubtable`/`studentSubtable`, the "…" menus) keep "Actions".

**"New" report badges removed (2026-09-01).** The orange **New** pill next to the
simulation name in the report views (`ClassActionReportsModal`,
`StudentReportsModal`, `ReportSubTable`) was removed — **the orange View Report
button (shown when `isReportNew`) is the sole unread indicator now**. `isNew`/
`isNewReport` are still computed for that button; only the badge spans (and the
now-unused `badgeNew` locale key) are gone. `SimulationReportsModal` never had the
badge. The red **Late** badge in `ReportSubTable` is unrelated and stays.

**Performance-quality column: neutral gray + renamed (2026-09-01).** Across ALL
report tables/modals (`ReportSubTable`, `StudentReportsModal`,
`ClassActionReportsModal`, `SimulationReportsModal`) the performance label
(Exceptional / Meets Expectations / Needs Improvement) is now **plain
`text-gray-700`** — `getStatusColorClass()` in each file was gutted to always
return gray (param renamed `_score` for `noUnusedParameters`); the old
blue/green/red by-score tiers are gone. The **column header "Status" → "Performance
Quality"** in the three report namespaces (`classActionReportsModal`,
`reportSubTable`, `reportsModal`, en + es) — matched precisely by the
`headerStatus`→`headerTimeSpent` adjacency so the `schools`/`educators`/
`simSubtable` ("Assignment Status") status headers are untouched. The
`ReportSubTable` Completed-At green/red on-time-vs-late tint is a timeliness cue,
not performance, and was left as-is.

**Sim sub-table Reports/Transcripts cell centered (2026-09-01).** The chip button
was `flex` (block-level → full-width, left-aligned under the centered header); now
`inline-flex` with the `<td>` `text-center`, so the chip centers under its header.

**Sim sub-table header corner clipping — re-fixed with an outer wrapper
(2026-09-01).** The earlier per-cell `rounded-tl/tr-xl` approach didn't fully
stop the sticky header poking over the rounded corner, so the container is now an
**outer `rounded-xl border overflow-hidden` wrapper around an inner
`overflow-*-auto max-h-[400px]` scroll div** — the outer's rounded clip catches
the sticky header regardless of Chrome's sticky-escapes-overflow behavior; the
cell `rounded-tl/tr-xl` classes were removed. Historical context: the `Simsubtable`
scroll container is `rounded-xl` + `overflow-*-auto`, and its `<thead>` is
`sticky top-0` with a `sticky left-0` first cell — sticky descendants escape the
container's rounded clip (Chrome), so the header's square corners poked over the
rounded container corners. Fix: `rounded-tl-xl` on the first (sticky-left) `<th>`
and `rounded-tr-xl` on the last (Actions) `<th>`.

**Catalog rework — shared grid, unified quick↔panel filters, View-Simulations
switcher, tile Difficulty chip (2026-08-31).**
- **`components/simulationcatalog/SimCatalogGrid.tsx`** is a NEW shared component
  for ALL catalog "View All" sub-pages: full-width responsive tile grid
  (`xl:grid-cols-6`) + search + quick-filter buttons + the 7-field FilterPanel +
  chips, all derived from the `items` passed in. `ViewAllSims`, `ViewAllFavourites`,
  and `SimulationAllView` (Sim-Pack / section drill-downs) are now thin wrappers
  over it. Tiles render via `AllSimItems`. Its header is two rows: **row 1 = Back +
  family-name title on its own line**, **row 2 = "Simplify your search with
  filters" caption + search + count**. Quick buttons write into `appliedFilter`;
  Filters is an **icon-only** button (dark-gray `#5f6060` + orange count badge when
  applied). (The standalone `viewAllSims`/`difficultyFilter` path in the catalog
  index was REMOVED — the "All" tab shows the full list inline.)
- **Quick filters are UNIFIED with the panel** (both catalog index and
  SimCatalogGrid): the Secondary/Post-Secondary · Avatar/Workstation · Easy/
  Medium/Hard buttons now toggle a value in `appliedFilter`+`pendingFilter`
  (`learnerLevel`/`modality`/`difficulty`) via a shared `toggleQuickFilter(field,
  value)` / `quickActive(field,value)`; the separate `quick*` state and
  `matchesQuick*` pass are GONE. So a quick pick shows in the filter menu AND as a
  chip, and clearing from either place clears the button. The catalog's top-right
  filter icon shows applied state (dark gray + orange `appliedFilterCount` badge).
- **`components/ui/MultiSelect.tsx`:** `selected` now maps EVERY value to
  option-or-`{value,label:value}` fallback, so an applied value not in the field's
  option list (e.g. a quick difficulty vs backend difficulty options) still renders
  as a chip instead of vanishing. Also the empty **placeholder is single-line**
  (`flex-1 min-w-0 truncate`) so multi-selects match single-select height on narrow
  screens.
- **"View Simulations" content switcher** (catalog index) replaced the stacked
  Favorites/Packs/All sections: a segmented toggle **All · Favorites · Sim Packs ·
  Units** sitting **just below the header divider**; the body shows ONLY the
  selected category (All = full grid, Favorites = `myFavorite` grid, Packs = the 4
  bundle tiles, Units = one tile per unit → `setViewAllState` drill-down). Label +
  "Browse by" are brand dark gray `#5f6060`.
- **`AllSimItems.tsx` tiles** now show a **Difficulty chip** on its own row under
  the learner-level/modality row (left-aligned, only when `item.difficulty` set).
- **`components/simulation/Banner.tsx` hero** height reduced without distortion:
  `h-auto` → capped `h-32 sm:h-40 md:h-48` + `object-cover object-center`.

**Educator "Preview Simulation" (practice-only, 3 attempts) on the details page
(2026-09-01).** `Simulationdetail.tsx` shows a **Preview Simulation** button
**next to the Add/Remove Library button** (hero, gated `!isPublic &&
!isStartTrial` — logged-in educator, no student code). It carries an always-visible
**"N of 3 left"** badge and disables at 0. Clicking opens a **two-step
confirmation** (`components/simulation/PreviewSimulationModal.tsx`: step 1 explains
practice-only + nothing-stored + uses 1 of 3; step 2 final "Yes, use 1 preview
attempt"). Attempts are tracked **per educator + simulation in localStorage**
(`utils/previewAttempts.ts`, `rw_edu_preview_<userId>_<simId>`, `MAX = 3`;
`getPreviewsRemaining`/`consumePreview`). On confirm it consumes an attempt and
`window.open`s the **student app** in Practice mode flagged as a preview
(`${STUDENT_APP_URL}?simulationId=…&mode=practice&preview=1`).
- **CAVEATS (backend-dependent, not enforceable here):** the "**no report/
  transcript stored**" requirement and the actual preview session are the student
  app / backend's job — the FE only passes `preview=1&mode=practice`; the backend
  must honor it. The 3-attempt cap is a **soft, per-browser** localStorage guard
  (clearable, not synced across devices) — a real limit needs a backend counter.
  `STUDENT_APP_URL` is the same placeholder host as the Sidebar link
  (`tutorpatient.realityworksai.com`); the exact preview launch URL/contract isn't
  defined in this repo yet.

**Simulation details page — SBAR + facilitation docs polish (2026-08-31).**
`components/simulation/Simulationdetail.tsx`:
- **`CollapsibleCard` heading color is state-driven:** brand orange
  `text-primary-500` when **expanded**, bold dark gray `#5f6060` when collapsed.
- **SBAR section retitled "Patient Handoff SBAR"** (`sbar` locale key) and the
  **Recommendation label → "Recommendation / Request"** (`sbarRecommendation`); both
  updated in `locales/auth/login/{en,es}.json`. Each SBAR field is now a card with
  a **left orange accent bar** (`border-l-4 border-primary-500`), `#f5f6f8` bg, and
  an **uppercase orange label**.
- **Facilitation Documents** render as uniform gray rounded **tiles**
  (`bg-[#e9e9e9] rounded-xl border`, `hover:border-primary-400 hover:shadow-md`,
  `cursor-pointer`, label underlines on hover), in a grid up to **4 across**
  (`xl:grid-cols-4`, `items-stretch`) with wrapping titles. Doc name is dark gray
  `#5f6060`, file icon stays orange. **INSTRUCTOR-/STUDENT-FACING** subheadings
  bumped to `text-sm sm:text-base` and recolored dark gray `#5f6060`.

**Simulation Catalog — searchable multi-select filters + quick buttons + Sim
Packs (2026-08-28).** `pages/Simulation/simulationcatalog/index.tsx`:
- **Filter Simulations panel is now 7 searchable multi-select fields** in order:
  **Learner Level · Target Audience · Modality · Required Product Name ·
  Difficulty · Unit · Duration**. `pendingFilter`/`appliedFilter` are now
  `Record<string,string[]>` (EMPTY_FILTER); matching is array-based
  (`inArr` = any-of within a field, all-of across); chips are one-per-value keyed
  `field::value`; new-field options are derived (learnerLevel/modality static,
  productName from `itemProduct`, difficulty falls back to Easy/Medium/Hard).
  Item derivation: `itemLevel` (audience regex), `itemModality`
  (avatarEnabled→Avatar/Workstation), `itemProduct`.
- **Big quick-filter buttons** (Browse by): Secondary/Post-Secondary ·
  Avatar/Workstation · Easy/Medium/Hard — each toggles, combines, and feeds
  `matchesQuick*` into `filteredSections`. Search + filter icon sit on a top row
  above the buttons.
- **"All Sim Packs"** section (below All Simulations): 4 audience×modality bundle
  tiles (`simPacks` from the full unfiltered catalog). Heart favorites the whole
  pack; **View** → `setViewAllState` drill-down showing the pack's individual sims.
  **Pack/Unit tile hearts (2026-09-01):** use the hook's **`handleAddGroup`**
  (toggle whole group) + **`isGroupInLibrary(sims)`** (all sims `myFavorite`) and
  **fill the Heart** (`fill={inLibrary?"currentColor":"none"}`) when the group is
  in the library — previously the pack heart never filled and looped
  `handleAddSim`. The **Unit tiles gained a matching heart** (they had none). The
  individual sim tiles (`AllSimItems`) already filled via `isInLibrary`.
- **Removed:** the Browse-by Unit/Target-Audience toggle + cards, the
  Easy/Medium/Hard difficulty *sections*, and all non-brand `#f5f4ef` backgrounds
  (catalog, View-All pages, `SimulationAllView`, Footer → white). Content
  container is `rounded-2xl`. **CAVEAT:** modality keys off `avatarEnabled`
  (un-backfilled locally → all Workstation) and audience off `learnerLevel`, so
  the Avatar packs/filters won't visibly populate locally until backfilled.
- **Sim tiles** (`AllSimItems` + `ViewAllSims`) show **learner-level + modality
  chips** at the top (in line with the heart) + a **larger wrapping title**; the
  View-All grid is full-width (`xl:grid-cols-6`) to kill dead space.

**Class dates are READ-ONLY again (2026-08-28).** The inline date editing added
to `ClassNameCell` (click-to-edit + confirm/cancel) was **removed** — dates set
at creation are not editable from the list. Dropped: the `onUpdateClassDates`
hook prop/wiring, the page's `handleUpdateClassDates`, and the `useState`/`Check`/
`X` imports in `Useclasscolumns.tsx`. The Class Name cell shows the dates as plain
`text-sm text-gray-500`.

**Older reports-modal note (superseded above):** The **View Report button is now gray** (`bg-gray-50
border-gray-200 text-gray-600`, was banned peach `bg-primary-50`), matching View
Transcript. The **`subtitle` was removed**. The Modal **title is now a
"School: … · Class: …" header bar** (resolved from `allClasses` by `classId`,
with a `getParsedUser().schools` fallback), and the **sim name renders as a
`Reports — {simName}` heading at the top of the body** — i.e. School/Class sit
above the simulation name.

**Sim sub-table status is self-describing; legend removed (2026-08-28).** The top
legend (Future/Closed) is **gone**; the Assignment Status **chip itself is the
key**: green **Active** (shared `StatusPill` success), orange **Future** (custom
`#fbe7d0`/`#a55a12` chip), red **Past** (`StatusPill` danger; `statusPast` =
"Past"). Archived OR past-close → **Past**. The **Archived Simulation key** (light
gray dot) stays inside the Sim Name `<th>`.

**Scrollbars: min thumb size (2026-08-28).** The global `*::-webkit-scrollbar-
thumb` gained `min-height/min-width: 40px` so the orange thumb stays visible/
grabbable even for short overflows. (The site-wide rule already makes scrollbars
classic/non-overlay + orange, so they persist on overflow without auto-hiding.)
- **No pagination (2026-08-28):** classes don't paginate (grouped mode disables
  `ListTable` pagination) and the **student sub-table
  (`student/Studentsubtable.tsx`) no longer paginates** — the `Pagination`
  control + `currentPage`/`itemsPerPage` state + page-reset effect were removed;
  every roster row renders (`pagedRows = sortedRows`).
- **Archived-simulation key moved into the Sim Name header (2026-08-28):** the
  `Simsubtable.tsx` top legend now shows only Future (orange) + Closed (red); the
  **Archived Simulation key (light-gray dot) sits inside the Sim Name `<th>`**
  beside the sort header (`text-white/70` on the dark header).

**Educator Sidebar — Student App link (2026-08-28).** `layout/Sidebar.tsx` shows
a **Student App** footer (educators + trial only, `showStudentApp`) with the
placeholder URL `STUDENT_APP_URL = https://tutorpatient.realityworksai.com/` —
expanded = a bordered card (open-in-new-tab link + copy button that flips to a
green check), collapsed = an `ExternalLink` icon button with tooltip.

**Transfer Class modal — multi-class (2026-08-28).** `TransferClassModal` step 1
is now a **multi-select checklist** (own search box + Select all / Clear all +
checkbox rows, mirroring `MultiSelect` UX but with rich rows since `MultiSelect`
only renders string labels). Each class row shows **name + `StatusPill`
(`getEffectiveClassStatus`) + school + "N students · Opens {date} · Closes
{date}"**. State moved from `selectedClassId: string` to
**`selectedClassIds: string[]`**; steps 2–3 show a `SelectedClassesSummary`
(chips + total students) instead of the single `ClassCard`. The transfer API is
still one-class-at-a-time, so `handleConfirm` **fans out with
`Promise.allSettled`** over the selected ids and aggregates — full success →
success screen ("N classes transferred"); partial failure → back to review with
"X of Y transferred, Z failed: …". `GetEducatorByUserRequest` refreshes once
after.

---

## Accessibility (WCAG 2.1 AA) — audited + fixed 2026-08-27

An 11-finding WCAG 2.1 AA audit of the admin site was done and the fixes below
applied (all local, no visual change at rest — focus rings only show on keyboard
focus). Numbers are the audit's finding IDs.

**Done:**
- **#2 Text contrast (1.4.3).** Global `text-gray-400` (2.54:1, fails) →
  `text-gray-500` (4.83:1, passes) across ~75 files (231 occurrences). className
  strings only, so zero type impact.
- **#3 MultiSelect keyboard nav (2.1.1).** `components/ui/MultiSelect.tsx` options
  were mouse-only `<div role="option">`. Added a roving `focusedIndex` with
  Arrow/Home/End/Enter (and Space on the non-searchable trigger), highlight reuses
  the existing `bg-[#e9e9e9]` hover style, `aria-activedescendant` +
  `multiselect-option-{i}` ids, Escape returns focus to the trigger (`buttonRef`).
- **#4 Chart drill-down keyboard access (2.1.1).** The admin dashboard sim chart
  is a Chart.js canvas whose drill-down was `onClick`-only. Extracted `drillTo()`
  (shared by the canvas handler) and added an **sr-only** `<ul>` of drill buttons
  after the `<Bar>` — `sr-only` uses clip not `display:none`, so they stay
  focusable/tabbable with no visual change.
- **#5 Focus-visible rings (2.4.7).** Only two controls actually stripped the
  outline without a replacement: `ui/CustomSelect.tsx` and
  `ui/ReportsNotificationBadge.tsx` — both got `focus-visible:ring-2
  focus-visible:ring-primary-400`. **Note:** most other controls (chart
  view/time toggles, FilterPills, chip × buttons) do *not* set
  `focus:outline-none`, so they keep the browser default outline and are already
  compliant — don't "fix" them by adding rings (that changes appearance).
- **#6 Skip link (2.4.1).** `layout/DashboardLayout.tsx` — `sr-only
  focus:not-sr-only` "Skip to main content" as first child, targeting
  `<main id="main-content" tabIndex={-1}>`.
- **#7 Sortable table semantics (1.3.1/4.1.2).** `myproducts/ProductEntitlements.tsx`
  (a real `<table>`) — `aria-sort` on each `<th>` driven by the current sort
  state. `ListTable` is a flat CSS-grid of divs (no row/cell semantics to hang
  roles on), so its sort state is announced via `SortableHeader`'s `aria-label`
  instead — that button also lost a keyboard-blocking `tabIndex={-1}`.
- **#8 FilterPanel region + Esc (2.1.2/4.1.2).** `common/FilterPanel.tsx` root got
  `role="region" aria-label={title}` and an `onKeyDown` Escape → `onClose()`.
- **#9 Landmarks/labels (1.3.1).** `Sidebar` nav `aria-label="Primary"` + per-link
  `aria-label`/`aria-current`; `Header` `role="banner"`.
- **#10 / #11 verified OK — no change needed.** html `lang`, form labels, error
  messaging, decorative icons (`aria-hidden`/`alt=""`), reflow; toast `aria-live`
  is handled natively by **sonner** (`common/Toast.tsx`).

**Deliberately NOT changed:**
- **#1 Brand orange contrast (1.4.3).** White on `#db8833` (primary-500) is 2.78:1
  and fails, but **the user chose to keep the brand orange** — do not change it.
  (A passing alternative would be ~`#b45e20` at 4.60:1; kept only as a note.)

### Educator-portal WCAG pass (2026-09-01)

A full educator-portal audit (24 findings) was run and the fixes applied:
- **Icon-only action triggers got accessible names + popup/expanded state:** the
  three "…" menus (`Classrowactions`, `Simsubtable`, `Studentsubtable`) now carry
  `aria-label` + `aria-haspopup="menu"` + `aria-expanded`, dots/`···` `aria-hidden`;
  Account redeem-modal close = `aria-label="Close"`.
- **Catalog favorite Heart** (`AllSimItems`) + **pack/unit tile hearts** →
  `aria-pressed` + `aria-label` (state no longer color-only). `AllSimItems` icon
  `aria-hidden`.
- **Class Status submenu is now keyboard-openable** (`Classrowactions`) — a shared
  `openStatusSubmenu()` opens on click/Enter **and** hover, Escape closes,
  `aria-haspopup`/`aria-expanded`. **This is a real interaction change** (the row
  now opens on click, not hover-only).
- **`aria-pressed` on quick-filter toggles** (library + `SimCatalogGrid`;
  catalog-index already had it). **`aria-expanded` + names on the class-column
  Students/Sims/Reports chips** (`Useclasscolumns`, `ReportsNotificationBadge`).
- **Focus-visible rings restored** where `focus-visible:outline-none` had no
  replacement: class + catalog filter-icon buttons, report-modal sim-name button,
  shared `SearchBar` clear button (also gained `aria-label="Clear search"` and its
  X darkened `#9ca3af`→`#6b7280` for 1.4.11).
- **Simulation-details hero text** (`text-white/70–85`) → solid `text-white` +
  `text-shadow`; pack/unit tile subtitles likewise. NOTE: the teal-gradient light
  stop still can't reach 4.5:1 with white text — fully passing needs darkening the
  **approved** brand gradient (design decision, left as-is).
- **Label↔input association:** inline New-Class form (`AddSimulationModal`) +
  `StudentModal` student-count now use `id`/`htmlFor`; `Classformmodal` auto-dates
  label → `role="group"`+`aria-labelledby`; Account read-only fields use
  `<span>`+`aria-labelledby` (not dangling `<label>`s); hidden file input labeled.
- **`text-gray-400`→`text-gray-500`** on the educator dashboard (missed by the
  admin sweep).
- **Heading order:** shared `ProgressCard` value `<h2>`→`<p>` (tag-only, also
  affects admin — no visual change); educator-dashboard collapsible section titles
  `<span>`→`<h2>` to supply the missing h2 level.
- **`Simulationcard` remove-confirm portal** gained `role="dialog"`/`aria-modal`/
  `aria-labelledby` + Escape + initial focus (not switched to the shared `Modal`,
  to avoid a visual change); `fromBundle` heart → `role="img"`+`aria-label`.

---

## Version state — READ BEFORE REVIEWING (2026-08-26)

**The working tree and the committed tree are different versions.**

| | Version |
|---|---|
| Committed `main` @ `1ddefaa` | **1.8.0** |
| Working tree (uncommitted overlay from the `Educator-App-Realityworks-main` zip) | **2.1.0** |
| Backend `D:\educator-back` | **1.8.0** |

`git status` shows ~570 modified files: that is the 2.1.0 overlay, **not** hand
edits. Roughly 80% of the raw diff is CRLF-only noise — always compare with
`diff -w --strip-trailing-cr` or the change looks far larger than it is (353 raw
vs **74** real).

**RESOLVED 2026-08-26: both sides are now 2.1.0.** The backend was upgraded from
the `Educator-App-Backend-main` zip (42 migrations applied, was 37) and rebuilt.
`auth/dual-role-signup` and seat reallocation now exist. Two local backend
adaptations had to be re-applied by hand because upstream 2.1.0 has neither:
`@Public()` on `getSimulationsByCode` (**required** — student codes 401 without
it) and, deliberately **not** restored, the AUTO_POPULATE library pre-seed (see
below). Historical note on the skew that existed before that upgrade:

**The FE 2.1.0 / BE 1.8.0 pair was skewed.** Any 2.1.0 frontend feature depending
on 2.1.0 backend behaviour will look broken locally but work in deployed
environments. Do not patch the frontend to compensate. Endpoints the local
backend does **not** have: `auth/dual-role-signup`, seat reallocation (used by
the new `RemoveReallocateSeatsModal`). A matching **backend 2.1.0 zip** is in
`~/Downloads` and contains both.

**Also non-obvious when testing by hand:**
- **CSRF tokens are required on GETs too**, not just mutations. Echo the login
  response's `csrfToken` as `x-csrf-token` and send the login cookies.
- **`/api/students-backend/*` does not exist** on the local backend at all.

**New in 2.1.0** (5 files): `RemoveReallocateSeatsModal` +
`RemoveReallocateSeatsRedux` (seat reallocation — closes the "stock only moves
one way" gap), `FilterChips` ×2, `DualRoleSignUpRedux`.

**AUTO_POPULATE was dropped on the 2.1.0 upgrade.** The local 53-line library
pre-seed no longer applies — 2.1.0 restructured that function
(`[savedRows, units, enScenarios, localizedScenarios]`). Upstream behaviour now
stands, so **a new educator's library starts empty**. `educator_simulations` is
currently **0 rows**, so all 105 seeded educators see an empty "My Library". If
populated libraries are wanted for testing, add them through the real endpoint
(`educator-simulations/add-to-library-bulk`) rather than re-patching the service.

**Add Educator seat gate is fixed upstream.** 2.1.0 uses `.notRequired()` with
the cap raised 100 → 500. Any local `.min(0)` patch is redundant — drop it.

`tailwind.config.js`, `postcss.config.js` and `index.html` are byte-identical
between 1.8.0 and 2.1.0, so the design system is unchanged; visual differences
are component-level only.

---

## Support Console (`/support`) — added 2026-09-03

A **Realityworks staff** tool (Sales + Support), separate from the educator/admin app.

- **Route:** `https://educatorapp.rwthrive.ai/support` → `src/pages/support/index.tsx`,
  a **public** route in `AppRouter.tsx` (deliberately NOT behind the app session) that
  mounts `public/support-console.html` full-bleed in an iframe. The console is a
  self-contained ~2,800-line prototype (own markup/state/CSS); it was NOT ported to
  React so it can keep being iterated on standalone.
- **Login:** the console ships its own sign-in, so there is ONE login, not two.
  `SUPPORT_USER = realityworks@rwthrive.ai` / `SUPPORT_PASS = realityworks2709`
  (both prefilled). Session persists in `sessionStorage` (`rwai_support_session_v1`) so a
  refresh doesn't kick you out; Sign Out clears it.
- **TRAP — the auth is browser-side only.** The credentials are readable in the page
  source and `/support-console.html` can be opened directly, bypassing nothing because
  there is nothing server-side. It keeps casual visitors out; it is **not** a security
  boundary. Needs a real server-side session before anyone outside the team sees it.
- **`window.__rwaiSupport`** exposes `{state, getSeat, seatsForCode, hwAllowedHours}` for
  console debugging + the smoke test. Remove if the console is ever hardened.

**Data model.** `state.districts` / `state.redemptionCodes` (Activation Codes, `RWC-`) /
`state.hardware` (`HWK-`) were already there. **`state.seats` (`RWS-`) is new** — the
console previously tracked AI seats only as aggregates (`aiSeats`/`allocated`/`returned`),
which made per-seat management impossible. Seat keys are generated from each code's
`aiSeats` at load (300 across the seed data), each with `expiry`, `hoursUsed`,
`hoursCap` (default `SEAT_DEFAULT_CAP = 40`), `assignedTo`, `customExpiry`.

**Changes made this session (all verified in a browser):**
- **District Admin** search now covers **name, NetSuite ID, email and admin contact**
  (was name + NetSuite ID only). The **District Email is click-to-edit in the row**
  (`openDistrictEmailEdit`/`saveDistrictEmail`): validates the address, logs to
  `adminHistory`, and runs `cascadeDistrictSync` so every Activation Code and Hardware
  Key carrying a denormalized copy updates too.
- **Generate Activation Code no longer requires a search.** The mandatory NetSuite
  Account ID gate was replaced by a **district dropdown** (`gcp-districtPick` →
  `pickGenCodeDistrict` → the existing `selectExistingDistrict` branch logic). The
  NetSuite lookup survives as an optional `<details>` shortcut.
- **Activation email copy inverted** — was "Enter this in the RWAI portal to activate";
  now "We have already added your AI seats … there is nothing you need to enter or
  activate", since Support does that step.
- **Code detail = per-key drill-down.** Two collapsible sections (both start collapsed;
  a code can carry 200+ seats) — **AI Seat Keys** and **Hardware Keys** — each row
  showing an hours meter (`used / cap`) plus **inline-editable expiry and hours cap**
  via a shared `editableField`/`openKeyFieldEdit`/`saveKeyField` trio. Seat lists render
  `CD_SEAT_PAGE = 50` at a time with a "show all" link.
  - Editing a key's expiry sets `customExpiry = true`, so a **code-level** expiry edit
    leaves it alone (the flag-box explains this).
  - Guard: a cap below the hours already used on that key is rejected.
  - Hardware caps use a new **`hoursCapOverride`** field that short-circuits
    `hwAllowedHours`'s year-based formula — that's what makes a hardware cap editable.

**Status model reworked (2026-09-03, same session).** There is **no "redeemed" state** —
the district does nothing, because Support controls what access an account gets. Codes are
now **Active** or **Renewed** only (`RC_STATUS_LABEL/BADGE/TOOLTIP`); `pending`/`redeemed`/
`expired` are gone from the seed data and from every branch that tested them:
- Resend to District is now **always** offered (was gated on `status==='pending'`).
- The seat-allocation panel keys on `s.aiSeats > 0` (was `status==='redeemed'`).
- Seat keys no longer inherit an expired code state.
- rc4's flag note (a code expiring before redemption) was replaced — that case can't happen.

**Access Keys table columns removed:** **Type**, **Expires**, **Redeemed**. Type was
duplicative once Status carries Active/Renewed, so the **Type row on the code detail was
removed too** (`cd-type`, `RC_TYPE_*` render sites). `cd-redeemed`'s render line was deleted —
left in place it would have thrown on every detail open.

**Expiry is per-key now, not a code field.** The single "Expires (AI Seats)" / "Hardware
Expiry" detail rows were replaced by a note box holding two **bulk actions** — *Set expiry on
all seat keys* / *…all hardware keys* — plus a live summary hint (`seatExpirySummary`/
`hwExpirySummary`, e.g. "60 keys · all expire Aug 1, 2027 · 1 custom"). Keeping the bulk
action matters: a 200-seat account would otherwise need 200 individual edits.
- **`saveEditExpiry` now cascades to the individual seat keys**, skipping `customExpiry`
  ones. Before this it only moved the code record, so the per-key list underneath would
  silently disagree with the code-level date. (`saveEditHwGroupExpiry` already cascaded.)

**Order-level expiry + seat-key creation fixed (2026-09-03).** Two real defects surfaced
once seat keys became records:
- **Neither issuance path created seat keys.** `submitFirstIssuance` and
  `submitExistingTopup` only moved the `aiSeats` counter (they already created hardware
  records), so a code could claim 80 seats while the AI Seat Keys list showed 60. New
  **`createSeatRecords(count, codeId, districtId, expiry, cap)`** is now called by both.
  Verified: after a 5-seat top-up, `aiSeats === seatKeys` (65/65).
- **The top-up branch captured no expiry at all** — added seats inherited nothing and new
  hardware silently reused the old code-level `hwExpiry`. It now has its own
  **AI Seat Expiration Date** (`gcp-addSeatExpiry`) and **Hardware Expiration Date**
  (`gcp-addHwExpiry`), both defaulting to +365d, both **required** when the matching
  quantity is > 0. Dates apply only to what this order adds; existing seats/keys keep
  theirs (verified: new seats 2029, existing untouched at 2027, new hardware 2030).
- `submitFirstIssuance` still set the retired `status:'pending'` — now `'active'`; a
  top-up sets `'renewed'`.

**Inline Edit affordance (2026-09-03).** `btn-ghost` rendered Edit controls as muted body
text that read as prose. New **`.btn-edit-inline`** pill (peach fill, orange border, pencil
icon, uppercase 700) with a **`.btn-edit-xs`** compact variant used on the per-key rows,
where two sit on every row across up to 50 rows. Applied to the District Email cell, both
per-key fields (via `editableField`), the district-detail Edit and the hardware-detail Edit.
No `btn-ghost` "Edit" buttons remain.

**Removed as redundant (2026-09-03):** the code detail's **Seat Expiry Rule** row (each key
now shows its own date and cap), the Profile page's **Role** chip + "managed centrally" hint,
and the `<details>` wrapper around the Generate-Activation-Code **NetSuite lookup** — that
field is now always visible beside the district picker.

**District Admin merged into Accounts (2026-09-03).** The two pages became one, since keys
are set up per account. Nav is now **Accounts · To Ship · Profile**.
- **One row per district**, left-joined to its Activation Code (`accountRows()`), so a
  district with no code yet still appears with blank key columns and a *Generate Activation
  Code* menu item — newly created districts aren't invisible.
- Columns: Account ID · District · District Email · Access Key · AI Seats · HW Units ·
  Status · Issued. **Admin Contact removed** per request.
- **Search covers account ID, district name, email and access key.**
- Row menu: Copy Key · View Details · **Change District Email** · Edit District Info.
  **Resend to District was removed** (2026-09-03) from both the row menu and the Activation
  Code detail actions, along with its `resendEntitlement` handler — the district never enters
  or activates a code, so re-sending it isn't a support action. A code reaches a district once,
  at generation, via the Send Activation Code step. The email change opens **`modal-changeEmail`**
  (`openChangeDistrictEmail`/`submitChangeDistrictEmail`) which validates, logs to
  `adminHistory` and runs `cascadeDistrictSync`. The old inline email pill went with the
  districts table.
- Pills relabelled **All / Active / Renewed** and filter on `rc.status` (they previously
  filtered the retired `activationType`). A district with no code shows only under All.
- `page-districtadmin`, `renderDistrictAdmin`, `daSearch`/`daBody` and
  `openDistrictEmailEdit` are all gone; every `showPage('districtadmin')` now goes to
  `entitlements`. `page-districtDetail` is kept — it's still the View/Edit district screen.
- **`toggleRowMenu` gained bottom-edge flipping** (`.row-menu.flip-up`): the 5-item menu was
  clipping at the table edge. Verified it flips at a 720px viewport and not at 1000px.

**To Ship is a flat picking list (2026-09-03).** Was grouped one line per district with
audience/expiry/count/created columns; now **one row per hardware key** — Hardware Key ·
District · Mark Shipped — with the ship action on the row instead of via View Details.
Search matches district or key. Audience was dropped; restore it as a 4th column if
whoever ships needs it to pick the device.

**Naming + polish round (2026-09-03, later).**
- Nav/page/breadcrumb **"Accounts" -> "Keys"**; **"Generate Activation Code" -> "Add Keys to
  Account"** (page h1, header button, breadcrumb, row-menu item, create-district copy).
- **Keys table columns are sortable** — `ENT_COLS` + `entSort` + `entSortVal()`, with the
  `<thead>` rendered from JS (`renderEntHead`) so the caret always matches state. Blank
  values sort last in both directions, so no-key rows never jump to the top. Default is
  District ascending.
- **No expiry may be set in the past.** `applyDateMins()` stamps `min=todayIso()` on all
  seven static date inputs at boot, the per-key inputs get `min` inline, and every save
  handler also calls `isPastDate()` — `min` alone doesn't stop a typed value in every
  browser. Verified a typed 2020 date is refused on a top-up.
- **Resend to District removed** from the row menu and the code-detail actions (handler
  dropped) — the district never enters or activates a code.
- **Hardware keys show in full** in the To Ship list and the Mark Shipped modal (were
  `maskKey`); the hardware-detail reveal toggle is untouched.
- **Account Admin removed** from both Add-Keys summaries, matching its removal from the table.
- Removed: the Profile **Role** chip, the code detail's **Seat Expiry Rule** row, the
  **New District** header button (create now happens from Add Keys to Account).

**TRAP — modal classes are `.modal-overlay` / `.modal-box`, not `.modal-backdrop` / `.modal`.**
There is no `.modal-backdrop` rule at all, so a modal using it is never hidden and renders
inline in the page flow. The Change District Email modal shipped broken this way for one
round. Copy an existing modal's markup rather than inventing class names, and note
`openModal`/`closeModal` toggle `.open` on the overlay.

**Activation Code retired (2026-09-03).** The console no longer has a code concept — an order
just adds keys to a district's account.
- **Keys table:** the Access Key column is gone (also from `ENT_COLS` and `entSortVal`); the
  empty-row colspan dropped 9 -> 8. No `RWC-` string appears anywhere in the UI.
- **Code detail -> Account Detail:** the `<h1>` shows the **district name** (was the code),
  subtitle "Account detail", breadcrumb "Account Detail". `page-codeDetail.dataset.code` was
  the code string and is now **`dataset.rcid`** (the internal id) — `refreshKeyLists()` looks
  the record up by id, so per-key editing no longer depends on a visible key.
- **Both order paths report the same thing:** what was added and when it expires. Neither
  shows a code; `gc-resultActions` (Copy All / Send Email to District Admin) is removed.
- **The Send Activation Code page is retired** — `page-sendEmail`, its whole JS block,
  `openSendEmailPage`, `copyAllGenerated`, `emailAllGenerated` and the recipient helpers are
  all gone. Nothing is sent to a district when keys are added.
- `RC_TYPE_LABEL/BADGE/TOOLTIP` deleted (unreferenced since the Type column went).
- ~30 copy strings reworded off the code onto the account (login bullets, Keys description,
  create-district hints, replacement notes, hardware tooltips, toasts).
- **`rc.key` / `genRedemptionCode()` remain internally** as the id that links seat and hardware
  keys to an account (`codeId`). `state.redemptionCodes` is effectively the account-keys
  record now. It is never displayed — if it resurfaces in the UI, that's a regression.
- **TRAP:** removing a result-panel element left two
  `document.getElementById('gc-resultActions').style.display` calls behind, which threw on
  every order submit. When deleting markup, grep for `getElementById` on that id.

**Status retired + Cancel bug fixed (2026-09-03, final).**
- **Active / Renewed status removed everywhere** — Keys table column, the All/Active/Renewed
  pills, the Account Detail badge, `RC_STATUS_LABEL/BADGE/TOOLTIP`, `entTypeFilter` /
  `setEntTypeFilter` and the pill counters. Once the Activation Code went, "Renewed" only
  meant "topped up at some point", which carried no operational meaning. Columns are now
  Account ID · District · District Email · AI Seats · HW Units · Issued.
- **BUG — the per-key Cancel silently did nothing.** `editableField`'s Cancel called
  `refreshKeyLists()`, which resolves the record from `page-codeDetail.dataset.rcid`. The same
  rows are also rendered on the Add Keys result page (`renderGcHwKeys`), where that lookup
  returns nothing and the handler bailed. Cancel is now **`closeKeyFieldEdit(kind,id,field)`** —
  pure DOM, no lookup, no re-render — so it works wherever the row is drawn. `refreshKeyLists`
  also falls back to `currentGenCodeId` and only calls renderers whose containers exist.
  General rule: a shared row renderer must not assume which page it is on.

**Account Detail section order + seat grouping (2026-09-03).**
- Section order is now **Account Activity · Seats allocated to educators · AI Seat Keys ·
  Hardware Keys** — the summaries first, the long key lists last.
- Labels dropped "issued with this code" -> **AI Seat Keys** / **Hardware Keys**.
- **The seat list is grouped by expiry date**, matching how hardware keys already grouped
  (`Expires Aug 1, 2027 — 38 keys`). Groups are built inside `renderCdSeatList` from the
  rendered slice, so the `CD_SEAT_PAGE = 50` cap still applies across all groups combined.

**Still prototype-only:** nothing here talks to the backend. All state is in-memory and
resets on reload; there is no entitlement API behind it (see the Products/entitlement
notes above — `P2` is the same missing data model).

---

## Follow-up / backend work to finish (tracked)

- **Educator "Preview Simulation" — needs a real preview session + a tamper-proof
  limit (requested 2026-09-01; FE scaffold done).** The details-page Preview flow
  (button + two-step confirm + `utils/previewAttempts.ts` + `PreviewSimulationModal`,
  see the *Educator "Preview Simulation"* note above) is **fully built on the
  frontend**, but two pieces require backend / student-app support to be real:
  1. **A no-store preview session.** Today the FE only `window.open`s
     `${STUDENT_APP_URL}?simulationId=…&mode=practice&preview=1`. Needs a defined
     **educator-preview launch contract** (endpoint or URL scheme) that (a)
     authenticates via the educator's login (no student access code), (b) forces
     **Practice mode**, and (c) **stores no report/transcript** — the educator can
     view the report/transcript live during the attempt but must not be able to
     retrieve it afterward from anywhere. When that exists, replace the placeholder
     launch URL in `Simulationdetail.tsx#handleStartPreview`.
  2. **A tamper-proof 3-attempt cap.** The count is currently a **soft,
     per-browser localStorage guard** (`rw_edu_preview_<userId>_<simId>`,
     `MAX_PREVIEW_ATTEMPTS = 3`) — clearable by the user and not synced across
     devices. A hard limit needs a **backend counter** tied to the educator + sim;
     swap `getPreviewsRemaining`/`consumePreview` to read/write that instead of
     localStorage once available.
  - Also revisit `STUDENT_APP_URL` (currently the same placeholder host as the
    Sidebar link, `tutorpatient.realityworksai.com`) — point it at the real
    student-app preview entry.

## Known issues found while testing

- **"AI Seats Required" badge ≠ actual charge — STILL OPEN after the 2.1.0
  upgrade (re-verified 2026-08-26).** An earlier note in this file called it
  "resolved as version skew". **That was wrong — verified against 2.1.0 on both
  sides.** What 2.1.0 actually changed: it *added* `avatarEnabled` as an extra
  OR-condition in `requiresAiSeats()` (`class-simulation.service.ts:49`) but did
  **not** remove the category-string fallback, which is still evaluated *first*
  (lines 42-45). So:
  - **Badge** (`utils/simulationType.ts:23`) is `avatarEnabled === true`. All 21
    synced simulations have `avatarEnabled = false` (0 true, 0 null) → **nothing
    is badged.**
  - **Charge** still matches on unit category. 14 of 24 units are `"AI Only"`,
    and all 21 active scenarios live in those units → **all 21 charge a seat.**

  Net: **0 badged, 21 charging — the same mismatch as before.** The upgrade added
  the right signal but the data was never backfilled, so the fallback still wins.
  Fixing it needs `avatarEnabled` backfilled to `true` on the AI scenarios *and*
  the category fallback removed, or the two signals will keep disagreeing.
- **Scores above 100% are displayed as-is.** A real Assessment rendered
  **115.5%** and **"Exceptional"** in this UI. The cause is server-side (an
  AI-generated rubric score overriding the deterministic one — see
  `D:\student-app\CLAUDE.md`), but note the frontend applies no sanity bound, so
  an impossible score reaches the educator unchallenged. Worth deciding whether
  the UI should flag out-of-range values even after the backend is fixed.
- **Badge can contradict its own content.** Clinical Documentation has been seen
  showing **NEEDS IMPROVEMENT** while the same panel states "All mandatory
  documentation requirements were met" with 2 strengths, **0 weaknesses** and no
  recommendations. The badge follows the numeric score (50); the narrative comes
  from the model. They disagree.
- **Rate limiting affects students, not educators.** Educator/admin requests are
  throttled *per user* (5/sec) and are unaffected. The 3/sec **per-IP** limit hits
  the student app's public routes — so if a teacher reports "the codes don't
  work", suspect throttling rather than bad codes. Details in the backend
  `CLAUDE.md`.

## Testing against this app

Reports generated by the automated harness (`D:\local-services\llm-test-harness`)
appear here as normal student attempts. As of 2026-08-10 there are ~103 reports
from today spanning roughly **12 → 115.5**, across five scenarios and four
deliberate quality tiers (poor / average / good / exceptional) — a usable range
for calibrating report wording and thresholds.
