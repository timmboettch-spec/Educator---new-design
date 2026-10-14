---
name: pr-review
description: Review a PR's diff against its Jira ticket and this repo's coding conventions (CLAUDE.md, .claude/rules/*.md). Use when the user wants a PR reviewed for correctness, Jira coverage, convention compliance, or wants a structured review report before merging. Triggers on "review this PR", "review the diff", "check this PR against the ticket", or /pr-review.
---

# PR Review

Senior-code-reviewer pass for this repo (Educator-App-Backend, NestJS). Checks a PR's diff
for correctness, completeness against its Jira ticket, and adherence to this repo's
conventions in `CLAUDE.md` and `.claude/rules/*.md`.

## Scope — backend only

This skill only reviews backend (NestJS, this repo) work. Tickets can bundle frontend,
mobile, or other-repo work (e.g. `HS-online-AI-app`) alongside the backend task:

- Only treat the backend-relevant acceptance criteria as in-scope for the Jira Coverage
  check (Step 2). Score any frontend/other-repo criterion **Not Applicable — non-backend**
  rather than Done/Missing, and don't count it as a gap in this review.
- Only evaluate diff hunks that live in this repo. If the PR somehow includes non-backend
  files, note that they're outside this review's scope rather than reviewing them against
  backend conventions.
- If it's unclear whether a criterion is backend or not (e.g. an API contract change that
  implies frontend work too), say so and review only the backend half explicitly, rather
  than silently skipping or silently reviewing the whole thing.

## Step 0 — Gather inputs (ask before doing anything else)

Do not fetch a diff or start reviewing until you have both of these. If `args` (or the
user's message) already supplies one or both, don't ask again for what's already given —
only ask for what's missing.

1. **Jira ticket** — the full description / acceptance criteria (paste, link, or ticket ID
   you can look up via a configured Jira MCP/reference if one exists). If the user says
   there's no ticket, confirm explicitly that the Jira Coverage step should be skipped
   before proceeding. Tickets in this project are often AI-drafted and can be vague,
   generic, or out of date relative to what was actually agreed — treat the text as a
   starting point to reason about, not as ground truth to apply mechanically (see Step 2).
2. **PR identification** — PR number, and/or branch name, and/or GitHub link. Also confirm
   the base branch to diff against if it isn't the obvious one (`main`/`qa`/`dev` per
   `CONTRIBUTING.md`'s promotion model).

Use `AskUserQuestion` for this if the framing is a genuine choice (e.g. which base branch);
otherwise a plain question is fine. Do not guess a Jira ticket or PR number.

## Step 1 — Fetch the diff

```bash
gh pr view <PR_NUMBER> --json title,body,baseRefName,headRefName,commits
gh pr diff <PR_NUMBER>
```

Or, if reviewing a branch/commit directly: `git diff <BASE_BRANCH>...<HEAD>`.

For any file where the diff touches less than ~20% of the file, read the whole file (not
just the hunk) so you have full context on the surrounding conventions before judging it.

## Step 2 — Jira coverage check

Skip this section entirely if Step 0 confirmed there's no ticket.

**First, sanity-check the ticket itself**, before treating it as the checklist. AI-drafted
tickets can be vague, generic boilerplate, internally inconsistent, or already stale
relative to what the PR actually implements. Read it critically:

- Does each criterion say something specific and testable, or is it filler that could apply
  to almost any PR ("update the UI as needed", "handle errors appropriately")?
- Do any criteria contradict each other, or contradict what the PR's own title/body/commits
  (from `gh pr view`) say was built? A mismatch here is a signal worth surfacing, not
  silently resolving in either direction.
- Is anything clearly missing that you'd expect for this kind of change (e.g. validation,
  auth scoping, an edge case) but isn't mentioned in either the ticket or the PR?

If the ticket text is clear and consistent, proceed normally. If something is genuinely
ambiguous, contradictory, or looks stale, don't guess — ask the user to clarify before
scoring that criterion, or score it **Ambiguous** (see below) and say specifically what's
unclear so the user can confirm against the real ticket/acceptance criteria.

For each acceptance criterion / requirement in the Jira description:

- Mark it **Done / Partially Done / Missing / Not Applicable / Ambiguous**. Use Ambiguous
  when the ticket wording itself, not the code, is the source of uncertainty. Use Not
  Applicable for any criterion that's frontend/mobile/other-repo work per **Scope** above.
- Cite the specific file(s)/line(s) implementing it, or explain why it's missing.
- Flag scope creep: changes in the diff not traceable to any Jira requirement — but check
  first whether the PR body/commits explain the extra scope before calling it creep.

If any criterion was scored Ambiguous, say so explicitly in the Summary and name the open
question(s), so the reader knows the ticket text needs a human check, not just the code.

## Step 3 — Conventions check

Check the diff against `CLAUDE.md` and every file under `.claude/rules/`. Read those files
fresh rather than relying on memory — they change over time. As of this skill's writing,
key areas worth explicitly checking (not exhaustive — always defer to the actual current
contents of `CLAUDE.md`/`.claude/rules/*.md`):

- **Architecture** — domain logic lives under `src/<domain>/` with the usual
  module/controller/service/entity/dto/interfaces/constants split. Root `AppModule` code
  isn't conflated with `src/student-backend/` (which has its own `guards/`/`helpers/`/`data/`
  — never assume `src/common` applies there without checking for a local equivalent first).
- **`src/database/`** (if touched) — entities in `entities/` (re-exported via
  `entities/index.ts`); a concrete TypeORM repository class per entity in `repositories/`
  exposing typed methods only (no raw `Repository<T>` leaking to consumers); a DI token in
  `tokens.ts`; wiring in `database.module.ts`. No `contracts/` interface layer. No
  repository-local `interface`/`type` declarations (those belong in
  `src/common/interfaces/<name>.interface.ts`).
- **Entities under `src/database/entities/`** (see `.claude/rules/database-entities-rules.md`)
  — camelCase methods; every `@Column`/`@PrimaryGeneratedColumn` has an explicit snake_case
  `name` (except single-lowercase-word properties); required base columns present
  (`<entity>Id` uuid PK, `createdAt`/`updatedAt` timestamptz, `deletedAt` nullable
  timestamptz); any FK has a real relation decorator on **both** sides
  (`@ManyToOne`+`@JoinColumn` on the child, matching `@OneToMany`/`@OneToOne` on the parent),
  plus the plain scalar FK column retained; a matching response DTO exists at
  `src/database/response-dto/<entity>.dto.ts`, uses `implements Entity` (never `extends`),
  redeclares every field with `@ApiProperty`/`@ApiPropertyOptional`, and is re-exported from
  `response-dto/index.ts`.
- **Errors & validation** — new error messages use i18n keys (`ERROR_MSG`/`VALIDATION_MSG`
  from `src/common/messages/`), not the legacy `Messages` object. DTOs use `class-validator`/`class-transformer`; no manual re-validation in
  controllers (the global `ValidationPipe` already whitelists/forbids-unknown/transforms).
- **Types/constants** — no inline `interface`/`type` in services/controllers/utils/DTOs
  unless private to that file's own implementation detail (shared types belong in
  `src/common/interfaces/`). No standalone enums or bare top-level exported constants —
  grouped into `src/common/constants/<name>.constants.ts` as PascalCase `XxxConstants`
  objects with SCREAMING_SNAKE_CASE keys; enums are PascalCase in the same constants
  file/folder.
- **Naming & style** — variables/params camelCase everywhere; Prettier (single quotes,
  semicolons, trailing commas, 100-char width, 2-space indent); no `any`, no
  unhandled/floating promises (ESLint errors, not warnings); import aliases `@/*` and
  `src/*` both map to `src/` — match whichever style the file already uses, don't mix
  within one file.
- **Auth** (only if touched) — token issuance/cookie logic goes through `TokenService`
  (`generateTokens`/`setAuthCookies`/`clearAuthCookies`), not hand-rolled; token extraction
  via `src/common/utils/token-extractor.util.ts` helpers, cookie-first with
  `Authorization: Bearer` fallback.
- **Dependencies** — no new dependency added without checking `overrides` in
  `package.json` first (`multer`, `nodemailer`, `ws`, `undici`, `form-data`,
  `socket.io-parser`, nested `js-yaml` under `@nestjs/swagger` are pinned for security
  reasons).
- **Do-NOT list** — no hand-edits to `dist/`, no renamed/deleted `main`/`qa`/`dev`
  branches, no `.env` committed, no force-push implied by the diff.
- **Commit hygiene** — Conventional Commits format; branch name follows
  `feature/{ticket}-{description}` (or `bugfix/`, `hotfix/`) per `CONTRIBUTING.md`.

## Step 4 — Test & verification check

- Are there unit tests for new/changed logic (`tests/unit` or `src/**/*.spec.ts`)?
- If DB/entity/migration touched: integration test coverage present, and if a migration
  was added, does its `down()` look correctly reversible?
- If HTTP routes/controllers changed: e2e or `tests/api/modules/**` coverage?
- Note whether the PR description/commits mention having run `npm run lint`,
  `npm run build`, `npm run test:unit` (and `test:integration`/`test:e2e` if applicable).
- **Mechanism vs. behavior**: a test that mocks a dependency (e.g. `createQueryBuilder()`)
  and asserts a method was *called with* an expected argument only proves the code
  references the right thing — it never runs the real logic against real data, so it can't
  catch a wrong-type comparison, a bad join condition, or anything else that only shows up
  in the actual output (see Step 5). When a change is data-correctness-sensitive (sorting,
  filtering, aggregation, joins, calculations) and *all* its coverage is this mock-only
  kind, flag it as a Test Coverage Gap — tests passing isn't the same as behavior verified.

## Step 5 — Correctness / quality review

**Trace actual behavior, don't just confirm structure.** For each changed or added piece of
logic, pick 1-2 concrete example values implied by the diff and mentally run the code
against them to see the real output, rather than stopping once the right
function/column/branch is referenced — that's the same level a mocked test stops at
(Step 4). This is how you catch bugs that execute without error and would pass a mock-based
test.

Worked example: a diff adds sorting/filtering on a field. Check that field's *actual* SQL
type (open the entity; if `@Column` has no explicit `type`, check the migration, since
TypeORM defaults to `varchar`) and how existing call sites write to it. A field storing a
numeric count, duration, or date as text sorts **lexicographically, not
numerically/chronologically** — `'10'` sorts before `'9'`. The same trace-the-real-value
approach applies to any comparison, arithmetic, or aggregate: null-handling, timezone
conversion, floating-point precision, off-by-one pagination math, mismatched string formats.

Apply that same tracing to the usual bug categories: security (injection, auth bypass, XSS,
IDOR on educator/school/class/student scoping), N+1 queries, missing pagination bounds, and
logic that contradicts the stated Jira acceptance criteria.

Don't take behavior claims at face value, whether from the ticket (Step 2) or the PR
description/commits — "sorts correctly," "no behavior change" are claims to trace yourself,
not facts to relay in the report.

## Output format

Produce a structured report, most severe/important first:

1. **Summary** — 2-3 sentences: does this PR satisfy the Jira ticket, ready to merge,
   needs changes, or blocked? If any criterion was scored Ambiguous, say so here and name
   the open question(s) — flag plainly that the ticket text itself needs verifying against
   the real acceptance criteria, not just the code.
2. **Jira Coverage Table** — criterion | status | evidence/file:line (omit if no ticket)
3. **Convention Violations** — file:line | rule violated (cite the specific `CLAUDE.md`/
   rule-file clause) | suggested fix
4. **Correctness/Security Findings** — file:line | issue | concrete failure scenario |
   suggested fix
5. **Test Coverage Gaps** — what's missing, which test tier should cover it
6. **Suggested Diff/Changes** — concrete code suggestions for the top 3-5 issues, written
   as ready-to-apply patches where possible
7. **Minor Notes** (optional, lowest priority) — style-only items

Every finding must cite a file path and line number from the actual diff, not a generic
statement. Do not flag anything the diff doesn't actually contain.

## Step 6 — Post-report cross-check

Delivering the report above is not the end of the review. Immediately after it, ask the
user for two things that aren't visible from the initial `gh pr view`/diff fetch in Step 1:

1. **PR discussion** — any PR description edits, review comments, or discussion threads
   added after the PR was opened. Try fetching these yourself first:
   ```bash
   gh pr view <PR_NUMBER> --json comments,reviews
   gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments   # inline review comments
   ```
   Ask the user to confirm or supplement if this looks incomplete or `gh` access is
   unavailable.
2. **Jira comments** — any comments/updates on the ticket that clarify, amend, or supersede
   the original description. Ask the user to paste the relevant ones (or fetch via a
   configured Jira MCP/reference if one exists). Prioritize this for every criterion scored
   **Ambiguous** in Step 2 — that's exactly the information that resolves it.

If the user has nothing to add, say so and treat the report as final.

Otherwise, re-check the new information against the existing report:
- Re-score Jira Coverage (Step 2), especially anything Ambiguous, against the new comments.
- Re-check any Correctness/Security finding (Step 5) that a PR comment addresses, disputes,
  or explains.

Then output an **update**, not a full regeneration:
- Lead with **Changes from initial report** — a short list of what moved and why, e.g.
  "Criterion 3: Ambiguous → Done, per Jira comment from <date>: '<quote>'."
- Reprint only the sections that actually changed (updated Summary, updated Jira Coverage
  Table rows, updated/removed findings). Leave everything unaffected as-is rather than
  repeating the whole report verbatim.
