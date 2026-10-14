# Using the PR Review Skill

A Claude Code skill that reviews a PR's diff against its Jira ticket and this repo's
coding conventions (`CLAUDE.md`, `.claude/rules/*.md`), then returns a structured findings
report before you merge. Lives at `.claude/skills/pr-review/SKILL.md`.

## Before you start

1. **Have two things ready:**
   - The Jira ticket text (paste, link, or ticket ID).
   - The PR — number, branch name, or GitHub link.

   The skill will ask you for whichever one you don't supply. If there's no ticket, say so
   explicitly — it'll skip Jira-coverage scoring rather than guess.

2. **Check `gh` CLI access.** The skill fetches PR data via the GitHub CLI. If your token
   can't reach the org (SSO/identity mismatch is a known failure mode), it falls back to
   `git diff` against the base branch locally instead — mention it if that happens so the
   review doesn't stall silently waiting on `gh`.

## Steps

1. **Trigger the skill.** Type `/pr-review` in Claude Code, or ask in plain language —
   "review PR #776 against RE-100", "review this PR", "check this against the ticket". Any
   of these trigger it.
2. **Give it the Jira ticket and the PR.** Paste the ticket description (or link/ID) and the
   PR number/branch/link.
3. **Let it work.** It fetches the diff, sanity-checks the ticket text itself (AI-drafted
   tickets can be vague or stale), checks the diff against every rule in `CLAUDE.md` and
   `.claude/rules/*.md`, checks test coverage, and does a correctness pass that traces real
   example values through the changed logic — not just whether the right function/column is
   referenced.
4. **Read the report** (see shape below).
5. **Answer its follow-up question.** It will ask for anything it couldn't fetch itself — PR
   review comments/discussion, and any Jira comments that amend the original ticket. This
   matters most for anything scored **Ambiguous** — paste what resolves it and it'll
   re-score just that part rather than regenerate the whole report.

## What you get back

A structured report, most important first:

1. **Summary** — ready to merge, needs changes, or blocked, in 2-3 sentences.
2. **Jira Coverage Table** — each acceptance criterion scored Done / Partially Done /
   Missing / Not Applicable / Ambiguous, with the file:line implementing it.
3. **Convention Violations** — file:line, the specific rule broken, suggested fix.
4. **Correctness/Security Findings** — file:line, the bug, a concrete failure scenario,
   suggested fix.
5. **Test Coverage Gaps** — including whether existing tests actually prove behavior, or
   only that a mock was called with the expected arguments.
6. **Suggested Diff/Changes** — ready-to-apply patches for the top issues.
7. **Minor Notes** — style-only items, lowest priority.

## Good to know

- **It's skeptical on purpose.** The skill won't take the Jira ticket text or the PR
  description's own claims ("sorts correctly," "no behavior change") at face value — it
  re-derives them from the actual code and schema. Expect it to occasionally disagree with
  what a ticket or PR description says, and to say so explicitly.
- **It only reviews backend code.** Frontend/mobile/other-repo criteria in a bundled ticket
  are scored Not Applicable, not graded as missing.
- **It's not a rubber stamp.** "Ready to merge" in the summary still means read the
  findings — the report is meant to speed up review, not replace judgment on anything
  genuinely ambiguous.

## Improving the skill

The skill is an evolving checklist, not a fixed tool. If it misses a real bug class during
a review, that's a signal the skill itself needs a rule added — not just a one-off review
comment. Flag it so `.claude/skills/pr-review/SKILL.md` gets updated for everyone.
