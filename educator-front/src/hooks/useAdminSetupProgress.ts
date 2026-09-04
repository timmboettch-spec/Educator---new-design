import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';
import { getParsedUser } from '../utils/storage';
import { selectSchools } from '../redux/schools/GetSchoolsRedux';
import { selectActiveGetEducators } from '../redux/educator/GetEducatorRedux';
import { selectDashboardOverview } from '../redux/dashboard/admin/DashboardOverviewRedux';

/**
 * First-time admin org-setup tracker state.
 *
 * The tracker stays anchored on the admin pages until the org is set up:
 * at least one ACTIVE school, one ACTIVE educator, and an LMS decision
 * (connect or skip). Account configuration is shown as a step but is NOT a
 * gate for un-anchoring, matching the product spec.
 */

export type SetupStepKey = 'account' | 'lms' | 'schools' | 'educators';
export type LmsDecision = 'connect' | 'skip';

export interface SetupStep {
  key: SetupStepKey;
  /** 1-based step number shown to the user */
  index: number;
  label: string;
  instructions: string;
  route: string;
  cta: string;
  done: boolean;
  /** true for the LMS step, which offers a "not using LMS" choice */
  optionalChoice?: boolean;
}

/** Routes the tracker is allowed to appear on (admin surfaces only). */
const ALLOWED_ROUTES = new Set<string>([
  '/admin-dashboard',
  '/schools',
  '/educators',
  '/lms-integration',
  '/products',
  '/account',
]);

const isActive = (status?: string): boolean => status?.toLowerCase() === 'active';

const readLS = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeLS = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — degrade to session-only state */
  }
};

export interface AdminSetupProgress {
  eligible: boolean;
  visible: boolean;
  steps: SetupStep[];
  completedCount: number;
  totalSteps: number;
  /** 1-based index of the first incomplete step, or totalSteps+1 when all done */
  currentIndex: number;
  allGatesDone: boolean;
  lmsDecision: LmsDecision | null;
  setLmsDecision: (decision: LmsDecision) => void;
  markAccountDone: () => void;
  dismiss: () => void;
}

export function useAdminSetupProgress(): AdminSetupProgress {
  const location = useLocation();

  const user = getParsedUser();
  const userId = String((user?.id as string | undefined) ?? '');
  const roleRaw = user?.role as string | { role_name?: string } | undefined;
  const role = (typeof roleRaw === 'string' ? roleRaw : roleRaw?.role_name)?.toLowerCase();
  const isAdmin = !!userId && role !== 'educator';

  const routeAllowed = ALLOWED_ROUTES.has(location.pathname);
  const eligible = isAdmin && routeAllowed;

  const lmsKey = `rw_setup_lms_${userId}`;
  const acctKey = `rw_setup_account_${userId}`;
  const dismissKey = `rw_setup_dismissed_${userId}`;

  const [lmsDecision, setLmsDecisionState] = useState<LmsDecision | null>(
    () => (readLS(lmsKey) as LmsDecision | null) ?? null,
  );
  const [accountDone, setAccountDone] = useState<boolean>(() => readLS(acctKey) === '1');
  const [dismissed, setDismissed] = useState<boolean>(() => readLS(dismissKey) === '1');

  const schools = useAppSelector(selectSchools);
  const activeEducators = useAppSelector(selectActiveGetEducators);
  const overview = useAppSelector(selectDashboardOverview);

  // The tracker intentionally does NOT fetch schools/educators itself. Firing
  // those requests on every admin page collided with the dashboard's own calls
  // and tripped the 5/sec authenticated rate limit (429). Instead it reads
  // whatever the pages / dashboard overview have already loaded into the store.

  // Visiting the Account tab counts as configuring the account (it is not a
  // gate, only a shown step, so a light-touch signal is appropriate).
  useEffect(() => {
    if (eligible && location.pathname === '/account' && !accountDone) {
      writeLS(acctKey, '1');
      setAccountDone(true);
    }
  }, [eligible, location.pathname, accountDone, acctKey]);

  const setLmsDecision = useCallback(
    (decision: LmsDecision) => {
      writeLS(lmsKey, decision);
      setLmsDecisionState(decision);
    },
    [lmsKey],
  );
  const markAccountDone = useCallback(() => {
    writeLS(acctKey, '1');
    setAccountDone(true);
  }, [acctKey]);
  const dismiss = useCallback(() => {
    writeLS(dismissKey, '1');
    setDismissed(true);
  }, [dismissKey]);

  // Prefer the dashboard overview counts (already fetched on the landing page);
  // fall back to the Schools/Educators list slices when those pages have loaded.
  const overviewActiveSchools = Number(
    (overview as { activeSchools?: number } | null)?.activeSchools ?? 0,
  );
  const overviewActiveEducators = Number(
    (overview as { activeEducators?: number } | null)?.activeEducators ?? 0,
  );
  const schoolsDone = overviewActiveSchools > 0 || schools.some((s) => isActive(s.status));
  const educatorsDone = overviewActiveEducators > 0 || activeEducators.length > 0;
  const lmsDone = lmsDecision !== null;

  const steps = useMemo<SetupStep[]>(
    () => [
      {
        key: 'lms',
        index: 1,
        label: 'STEP 1 · CONFIGURE LMS INTEGRATION (if applicable)',
        instructions:
          'Complete this step if your organization will be connecting the Realityworks AI system into your LMS. If applicable, use the LMS Integration tab and follow the steps listed.',
        route: '/lms-integration',
        cta: 'Set up LMS integration',
        done: lmsDone,
        optionalChoice: true,
      },
      {
        key: 'schools',
        index: 2,
        label: 'STEP 2 · CREATE SCHOOL(S)',
        instructions: 'Add school(s) and set the school status to active.',
        route: '/schools',
        cta: 'Go to Schools',
        done: schoolsDone,
      },
      {
        key: 'educators',
        index: 3,
        label: 'STEP 3 · CREATE EDUCATOR(S)',
        instructions:
          "Add educator(s) and include their name, email, associated school(s), active status, associated products, and allocate seats (only if applicable, and only for avatar-based simulations).",
        route: '/educators',
        cta: 'Go to Educators',
        done: educatorsDone,
      },
      {
        key: 'account',
        index: 4,
        label: 'STEP 4 · CONFIGURE YOUR ACCOUNT & NOTIFICATIONS',
        instructions:
          'Use the Account tab to adjust your name or add a picture to your account profile and configure your notification preferences.',
        route: '/account',
        cta: 'Go to Account',
        done: accountDone,
      },
    ],
    [accountDone, lmsDone, schoolsDone, educatorsDone],
  );

  const completedCount = steps.filter((s) => s.done).length;
  const currentIndex = steps.find((s) => !s.done)?.index ?? steps.length + 1;

  // Un-anchor gate: at least one active school, one active educator, and an LMS decision.
  const allGatesDone = schoolsDone && educatorsDone && lmsDone;
  const visible = eligible && !dismissed;

  return {
    eligible,
    visible,
    steps,
    completedCount,
    totalSteps: steps.length,
    currentIndex,
    allGatesDone,
    lmsDecision,
    setLmsDecision,
    markAccountDone,
    dismiss,
  };
}
