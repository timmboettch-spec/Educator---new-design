---
paths:
  - 'src/common/**'
---

# Rules: `src/common/`

Extends root `CLAUDE.md`. Scope: `constants/`, `interfaces/`, `utils/`, `messages/`, `i18n/en/`.

## Core rule: one file per feature

Files are per **domain/feature** (`class`, `student`, `simulation`, `unit`), never per sub-feature, endpoint or ticket.

1. **Search first**: `ls src/common/{constants,interfaces,utils,messages}/` or grep the folder's `index.ts`.
2. **Exists → extend it.** Put sub-features in nested groups (`ClassConstants.TRANSFER`, `CLASS_MSG.TRANSFER`).
3. **Missing → create** `<feature>.<constants|interface|util>.ts` and re-export it from `index.ts`.
4. **Never** create slice files (`class-transfer.constants.ts`, `class-list.interface.ts`) next to an existing `class.*` file.
5. A separate domain (own module or bounded context in `CONTEXT.md`) gets its own file.
6. **Legacy** slice files (e.g. `simulation-report-listing.*`): don't copy the pattern, and don't merge them in unrelated changes.

```ts
// ✅ class.constants.ts
export const ClassConstants = { /* existing */ TRANSFER: { MAX_STUDENTS_PER_REQUEST: 100 } };
// ❌ class-transfer.constants.ts
export const ClassTransferConstants = { MAX_STUDENTS_PER_REQUEST: 100 };
```

## Messages (core rule applies, plus the following)

- **Pairing:** `messages/<ns>.message.ts` ↔ `i18n/en/<ns>.json`. Create, edit and add keys to both together in the same change.
- **Value format:** `'<ns>.<JSON.PATH>'`, e.g. `AUTH_MSG.EMAIL_EXISTS = 'auth.EMAIL_EXISTS'` ↔ `auth.json` → `"EMAIL_EXISTS"`.
- **Generic messages first:** use `SUCCESS_MSG.COMMON`, `ERROR_MSG.COMMON | DB | SERVER` and `VALIDATION_MSG`. Prefer parameterized keys like `SUCCESS_MSG.COMMON.CREATED('class')` or `ERROR_MSG.DB.NOT_FOUND('student')` over new keys.
- **Feature messages:** add to `<feature>.message.ts` (`<FEATURE>_MSG`) and nest sub-features, e.g. `CLASS_MSG.TRANSFER.X` ↔ `"TRANSFER": { "X": ... }`.
