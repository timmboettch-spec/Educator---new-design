# Contributing to Educator-App-Realityworks

This document defines the branching strategy, developer workflow, and pull request standards for this repository. It is derived from the company-wide _SDLC Development Workflow (V1 — Current State)_ and applies to all contributors.

The goal is **predictability over rigidity**: just enough structure to enable parallel sprints, clean QA, and traceable production releases.

---

## 1. Branch Structure

### Long-lived branches

| Branch | Purpose            | Deploys to |
| ------ | ------------------ | ---------- |
| `main` | Production-ready   | prod       |
| `qa`   | QA / staging       | qa         |
| `dev`  | Integration branch | dev        |

These already exist. Do **not** rename or delete them.

### Working branch naming

| Type        | Pattern                          | Example                             | Branches from |
| ----------- | -------------------------------- | ----------------------------------- | ------------- |
| Feature     | `feature/{ticket}-{description}` | `feature/rwai-432-class-management` | `dev`         |
| Bug (QA)    | `bugfix/{ticket}-{description}`  | `bugfix/rwai-456-login-issue`       | `qa`          |
| Bug (dev)   | `fix/{ticket}-{description}`     | `fix/rwai-789-null-check`           | `dev`         |
| Hotfix      | `hotfix/{ticket}-{description}`  | `hotfix/prod-42-dashboard-failure`  | `main`        |
| Chore       | `chore/{description}`            | `chore/update-deps`                 | `dev`         |
| DevOps / CI | `devops/{description}`           | `devops/ci-lint`                    | `dev`         |
| Docs        | `docs/{description}`             | `docs/update-architecture`          | `dev`         |

**Rules:**

- Always include a ticket ID when one exists.
- Lowercase with hyphens only — no underscores.
- Keep descriptions short (3–5 words).
- Delete merged working branches.

### Hierarchy

```text
main
 ├── hotfix/{ticket}-{description}
 └── qa
      ├── bugfix/{ticket}-{description}
      └── dev
           ├── feature/{ticket}-{description}
           └── fix/{ticket}-{description}
```

---

## 2. Promotion Strategy

### Regular cadence

| Promotion           | Frequency / Trigger                   | Who initiates           |
| ------------------- | ------------------------------------- | ----------------------- |
| `feature/*` → `dev` | As completed (PR approved + CI green) | Developer / PR reviewer |
| `dev` → `qa`        | Weekly (Thursdays recommended)        | Tech Lead               |
| `qa` → `main`       | After QA signoff                      | Tech Lead + QA team     |

**Suggested calendar:**

- **Mon–Wed:** development; PRs merged to `dev`
- **Thu AM:** `dev` → `qa` promotion PR
- **Thu–Fri:** QA testing
- **Mon:** `qa` → `main` if signed off

### Hotfix flow (bypasses cadence)

| Situation       | Flow                         | Timeline  |
| --------------- | ---------------------------- | --------- |
| Production down | `hotfix/* → main → qa → dev` | Immediate |
| Security issue  | `hotfix/* → main → qa → dev` | Immediate |
| Critical bug    | `hotfix/* → main → qa → dev` | Same day  |

Hotfixes **must** be back-merged to `qa` and `dev` after merging to `main`.

---

## 3. Sprint Workflow

### Step 1 — Create a feature branch

```bash
git checkout dev
git pull origin dev
git checkout -b feature/{ticket}-{description}
```

### Step 2 — Commit

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <description>
```

Examples:

```text
feat(dashboard): add class metrics summary
fix(auth): resolve token refresh issue
chore: update dependencies
```

**Allowed types:** `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `perf`, `build`, `ci`, `revert`.

### Step 3 — Open a PR

When the feature is complete:

```text
feature/{ticket}-{description} → dev
```

---

## 4. Merge & PR Rules

### Merge strategy

| PR flow                   | Merge type             | Approvals            |
| ------------------------- | ---------------------- | -------------------- |
| `feature` / `fix` → `dev` | Merge commit or squash | 1 reviewer + CI pass |
| `dev` → `qa`              | Merge commit           | 1 reviewer + CI pass |
| `qa` → `main`             | Merge commit           | QA Lead + CI pass    |
| `bugfix/*` → `qa`         | Merge commit           | 1 reviewer           |
| `hotfix/*` → `main`       | Merge commit           | 1 reviewer           |

### PR guidelines

- Keep PRs **under 400 lines** of diff where practical.
- Self-review before requesting approval.
- Attach screenshots for UI changes.
- Always pull latest `dev` (or target branch) before requesting review.
- **No force pushes** to shared / protected branches.

---

## 5. Branch Protection

| Branch | PR required | Approvals | CI required |
| ------ | ----------- | --------- | ----------- |
| `dev`  | ✅          | 1         | ✅          |
| `qa`   | ✅          | QA Lead   | ✅          |
| `main` | ✅          | QA Lead   | ✅          |

---

## 6. Platform Integration

Educator-App-Realityworks is the educator portal frontend for the Realityworks AI platform. It integrates with:

| Component                                                                       | Integration                                                  |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [Educator-App-Backend](https://github.com/Realityworks-AI/Educator-App-Backend) | REST API for all data operations                             |
| [HS-online-AI-app](https://github.com/Realityworks-AI/HS-online-AI-app)         | Shares simulation catalog and student reports via Azure Blob |

### Shared Data

The Educator App reads simulation content and student reports from the same Azure Blob Storage (`json-data` container) used by HS-online-AI-app:

- `units.json` — Learning units
- `scenarios.json` — Patient scenarios
- `reports.json` — Student simulation reports (written by HS-online-AI-app)

---

## 7. Summary Workflows

**Sprint:**

```text
feature/{ticket}-{description} → dev → qa → main
```

**Bugfix from QA:**

```text
qa → bugfix/{ticket}-{description} → qa → dev   (back-merge)
```

**Hotfix:**

```text
main → hotfix/{ticket}-{description} → main → qa → dev   (back-merge)
```

---

## 8. Quick Reference

- `feature/*` branches start from `dev`.
- `bugfix/*` branches start from `qa`.
- `hotfix/*` branches start from `main` and **must** back-merge to `qa` and `dev`.
- Protected branches require PRs.
- Always pull latest changes before branching.
- PR approvals are mandatory.
- Delete merged working branches.
- No force push.

---

_Source: `SDLC_Development_Workflow - V1 (Current State).docx`. Refer to that document for the full corporate workflow policy._
