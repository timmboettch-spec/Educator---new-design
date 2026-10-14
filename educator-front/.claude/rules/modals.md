---
paths:
  - 'src/**/*Modal*.tsx'
  - 'src/**/*modal*.tsx'
  - 'src/**/*Dialog*.tsx'
  - 'src/components/modal/**'
  - 'src/pages/**/*.tsx'
  - 'tests/**/*Modal*.test.tsx'
  - 'tests/**/*modal*.test.tsx'
---

# Modal rules

Applies when creating, changing, or opening a modal. Follows the project standards in `CLAUDE.md`; where this file is more specific, it wins for modals.

## 1. Use the shared building blocks

| Need                                                      | Use                                                        |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| Any modal frame (portal, focus trap, Escape, scroll lock) | `src/components/ui/Modal.tsx`                              |
| A modal whose main content is a form                      | `FormModal` — `src/components/modal/FormModal.tsx`         |
| A delete / destructive-action confirmation                | `ConfirmDialog` — `src/components/modal/ConfirmDialog.tsx` |

- Never hand-roll an overlay (`fixed inset-0 ...` + `createPortal`) — always go through `ui/Modal` so focus trapping, Escape-to-close, focus restore and scroll lock stay consistent.
- Don't rebuild the Back / Submit footer, the `<form id>` + `form="..."` wiring, or the hidden Enter-to-submit button inside a feature modal — `FormModal` already does this.
- Don't write a new bespoke delete modal (`DeleteXModal.tsx`) — use `ConfirmDialog`. If the design genuinely needs to differ, extend `ConfirmDialog` with a prop rather than forking it.
- Don't use or extend the legacy `src/components/modal/ConfirmationModal.tsx` (hardcoded logout icon, local English→Spanish map) for new destructive confirmations. Its existing call sites stay until explicitly migrated.

## 2. One modal, one job

- A new modal handles one task (e.g. create/edit a class). Don't add `delete`/`assign`/`view` branches to a form modal via a `modalMode` switch.
- Create and edit of the same entity may share one form modal, since they share fields and schema.
- Existing multi-mode modals (`Classformmodal.tsx`, `CreateSchoolModal.tsx`, `CreateEducatorModal.tsx`) are legacy — don't add new modes to them.

## 3. Forms inside modals

- Formik (`useFormik`) + Yup, matching the rest of the repo.
- The validation schema lives in `src/schemas/<name>.schema.ts` (never inline in the component). When messages need translation or rules depend on props, export a factory, e.g. `getClassFormSchema({ t, modalMode, ... })`. Shared schema helpers go in `src/utils/schema-utils/`.
- Wire `FormModal` with `onSubmit={formik.handleSubmit}` and `isSubmitting={formik.isSubmitting}`; use `isSubmitDisabled` for extra blockers (e.g. a file still validating).
- Give each form a stable, kebab-case `formId` (e.g. `class-form`). E2E tests may select the submit button by `form="<formId>"`, so don't rename an existing id without updating `tests/e2e`.

## 4. Copy & i18n

- All modal text — titles, messages, button labels, loading labels, validation messages — comes from `useTranslation()` against the `src/i18n` namespaces (CLAUDE.md §15). `FormModal` and `ConfirmDialog` have no default text on purpose; always pass translated strings.
- Add new keys to both `en/` and `es/` locale files.

## 5. Open / close state

- Open/closed state and the selected item are local UI state: `useState` in the component that opens the modal (CLAUDE.md §4). Don't put modal visibility in Redux.
- The close handler resets the modal's local state (form, file inputs, errors) before calling `onClose`, so reopening starts clean.
- Disable the confirm/submit button while the related request is in flight (`isLoading` / `isSubmitting`) to prevent double submits.

## 6. Files & naming

- File and component name: `PascalCase` ending in `Modal` or `Dialog` (e.g. `TransferClassModal.tsx`, `ConfirmDialog.tsx`); the filename matches the exported name exactly.
- Named exports for new modals (CLAUDE.md §3).
- Reusable, feature-agnostic modals → `src/components/modal/`. Feature-specific modals → the feature's component folder (e.g. `src/components/class/`).
- Legacy lowercase names (e.g. `Classformmodal.tsx`) stay as-is unless explicitly migrated; avoid case-only renames (CLAUDE.md §1, rule 9).

## 7. Tests

- Tests live under `tests/`, mirroring `src/` (e.g. `tests/components/modal/ConfirmDialog.test.tsx`).
- Query by role/label (`getByRole('button', { name: ... })`, `queryByRole('dialog')`), not by class names.
- Cover: renders nothing when closed, confirm/submit calls the handler, Back calls `onClose`, loading/submitting disables the action.
- If you change a modal's props, update the page tests that `vi.mock` that modal (e.g. `tests/unit/class/ClassManagement*.test.tsx`).
