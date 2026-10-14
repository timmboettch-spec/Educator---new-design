import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useLocation } from 'react-router-dom';
import { skipToken } from '@reduxjs/toolkit/query';
import { hasEntitlement, hasRole } from '@/features/auth/access/predicates';
import type { RoleSlug } from '@/features/auth/model/roles';
import { useSessionIdentity } from '@/features/auth/model/useSessionIdentity';
import {
  useGetGuidedPathQuery,
  useUpdateGuidedPathMutation,
} from '@/redux/api/guidedPath/guidedPathApi';
import type { SetupStepKey } from '@/redux/api/guidedPath/guidedPath.types';
import {
  GUIDED_PATH_ROLES,
  buildVisitedState,
  readCompletedCache,
  readVisited,
} from '@/redux/api/guidedPath/guidedPathService';

/**
 * Shared engine behind every role's setup guide. Step progress lives on the
 * backend (`/api/guided-path`, one row per user and selected role) so it follows
 * the user across browsers. A step completes on the first visit to its page,
 * or when the guide marks it explicitly (`markStep`, e.g. an "I'll skip this"
 * choice); either way it is saved in `state.visited`.
 */

export interface GuidedPathStepConfig<K extends SetupStepKey> {
  key: K;
  route: string;
}

export interface GuidedPathConfig<K extends SetupStepKey> {
  /** The only selected role this guide is shown to. */
  role: RoleSlug;
  /** Steps in display order. */
  steps: readonly GuidedPathStepConfig<K>[];
  /** Routes the banner also appears on without being a step. */
  extraRoutes?: readonly string[];
  /** Also require an active license (not a trial). */
  requireLicense?: boolean;
}

export interface GuidedPathStep<K extends SetupStepKey> {
  key: K;
  /** 1-based step number shown to the user */
  index: number;
  route: string;
  done: boolean;
}

/**
 * What the banner should render. `hidden` covers ineligible and dismissed;
 * `loading` is the first fetch; `error` is a fetch that failed with nothing to
 * show; `ready` has data to render.
 */
export type GuidedPathStatus = 'hidden' | 'loading' | 'error' | 'ready';

export interface GuidedPathProgress<K extends SetupStepKey> {
  eligible: boolean;
  status: GuidedPathStatus;
  /** True only in the `ready` state. */
  visible: boolean;
  steps: GuidedPathStep<K>[];
  completedCount: number;
  totalSteps: number;
  currentIndex: number;
  allGatesDone: boolean;
  dismiss: () => void;
  /** Re-requests the guide after the `error` state. */
  retry: () => void;
}

export interface GuidedPathEngine<
  K extends SetupStepKey,
> extends GuidedPathProgress<K> {
  /** Completes a step without visiting its page. */
  markStep: (key: K) => void;
}

/**
 * Runs one role's guide from a static `config`. Pass a module-level constant —
 * the config is read on every render but is expected never to change.
 */
export function useGuidedPathProgress<K extends SetupStepKey>(
  config: GuidedPathConfig<K>
): GuidedPathEngine<K> {
  const { pathname } = useLocation();
  const identity = useSessionIdentity();
  const { role, userId } = identity;

  const stepKeys = useMemo(
    () => config.steps.map((step) => step.key),
    [config.steps]
  );
  const currentStep = config.steps.find((step) => step.route === pathname)?.key;
  const onGuideRoute =
    currentStep !== undefined ||
    (config.extraRoutes?.includes(pathname) ?? false);
  // The session may save this guide's progress: same signed-in user, this
  // role, licensed if required. `eligible` adds the route — where the banner
  // shows and visits count.
  const canSave =
    identity.isResolved &&
    identity.isAuthenticated &&
    hasRole(identity, GUIDED_PATH_ROLES) &&
    role === config.role &&
    (!config.requireLicense || hasEntitlement(identity));
  const eligible = canSave && onGuideRoute;

  // A step accepted on a guide page (a visit or an LMS skip) can still be
  // queued behind an in-flight save when the user leaves for another page.
  // While one is pending, the row stays subscribed and the queue keeps
  // draining off-route; otherwise the skipped query drops the row and the
  // step would be lost on refresh.
  const [hasPendingSave, setHasPendingSave] = useState(false);
  const keepSaving = canSave && (eligible || hasPendingSave);

  // A confirmed `completed: true` is cached per browser, so later loads skip
  // the GET entirely. A new browser/device has no cache and asks once.
  const cachedCompleted = readCompletedCache(userId, role);

  const {
    data: guidedPath,
    isError,
    refetch,
  } = useGetGuidedPathQuery(
    keepSaving && role && !cachedCompleted ? role : skipToken
  );
  const [updateGuidedPath] = useUpdateGuidedPathMutation();

  // The backend `completed` flag means the user hid the guide.
  const dismissed = cachedCompleted || (guidedPath?.completed ?? false);

  // A failed PUT rolls the optimistic patch back, which would re-run the effect
  // and retry in a loop — so each (user, role, step) is tried once per page
  // visit. Cleared on navigation (declared before the effect that fills it, so
  // arriving on a page starts fresh) and keyed by user/role so a logout, login
  // or role switch never inherits the previous session's attempts.
  const attempted = useRef(new Set<string>());
  useEffect(() => {
    attempted.current.clear();
  }, [pathname]);

  // Step saves go out one at a time. Each PUT replaces the whole `state`, so
  // two in flight could land in either order and the older one would drop a
  // step on the server. Steps completed while a save is in flight are queued
  // and sent together in the next PUT, built from the then-latest state.
  // Owner (`userId:role`) of the save in flight, if any. Per owner, because a
  // different user's or role's row is a separate BE row and need not wait.
  const inFlightOwner = useRef<string | null>(null);
  const pending = useRef<{ owner: string; steps: Set<K> }>({
    owner: '',
    steps: new Set(),
  });
  // Re-runs the save effect once a PUT settles or a step is marked, so the
  // queue is flushed.
  const [saveTick, requestFlush] = useReducer((n: number) => n + 1, 0);
  // Steps marked explicitly, waiting for the save effect to pick them up.
  const marked = useRef(new Set<K>());

  useEffect(() => {
    const syncPendingSave = () =>
      setHasPendingSave(
        inFlightOwner.current !== null ||
          pending.current.steps.size > 0 ||
          marked.current.size > 0
      );
    if (!canSave || dismissed) {
      // Signed out, role switched or guide hidden: nothing left to save.
      marked.current.clear();
      pending.current.steps.clear();
      setHasPendingSave(false);
      return;
    }
    if (!keepSaving || !role || !guidedPath) return;

    const owner = `${guidedPath.userId}:${role}`;
    if (pending.current.owner !== owner) {
      pending.current = { owner, steps: new Set() };
    }
    const serverVisited = readVisited(guidedPath.state, stepKeys);

    // Visiting a surface counts as completing its step.
    if (currentStep) {
      const attemptKey = `${owner}:${currentStep}`;
      if (!attempted.current.has(attemptKey) && !serverVisited[currentStep]) {
        attempted.current.add(attemptKey);
        pending.current.steps.add(currentStep);
      }
    }
    marked.current.forEach((step) => pending.current.steps.add(step));
    marked.current.clear();
    if (inFlightOwner.current === owner) {
      syncPendingSave();
      return;
    }

    const steps = [...pending.current.steps].filter(
      (step) => !serverVisited[step]
    );
    pending.current.steps.clear();
    if (steps.length === 0) {
      syncPendingSave();
      return;
    }

    inFlightOwner.current = owner;
    syncPendingSave();
    updateGuidedPath({
      role,
      state: buildVisitedState(guidedPath.state, steps, stepKeys),
    })
      .unwrap()
      .catch(() => {
        /* fail quiet: the guide is a nicety; revisiting the page retries */
      })
      .finally(() => {
        if (inFlightOwner.current === owner) inFlightOwner.current = null;
        requestFlush();
      });
  }, [
    canSave,
    keepSaving,
    role,
    guidedPath,
    dismissed,
    currentStep,
    stepKeys,
    updateGuidedPath,
    saveTick,
  ]);

  const markStep = useCallback((key: K) => {
    marked.current.add(key);
    // Set now, so leaving the page before the effect runs keeps the row.
    setHasPendingSave(true);
    requestFlush();
  }, []);

  // Optimistic in the API layer, so the banner hides at once and comes back
  // only if the PUT fails.
  const dismiss = useCallback(() => {
    if (!role) return;
    updateGuidedPath({ role, completed: true })
      .unwrap()
      .catch(() => {
        /* rolled back; the hide button stays available to try again */
      });
  }, [role, updateGuidedPath]);

  const visited = readVisited(guidedPath?.state, stepKeys);
  // A stable string of done flags, so `steps` only changes when one flips.
  const doneSignature = stepKeys.map((key) => (visited[key] ? 1 : 0)).join('');

  const steps = useMemo<GuidedPathStep<K>[]>(
    () =>
      config.steps.map((step, i) => ({
        key: step.key,
        index: i + 1,
        route: step.route,
        done: doneSignature[i] === '1',
      })),
    [config.steps, doneSignature]
  );

  const completedCount = steps.filter((s) => s.done).length;
  const currentIndex = steps.find((s) => !s.done)?.index ?? steps.length + 1;
  const allGatesDone = steps.every((s) => s.done);
  let status: GuidedPathStatus;
  if (!eligible || dismissed) status = 'hidden';
  else if (guidedPath) status = 'ready';
  else if (isError) status = 'error';
  else status = 'loading';

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    eligible,
    status,
    visible: status === 'ready',
    steps,
    completedCount,
    totalSteps: steps.length,
    currentIndex,
    allGatesDone,
    dismiss,
    retry,
    markStep,
  };
}
