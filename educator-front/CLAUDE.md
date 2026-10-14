# Project Standards

Single-repo, single-project React application.

**Stack:** React 19 · Vite (client-side SPA, no SSR) · TypeScript (strict) · Tailwind CSS · Redux Toolkit (all app state — server data via RTK Query and `createAsyncThunk` + client state via slices) · Axios (HTTP client) · React Router v7 · Vitest + React Testing Library (unit/integration) · Playwright (E2E) · ESLint + Prettier · Husky + lint-staged

---

## 1. File Naming Conventions

| File type             | Convention                                                                                | Example                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Components            | `PascalCase.tsx`                                                                          | `UserCard.tsx`, `NavigationBar.tsx`                                                |
| Hooks                 | `camelCase.ts`, must start with `use`                                                     | `useAuth.ts`, `useDebounce.ts`                                                     |
| Utils / helpers       | `camelCase.ts`                                                                            | `formatDate.ts`, `apiClient.ts`                                                    |
| Types / interfaces    | `camelCase.types.ts`                                                                      | `user.types.ts`                                                                    |
| Constants             | `camelCase.ts`                                                                            | `constants.ts`                                                                     |
| Redux actions/thunks  | `PascalCase` + `Redux.ts` suffix, colocated per domain folder under `src/redux/<domain>/` | `src/redux/auth/LoginRedux.ts`, `src/redux/simulation/AddToLibraryRequestRedux.ts` |
| API service functions | `camelCase.api.ts`                                                                        | `user.api.ts`                                                                      |
| Form/modal schemas    | `camelCase.schema.ts`, all under `src/schemas/`                                           | `src/schemas/classForm.schema.ts`, `src/schemas/createSchool.schema.ts`            |
| Schema utils          | `camelCase.ts`, all under `src/utils/schema-utils/`                                       | `src/utils/schema-utils/dateRules.ts`                                              |
| Context providers     | `PascalCase.tsx`                                                                          | `AuthContext.tsx`                                                                  |
| Test files            | matches source + `.test`/`.spec`                                                          | `UserCard.test.tsx`                                                                |
| Style files           | matches source (if not Tailwind-only)                                                     | `UserCard.module.css`                                                              |
| Config/tooling files  | `kebab-case`                                                                              | `vite.config.ts`, `eslint.config.js`                                               |

> **Note:** New Redux action/thunk files should use the `PascalCase` + `Redux.ts` convention under `src/redux/<domain>/`. Existing legacy exceptions, such as `addsimulationredux.ts` and `Simulationdetailredux.ts`, remain unchanged unless explicitly migrated.

> **Note:** Every Yup validation schema for a form or modal goes in `src/schemas/` as its own file with a named export (e.g. `export const classFormSchema = Yup.object({...})`). Don't write new schemas inline in components or put them next to the component. Reusable helpers for building schemas (custom `.test()` rules, shared field builders, date-range checks) go in `src/utils/schema-utils/`. Schemas should build on the existing regexes/validators in `src/utils/validation.ts` instead of redefining them. Existing inline schemas (e.g. in `Classformmodal.tsx`, `CreateSchoolModal.tsx`, `CreateEducatorModal.tsx`, `EducatorModal.tsx`) stay where they are unless explicitly migrated.

### Recommended target folder structure (the current repository uses `src/redux` and `src/store/index.ts`)

```
src/
  components/
    UserCard/
      UserCard.tsx
      UserCard.test.tsx
      index.ts              // export { UserCard } from './UserCard'
  features/                 // feature-sliced: one folder per business domain
    auth/
      auth.slice.ts         // Redux Toolkit slice (state, reducers, extraReducers)
      auth.thunks.ts        // createAsyncThunk actions calling auth.api.ts
      auth.api.ts           // raw axios calls
      authSelectors.ts
      components/
      hooks/
  hooks/                    // cross-feature shared hooks
  api/
    axiosClient.ts          // shared, pre-configured axios instance (baseURL, interceptors)
    user.api.ts             // raw request functions (getUser, updateUser, ...)
  store/
    store.ts                // Redux store config
    rootReducer.ts
  routes/
  schemas/                  // all form/modal Yup schemas
    classForm.schema.ts
  types/
  utils/
    schema-utils/           // shared helpers used to build schemas
```

### Naming rules

1. **Variables & functions:** `camelCase`.
2. **Components, classes, interfaces, type aliases, enums, enum keys:** `PascalCase`.
3. **Enum names are singular** — `Role`, not `Roles`.
4. **Constants:** `SCREAMING_SNAKE_CASE` for true constants (e.g. `MAX_RETRIES`); `camelCase` for config objects.
5. **Booleans** read as questions: `isLoading`, `hasError`, `canSubmit`.
6. **Function naming (A/HC/LC pattern):** `[prefix?][action][high-context][low-context?]` — e.g. `getUser`, `getUserMessages`, `handleClickOutside`, `shouldDisplayMessage`.
7. Component filenames **match their exported name exactly** — no translation between file and JSX tag.
8. Never mix conventions within one category. Enforce via ESLint (`eslint-plugin-filenames` or custom rule), not memory alone.
9. Avoid case-only filename differences (breaks on case-sensitive Linux CI even if it works on macOS/Windows locally).

---

## 2. TypeScript

- `strict: true` in `tsconfig.json` — non-negotiable from day one.
- `noUncheckedIndexedAccess` is not currently enabled in `tsconfig.json`; enable it in a separate configuration change if this is a required project standard.
- **`vite build` does NOT type-check.** CI must run `tsc --noEmit` as its own step.
- No `any`. Enforce with `@typescript-eslint/no-explicit-any`. Use `unknown` and narrow it when the type is genuinely unknown.
- Avoid manual type assertions (`as`) except where truly unavoidable (e.g. narrowing a third-party type); never use them to silence a real type error.
- Prefer `interface` for object shapes; use `type` for unions, intersections, and mapped/utility types.
- Leverage inference — don't annotate what TypeScript can already determine.
- Distinguish `param?: T` (optional, may be omitted) from `param: T | undefined` (must be provided, may be undefined) — don't use the former just to save keystrokes when the value must always be passed.
- Use utility types (`Partial`, `Pick`, `Omit`, `Record`) instead of hand-rolling variants of existing types.
- Path aliases (`@/components/*`, `@/features/*`) must be defined identically in `tsconfig.json` (`paths`) and `vite.config.ts` (`resolve.alias`).

---

## 3. React Components

- Functional components + hooks only. No class components.
- One component, one responsibility. Break down UI into small, composable pieces (atomic-design-influenced: atoms → molecules → organisms → pages), but don't force every three-line JSX block into its own file.
- **Named exports**, not `default`, for components, hooks, and utils. Exception: lazy-loaded route components, where `React.lazy` requires a default export.
- Self-close components that take no children: `<Avatar />`, not `<Avatar></Avatar>`.
- Prefer fragments (`<>...</>`) over wrapper `<div>`s used only for grouping.
- Never use array index as a list `key` if the list can reorder, filter, or have items inserted/removed.
- Encapsulate data fetching and other non-presentational logic in custom hooks — components should stay focused on rendering.
- `useMemo` / `useCallback` / `React.memo` are applied deliberately after profiling, not defensively on everything. They have their own overhead.
- Colocate a component with its tests and (if any) its style module.
- **UI states need a design check.** Any view that loads data renders explicit **loading**, **empty** and **unavailable** (request failed) states, never a blank area. Before a UI PR leaves draft, compare each of these states (and the populated state) against the approved design, and include screenshots of them in the PR (see §12).

---

## 4. State Management

All app-wide state — server data and client state alike — lives in **Redux Toolkit**. Server data is fetched with **RTK Query** (below) or with `createAsyncThunk` (see "Thunk-based server state"). No other server-cache library (e.g. TanStack Query) is used.

### RTK Query

Each API domain gets its own folder, `src/redux/api/<domain>/`, with this structure:

```
src/redux/api/<domain>/
  <domain>.endpoints.ts   // relative URL constants and URL builders
  <domain>.types.ts       // BE contract: enums, request/response DTOs, response envelopes
  <domain>Api.ts          // createApi: endpoints, tags, generated hooks
  <domain>Slice.ts        // optional: client-only UI state (filters, sort, pagination)
  <domain>Service.ts      // pure helpers: params/body builders, error-message reader
```

| File                    | What goes in it                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<domain>.endpoints.ts` | Relative URL constants (`GET_X = '/api/x'`) and builders for path params (``xById = (id: string) => `/api/x/${id}` ``). No base URL — the shared axios instance adds it.                                                                                                                                                     |
| `<domain>.types.ts`     | Types copied from the BE OpenAPI spec (`/api-docs-json`), named after the BE schemas: `*ReqDto` (request), `*ResDto` (payload), `*ResponseDto` (the `{ message, data, meta? }` envelope). Keep BE casing (camelCase).                                                                                                        |
| `<domain>Api.ts`        | One `createApi` per domain with a unique `reducerPath` (`<domain>Api`) and its `tagTypes`. Every endpoint uses `axiosBaseQuery()`, unwraps the envelope in `transformResponse` (list endpoints return `{ data, meta }`), and declares `providesTags` (queries) / `invalidatesTags` (mutations). Exports the generated hooks. |
| `<domain>Slice.ts`      | Plain `createSlice` for client state tied to the domain (list filters, sort, page) with its actions and selectors. Never store server responses here — the RTK Query cache owns them.                                                                                                                                        |
| `<domain>Service.ts`    | Pure functions with no React or Redux: map slice/form state to request params and bodies (drop empty values from query params), and read error messages from mutation errors.                                                                                                                                                |

Rules:

- **Base query:** always use the existing `axiosBaseQuery` (wraps the shared axios instance in `src/redux/api.tsx`, so auth, CSRF and 401/403/429 handling stay in its interceptors; arrays are sent as repeated keys). Don't use `fetchBaseQuery` and don't write a second base query. Per-request `headers` / `timeout` go in the endpoint's `query`.
- **Store:** register each `createApi`'s `reducer` under its `reducerPath` and add its `middleware` in `src/store/index.ts`; register the domain slice reducer too.
- **Logout:** add `<domain>Api.util.resetApiState()` to `sessionResetMiddleware` so cached data never leaks between sessions.
- **Cache invalidation:** a mutation invalidates every tag whose data it changes; don't refetch manually what a tag already covers. If thunk-based code changes data that an RTK Query endpoint caches, it must dispatch `<domain>Api.util.invalidateTags([...])`.
- **Components:** use the generated hooks (`useGetXQuery`, `useXMutation`) and call `.unwrap()` on mutations inside `try/catch`. Read the error with the domain's error helper (BE errors are `{ message }`) and fall back to a generic message — never show raw axios errors.
- **Mapping:** UI/form values may use a different shape than the BE; convert them in `<domain>Service.ts`, not in the component or the endpoint.
- **Adding an endpoint:** URL in `<domain>.endpoints.ts` → types in `<domain>.types.ts` → endpoint in `<domain>Api.ts` (with `transformResponse` and tags) → builder in `<domain>Service.ts` if needed → tests.
- **Tests:** in `tests/unit/redux/`. Mock the shared axios instance's `request`, build a store with just the API's reducer + middleware, and assert URL, method, params/body, the unwrapped result, and tag invalidation. Page/component tests mock the generated hooks.

### Thunk-based server state

- **Server state** (anything from an API): a `createAsyncThunk` per request, dispatched from a component/hook via `useDispatch`, with the result stored in the owning slice's `extraReducers` (`pending` / `fulfilled` / `rejected`). Keep the raw HTTP call in a separate `*.api.ts` file (axios) — the thunk orchestrates, it doesn't build the request itself.
- Each slice storing server data tracks its own `status: 'idle' | 'loading' | 'succeeded' | 'failed'` and `error: string | null` — don't rely on a global loading flag.
- **No built-in caching** — because there's no TanStack Query layer, guard against redundant re-fetches yourself: check `status` before dispatching (e.g. skip the thunk if `status === 'succeeded'` and the data isn't stale), or gate the dispatch behind a `useEffect` dependency array that only fires when the relevant ID/filter actually changes.
- **Cache invalidation is manual.** After a mutation thunk succeeds, explicitly dispatch whatever re-fetch or slice update is needed to keep dependent data in sync — nothing does this automatically.
- **Global client state** (auth session, UI-wide toggles, cart, feature flags) also lives in Redux Toolkit slices, same as server data, but with plain reducers (no thunk needed since there's no async step).
- **Local UI state** (form inputs, modal open/closed, hover) → `useState`/`useReducer` in the component. Don't promote it to Redux "just in case."
- **URL as state** for anything shareable or bookmarkable (filters, pagination, active tab) — use React Router search params, not component or Redux state.
- Use Redux Toolkit's `configureStore` (never legacy `createStore`); enable Redux DevTools only in development.
- Selectors live next to their slice and are memoized with `createSelector` (reselect, bundled with RTK) when they do any computation — this matters more here than it would with a query library, since Redux re-renders are easier to over-trigger.
- Handle race conditions explicitly: if a thunk can be dispatched multiple times in quick succession (e.g. search-as-you-type), use `createAsyncThunk`'s `condition` option or an abort controller to cancel stale requests rather than letting an old response overwrite a newer one.

> File naming for the above follows the project's actual `PascalCase` + `Redux.ts` convention — see §1.

### Access Control (RBAC)

Route access, sidebar visibility, and post-login/denial redirects are derived from one
set of rules — `src/features/auth/access/` and `src/features/auth/model/` — not
re-decided independently in each place that needs an answer.

- **`useSessionIdentity()`** (`src/features/auth/model/useSessionIdentity.ts`) is the
  single reactive read of "who am I" — role, license state, trial state, resolution
  state. Nothing outside this hook reads the auth cookie or the Redux login slice
  directly to make an access decision; a second, independent read is exactly how the
  guard and the sidebar disagree with each other.
- **Guards are declarative and self-describing.** Each one (`AuthOnly`, `GuestOnly`,
  `RequireUsableAccount`, `requireRole([...])`, `requireEntitlement`, `requireFeature`,
  all in `src/features/auth/access/guards/`) exposes its condition as `rules` data, not
  just as rendered behaviour. `routeTree.tsx` attaches guards to routes; `Can` applies
  the same predicates around an individual control, for action-level gating that
  doesn't match the page's own access rule (e.g. only a District Admin may add a
  subscription on a page both roles can open).
- **The sidebar is derived from the route tree** (`navFromRoutes.ts`), not maintained
  as a separate list — a route becomes navigable by carrying a `nav` entry in
  `routeTree.tsx`, and it is shown only when its own guards' `rules` are satisfied
  (`nav.only` may further narrow visibility below the guard, e.g. hiding a link from a
  role that can open the page but has no everyday use for it — see the simulation
  catalogue in `routeTree.tsx`; narrowing can never widen access beyond what the guard
  allows).
- **A trial (`skippedRedeem`) is not a license.** `hasEntitlement`
  (`src/features/auth/access/predicates.ts`) checks `isLicenseActive` only. Do not
  reintroduce `|| ctx.skippedRedeem` there — it previously let a trial District Admin
  open `/admin-dashboard`, `/schools` and `/educators` by typing the URL, even though
  the sidebar never linked them there. A trial account's access is limited to
  `/simulation-catalog` and `/account` (role-gated only, no entitlement check), plus a
  redeem prompt everywhere else — not a stand-in for a real license.
- **Denial always goes through `fallbackRouteFor(identity)`**
  (`src/features/auth/access/fallbackRouteFor.ts`), one ladder used by every guard's
  denial branch and by the post-login redirect, so they can never disagree. Never hard
  code a denial destination in a new guard.
- **Roles are a closed catalogue** (`src/features/auth/model/roles.ts`, `ROLE` /
  `RoleSlug`) — add a new role there first, label it in `ROLE_LABEL`, and only then wire
  routes/guards to it, so the type system forces every call site to be updated together.
- **Adding a new protected route:** register it in `routeTree.tsx` with the guards that
  express its access rule, add a `nav` entry only if it belongs in the sidebar, and add
  a case to `tests/routes/routeTree.test.tsx` / `tests/routes/navFromRoutes.test.ts` —
  those assert structurally that no navigable route is missing a guard and no visible
  link points at a route its own guard would reject.
- **Testing a guard:** mock `useSessionIdentity()` (see
  `tests/unit/features/auth/guards.test.tsx`) rather than driving it through Redux/
  cookie state — the hook itself has its own dedicated parity tests in
  `useSessionIdentity.test.tsx`.

---

## 5. Styling (Tailwind CSS)

- Tailwind utility classes are the default. Avoid writing custom CSS files unless Tailwind genuinely cannot express something (rare — complex animations, third-party widget overrides).
- Extend the design system through `tailwind.config.ts` (colors, spacing, fonts) rather than hardcoding one-off values in `className`.
- Use `clsx` or `tailwind-merge` for conditional/merged class strings — never string-concatenate classes manually.
- Keep long `className` strings readable: extract to a local `const` or use a component if a single element's class list becomes unwieldy (roughly 8+ conditional classes).
- No inline `style={{}}` except for genuinely dynamic values Tailwind can't express at build time (e.g. a computed `transform` from a drag interaction).
- If a third-party component library is introduced later, prefer one with first-class Tailwind support (e.g. shadcn/ui) over one requiring a separate CSS-in-JS runtime.

---

## 6. Environment Variables

- **The `VITE_` prefix is a security boundary, not a naming convention.** Anything prefixed `VITE_` is bundled into client-side JS and publicly visible in the browser. Never put secrets, API keys, or internal-only URLs behind `VITE_`.
- Commit `.env.example` with placeholder values; never commit `.env.local` or any file with real secrets.
- **Planned (future release):** validate required env vars at startup with a schema (Zod) so a missing var fails loudly at build/boot time, not silently at runtime. Not yet implemented in this codebase.

---

## 7. Error Handling

- Wrap the app (and, where useful, individual routes/widgets) in **React Error Boundaries**. A JavaScript error in one part of the UI must not blank the whole app.
- **Planned (future release):** render a custom 404 page for unhandled routes with a way back to a working part of the app; the current wildcard route redirects to login.
- Centralize API error handling in the shared axios instance's response interceptor (e.g. normalize error shape, handle 401 → logout globally) rather than reimplementing it per-thunk or per-component.
- Each `createAsyncThunk` should use `rejectWithValue` to pass a normalized error into the slice's `rejected` case, so components read a consistent `error` shape from state instead of raw axios errors.
- Never expose raw error messages, stack traces, or internal identifiers to end users. Show a generic, friendly message in the UI.
- **Planned (future release):** send error/exception details to Sentry (or equivalent) instead of only logging locally. Not yet integrated in this codebase.
- Use `try/catch` around `async/await`; don't let promise rejections go unhandled.

---

## 8. Testing

- **Unit/integration:** Vitest + React Testing Library. Query by role/label text like a user would — not by class names or internal state.
- **E2E:** Playwright, reserved for critical flows only (login, checkout, core task completion) — E2E is expensive to maintain; don't try to cover everything with it.
- Mock according to the project's current setup: Redux thunks/slices are exercised with `redux-mock-store` and other in-repo test utilities rather than an HTTP-boundary mocking layer (e.g. MSW). Keep tests aligned with this approach unless the team decides to adopt a network-boundary mocking library.
- Enforce a coverage threshold in CI (`vitest --coverage`), not just measure it. 80% is a reasonable target; 100% is usually wasted effort.
- New/changed code requires new/updated tests before merge — this is a review-blocking requirement, not a suggestion.

---

## 9. Performance

- Route-level code splitting via `React.lazy` + `Suspense` at minimum.
- Avoid heavy synchronous computation on the main thread — it blocks rendering and freezes the UI. Move genuinely heavy work off the main thread (Web Worker) or paginate/virtualize instead of computing over huge datasets inline.
- Use `react-window` (or similar) for long lists.
- Optimize images: prefer WebP/SVG, lazy-load below-the-fold images (`loading="lazy"`), size them appropriately for their container.
- Periodically run `rollup-plugin-visualizer` against the Vite build to catch accidental large-dependency inclusions (e.g. importing all of `lodash` instead of `lodash/debounce`).
- Avoid duplicate network requests for the same data — since there's no query-caching library, this is on you: check the slice's `status` before dispatching a thunk, and consider a simple in-memory request de-duplication guard (e.g. tracking in-flight request keys) for endpoints that multiple components might trigger simultaneously.

---

## 10. Accessibility (a11y)

- Semantic HTML first — a `<button>` is not a `<div onClick>`.
- `eslint-plugin-jsx-a11y` enabled in lint config to catch missing `alt` text, invalid ARIA usage, etc. at PR time.
- All interactive components must be keyboard-navigable (tab order, Escape to close modals, focus trapping where appropriate).
- Automated a11y checks (`axe-core`) integrated into the test suite.

---

## 11. Security

- Never trust client-side validation alone — it's for UX, not enforcement. Assume anyone can bypass it.
- Sanitize and validate all user input; never use `dangerouslySetInnerHTML` with unsanitized content (use DOMPurify if rendering HTML is unavoidable).
- Never use `eval()`.
- Run `npm audit` (or Dependabot/Snyk) in CI with a policy for what severity blocks a merge.
- Store auth tokens in httpOnly cookies where possible, not `localStorage`, if the threat model includes XSS.
- Don't expose sensitive data in URL params, client bundles, or verbose error responses.

---

## 12. Git & Code Review

### Commits

- **Conventional Commits**: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`.
- Atomic commits — one logical change per commit, with a message explaining _why_, not just _what_.

### Branching & PRs

- Trunk-based or GitHub-Flow style branching (single repo, single project — no need for Git Flow's release-branch overhead unless the team later needs it).
- PRs are small and address **one concern**. Link the ticket (Jira/Zoho). Include before/after screenshots for UI changes.
- Rebase feature branches on main regularly to avoid drift and painful merge conflicts.
- No force-pushes to shared branches.

### Review process

- **Minimum two reviewers**: a primary and a secondary (secondary steps in when primary is unavailable).
- Reviewer checks out the branch locally for anything non-trivial — reviewing only the diff misses runtime issues.
- Review checklist: correctness against the ticket, readability, modularity/reusability, consistency with existing patterns, test coverage, error handling, performance implications, security implications, no new dependencies without justification.
- Feedback is constructive and specific — suggest the fix, not just flag the problem.
- Approval requires the PR to meet the team's stated criteria — don't approve "to unblock" if it doesn't.

### Pre-commit enforcement

- **Planned (future release):** Husky + lint-staged to run ESLint, Prettier, and `tsc --noEmit` on staged files before every commit. Not yet set up in this repo — currently, linting/formatting/type-checking are run manually and via CI only.
- CI re-runs lint, type-check, tests, and build on every PR — pre-commit hooks are meant to be a fast local gate in addition to this, not a replacement.

---

## 13. Tooling

- **ESLint + Prettier**, configured together, aligned to a known style guide (Airbnb or similar) rather than ad hoc rules.
- **Planned (future release):** lint-staged to run linting only on staged files for speed, paired with Husky (see §12).
- **SonarQube/SonarLint** (or equivalent static analysis) for ongoing code-quality and security-smell detection, if available to the team.
- **Planned (future release):** Sentry (or equivalent) for real-time error and performance monitoring in staging and production. Not yet integrated.

---

## 14. Documentation

- README covers: setup steps, required env vars, how to run tests, how to build/deploy, and any non-obvious architectural decisions.
- Non-trivial exported functions and hooks get a short JSDoc comment explaining intent, not restating the type signature.
- Keep this file (`CLAUDE.md`) current as conventions evolve — a stale standards doc actively misleads rather than merely failing to help.

---

## 15. Internationalization (i18n)

- **Library:** `react-i18next` + `i18next` + `i18next-browser-languagedetector`. No other i18n package without explicit justification (see §12 review checklist — "no new dependencies without justification").
- **New and refactored UI components must use `useTranslation()`** for all user-facing copy — no new hardcoded English strings in JSX going forward. This is a review-blocking requirement for any component this policy applies to (see the legacy carve-out below).
- **Locale files** live under `src/i18n/locales/<lng>/<namespace>.json`, one namespace per feature/domain (e.g. `onboarding.json`, `common.json`). To add a namespace: create the JSON under both `en/` and `es/`, register it in `src/i18n/config.ts`'s `resources` and `ns` array, and add it to the `CustomTypeOptions` resource map in `src/i18n/i18next.d.ts` so `t()` keys stay type-checked.
- **Key naming:** nest keys by feature/section (e.g. `tracker.steps.products.label`). Multi-line/bulleted copy is stored as a JSON array (`t(key, { returnObjects: true })`), not flattened into numeric keys.
- **Persistence:** the active language is cached to `localStorage['app_language']` via `i18next-browser-languagedetector`'s `lookupLocalStorage` option — this is the **same key** the legacy locale system already uses (see below). Do not introduce a second storage key.
- **State ownership — intentional exception to §4:** the active i18next language is managed internally by `react-i18next`/`i18next`, not a Redux slice. All other app-wide state still follows §4; this one value is an agreed exception because `i18next` already owns it as the single source of truth, and mirroring it into Redux would create a second, sync-prone copy of the same state.
- **Fallback & missing keys:** `fallbackLng: 'en'` — any missing key or unsupported/unconfigured language falls back to English automatically. A missing key also logs a console warning in development (`missingKeyHandler`, gated on `import.meta.env.DEV`) so gaps are caught before merge, not silently rendered as blank/raw keys.
- **Testing:** use `renderWithProviders` from `src/test/testUtils.tsx` — it already wraps components in the real, initialized `src/i18n` instance via `I18nextProvider`. Don't construct a second, ad hoc i18n instance per test file.
- **Legacy locale system is frozen — not a pattern to extend:** `src/locales/auth/login/{en,es}.json`, `src/locales/types.ts`, and the ~100+ call sites across the app that read `localStorage.getItem('app_language')` directly (including the English-substring-matching in `src/utils/translateApiError.ts` / `src/utils/translateMessage.ts`) predate this setup and are **not** migrated by it. They'll be migrated to `react-i18next` incrementally in a dedicated future ticket. Do not add new code that copies that old pattern (a new local `getStoredLanguage()` helper, a new direct import of the legacy JSON, etc.) even in a file that already uses it — new UI text goes through `useTranslation()` against the `src/i18n` namespace structure above.
- **Switching language:** always go through `i18n.changeLanguage()` — never write `localStorage['app_language']` directly. The detector persists the choice to that key itself, so `react-i18next` screens and `<html lang>` update in place and legacy code reading the key still sees the new value. The app's only switcher UI today is `AuthLanguageSwitcher` (`src/components/auth/AuthLanguageSwitcher.tsx`) on `SignIn`. The recovery screens (`ForgotPassWord`, `OtpVerify`, `ResetPassWord`) deliberately have no switcher, matching the approved design: they read the current language from `useAuthLanguage()` (`src/hooks/useAuthLanguage.ts`) and follow whatever was chosen on Sign In. Reuse that hook and component for any new pre-auth switcher instead of copying the logic. The pages' own copy still comes from the legacy locale JSON until they're migrated onto `useTranslation()`.
- **Planned (future release):** `eslint-plugin-i18next` (or similar) to flag new hardcoded UI strings at lint time. Not enabled yet — turning it on repo-wide today would immediately flag the ~100 untouched legacy files above; it'll be scoped in once more of the codebase has migrated.
- **Planned (future release):** true lazy/on-demand loading of translation namespaces and languages (today's `en`/`es` bundles are small enough to import statically). Revisit once the namespace count grows enough for bundle size to matter.
