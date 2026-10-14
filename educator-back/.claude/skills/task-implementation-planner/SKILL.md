---
name: task-implementation-planner
description: Turns a task/feature title (e.g. "Add multi-tenancy support", "Implement rate limiting on the API", "Migrate notifications to a queue") into a concrete implementation plan by first exploring the actual codebase — existing architecture, conventions, and related modules — then producing a written plan with alternative approaches, trade-offs, a file-by-file change list, and a step-by-step task breakdown, with explicit attention to modularity, scalability, and best practices. Always use this skill when the user gives a task title or feature name and asks to "plan", "figure out how to implement/build/add this", "how should I approach this", "break this down", or wants a design/implementation plan before writing code — even if they just paste a short ticket title with no other detail. Requires repo access (Claude Code) to explore the codebase; do not use for tasks with no codebase to explore (pure greenfield brainstorming) or for auditing already-written changes (use regression-diff-audit for that instead).
---

# Task Implementation Planner

Turn a task title into a grounded implementation plan — grounded meaning every recommendation is tied to something you actually found in the codebase (an existing pattern, a specific file, a real constraint), not generic advice that could apply to any repo.

## Step 0: Scope the task before touching the codebase

Read the task title (and any description given) and check whether it's precise and narrow enough to plan directly, or whether it's the kind of title that hides real decisions.

**Ask clarifying questions before planning** whenever any of these are true — this is the default, not an edge case:

- The title implies a scope decision that materially changes the plan (e.g. "add multi-tenancy" — per-schema? per-row? per-database? "add rate limiting" — per-user? per-IP? per-API-key? global?)
- There's an implicit non-functional target that changes the design (expected scale/load, latency budget, deadline/MVP-vs-full tension)
- It could touch multiple independent systems and you don't know which ones are in scope
- There's a natural "do we already have half of this" question (check for existing partial implementations before asking, per Step 1, but if still unclear after that — ask)

Use a small, sharp set of questions (2–4), not an open-ended interview — e.g. "Should this apply per-tenant or globally?", "Is this for the REST API, the internal gRPC service, or both?", "Any specific scale target (requests/sec, data volume)?" Only skip this step when the task is already a precise, narrow, self-contained spec (e.g. "add a `deletedAt` soft-delete column to the `orders` table and filter it out of the default query") — in that case state your understanding in one line and proceed directly.

## Step 1: Explore the codebase — don't plan blind

Run the exploration scripts before drafting anything. A plan written without this step is generic advice, not a plan for _this_ codebase.

```bash
bash scripts/repo_overview.sh
```

Gives you: language/framework/stack, top-level directory structure, dependency manifest highlights, test framework, linter/formatter config, CI setup, and any existing architecture docs (`ARCHITECTURE.md`, `docs/`, ADRs) — read those docs if found, they may already encode decisions you should follow.

```bash
bash scripts/search_related.sh "<keyword1>" "<keyword2>" ...
```

Derive 3–6 keywords from the task title (domain terms, not stop words — "rate limiting" → `rate`, `limit`, `throttle`; "multi-tenancy" → `tenant`, `organization`, `workspace`). This finds:

- Existing code that already does something similar (don't reinvent a pattern that exists three files over)
- Related but incomplete work (half-built features, TODOs, feature flags referencing this area)
- Relevant tests that show expected behavior/interfaces for adjacent code

```bash
bash scripts/detect_conventions.sh
```

Surfaces the repo's actual conventions so the plan follows them rather than inventing new ones: typical module layout (e.g. controller/service/repository, feature-folders, hexagonal ports/adapters), file naming, error-handling pattern, logging approach, config/env pattern, and how existing modules are typically tested.

Read the actual files these scripts point to (don't just skim script output) — you need real code in front of you to reason about how new code should fit in.

## Step 2: Draft alternative approaches

Produce **2–3 genuinely distinct approaches**, not the same approach with cosmetic differences. Distinct means they differ in at least one of: where the logic lives, what's persisted vs computed, sync vs async, what's added vs what's reused. For each:

- **What it is** (2-4 sentences)
- **How it fits the existing architecture** (does it follow conventions found in Step 1, or deviate — and why)
- **Modularity**: does it introduce a clean, testable boundary, or does it entangle unrelated concerns / spread logic across layers?
- **Scalability**: how does it behave as load/data/tenants grow — where's the bottleneck, and at what point would it need revisiting?
- **Effort/complexity**: rough size (small/medium/large) and what makes it larger or smaller
- **Risk**: what's most likely to go wrong or need rework later

Then **recommend one**, with a one-paragraph rationale that explicitly references the trade-offs above — never recommend without saying what you're giving up by not picking the alternatives.

## Step 3: Break down the recommended approach

For the chosen approach, produce:

1. **Architecture summary** — the new/changed components and how they connect. Use a short Mermaid diagram (```mermaid fenced block, e.g. `graph TD` or `sequenceDiagram`) when there are non-trivial interactions between 3+ components; skip the diagram for simple linear changes where prose is clearer.
2. **Data model changes** — new/changed schema, fields, migrations, and backward-compatibility notes if data already exists in production.
3. **Interface changes** — new/changed API routes, function signatures, events/messages, or config keys — anything another part of the system or an external caller will depend on.
4. **File-by-file plan** — every file to create or modify, each with: path, new or modified, one-line purpose. Group by "new" vs "modified" so the size of the change is obvious at a glance.
5. **Step-by-step task list** — ordered, checkbox format, each step small enough to be a sensible unit of work/commit (aim for steps a developer could each finish in under a couple hours). Order for safety: foundational/shared pieces first, then features built on top, then integration, then cleanup — not alphabetical or file-order.
6. **Modularity notes** — the specific boundaries/interfaces this design relies on (e.g. "the rate limiter is injected as an interface so the storage backend — Redis vs in-memory — can be swapped without touching call sites").
7. **Scalability notes** — the specific load assumption this design is built for, and the specific next step if that assumption is exceeded (e.g. "fine to ~10k tenants on a single Postgres schema-per-tenant setup; beyond that, revisit sharding by tenant_id").
8. **Best-practices checklist** — concrete, not generic: error handling for the new failure modes this introduces, logging/observability for the new code paths, security considerations specific to this change (authz on new endpoints, input validation, secrets handling), and config/feature-flagging if a staged rollout makes sense.
9. **Testing strategy** — what needs unit vs integration vs end-to-end coverage, referencing the test framework/conventions found in Step 1, and which existing tests might break or need updating.
10. **Risks & open questions** — anything you couldn't resolve from the codebase alone and should be confirmed with the user or team before starting.

Every item in 1–9 must trace back to something concrete: a file you read, a convention you detected, or an explicit answer from Step 0 — not boilerplate advice. If you genuinely don't have a repo-specific reason for a checklist item, cut it rather than pad the list.

## Step 4: Save and present the plan

Save the full plan as markdown to `./plans/<task-slug>-<YYYYMMDD-HHMMSS>.md` in the repo (create the `plans/` directory if it doesn't exist; derive `<task-slug>` from the task title, lowercase-hyphenated). Use `references/plan-template.md` as the structural template so output is consistent across runs.

Don't ask permission to create the file — that's the expected output of this skill — but mention in your reply that you created the `plans/` directory in case the user wants it `.gitignore`d or placed elsewhere.

Then reply inline with a condensed version: the task as scoped, the recommended approach in a couple sentences, the alternatives considered (one line each with why not chosen), and the file path — not the entire plan re-typed into the chat. The saved file is the full detail; the chat reply is the summary someone can act on immediately.

## Strictness rules

- Never propose an approach the codebase's existing stack can't actually support (e.g. don't suggest a message queue if there's no queue infra anywhere and adding one wasn't discussed) without explicitly flagging it as "requires new infrastructure" and naming that as a trade-off.
- Never present a single option dressed up as alternatives — if you can only find one reasonable approach, say so and explain why the obvious alternatives don't hold up, rather than padding with strawmen.
- Never skip Step 1 exploration because the task "sounds simple" — simple-sounding tasks (e.g. "add a field") are exactly where existing conventions and hidden constraints (migrations, caching, denormalized copies of that field elsewhere) get missed.
- If the repo has no tests at all for the area being touched, say so explicitly in the testing strategy section rather than silently assuming coverage exists.
- If exploration surfaces an existing half-built or abandoned attempt at this task, surface it prominently — don't bury it — since it changes the plan (extend vs. replace vs. remove first).
