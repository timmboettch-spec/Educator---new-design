import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';
import { getParsedUser } from '../utils/storage';
import { selectClasses } from '../redux/class/GetClassRedux';
import { selectSimulationLibraryData } from '../redux/dashboard/simulationlibrary/GetSimulationRedux';

/**
 * First-time EDUCATOR setup tracker state — the educator-portal sibling of
 * {@link useAdminSetupProgress}. Stays anchored on the educator surfaces
 * (Dashboard, Class Management, Simulation Library, Simulation Catalog, Account)
 * until the educator has walked the guide. Light-touch "visited" signals drive
 * the informational steps; the Catalog/Classes steps also complete from real
 * data (a populated library / at least one class) so progress reflects actual work.
 */

export type EducatorStepKey =
  | 'account'
  | 'products'
  | 'catalog'
  | 'classes'
  | 'library';

export interface EducatorSetupStep {
  key: EducatorStepKey;
  /** 1-based step number shown to the user */
  index: number;
  label: string;
  /** One or more bullet lines shown in the detail panel. */
  instructions: string[];
  route: string;
  cta: string;
  done: boolean;
}

/** Routes the tracker is allowed to appear on (educator surfaces only). */
const ALLOWED_ROUTES = new Set<string>([
  '/educator-dashboard',
  '/classes',
  '/simulationlibrary',
  '/simulation-catalog',
  '/account',
]);

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

export interface EducatorSetupProgress {
  eligible: boolean;
  visible: boolean;
  steps: EducatorSetupStep[];
  completedCount: number;
  totalSteps: number;
  currentIndex: number;
  allGatesDone: boolean;
  dismiss: () => void;
}

export function useEducatorSetupProgress(): EducatorSetupProgress {
  const location = useLocation();

  const user = getParsedUser();
  const userId = String((user?.id as string | undefined) ?? '');
  const roleRaw = user?.role as string | { role_name?: string } | undefined;
  const role = (typeof roleRaw === 'string' ? roleRaw : roleRaw?.role_name)?.toLowerCase();
  const isEducator = !!userId && role === 'educator';

  const routeAllowed = ALLOWED_ROUTES.has(location.pathname);
  const eligible = isEducator && routeAllowed;

  const acctKey = `rw_edu_setup_account_${userId}`;
  const prodKey = `rw_edu_setup_products_${userId}`;
  const catKey = `rw_edu_setup_catalog_${userId}`;
  const clsKey = `rw_edu_setup_classes_${userId}`;
  const libKey = `rw_edu_setup_library_${userId}`;
  const dismissKey = `rw_edu_setup_dismissed_${userId}`;

  const [accountVisited, setAccountVisited] = useState<boolean>(() => readLS(acctKey) === '1');
  const [productsVisited, setProductsVisited] = useState<boolean>(() => readLS(prodKey) === '1');
  const [catalogVisited, setCatalogVisited] = useState<boolean>(() => readLS(catKey) === '1');
  const [classesVisited, setClassesVisited] = useState<boolean>(() => readLS(clsKey) === '1');
  const [libraryVisited, setLibraryVisited] = useState<boolean>(() => readLS(libKey) === '1');
  const [dismissed, setDismissed] = useState<boolean>(() => readLS(dismissKey) === '1');

  // Read-only from the store — the tracker never fires its own fetches (avoids
  // colliding with page requests + the authenticated rate limit).
  const classes = useAppSelector(selectClasses);
  const libraryData = useAppSelector(selectSimulationLibraryData);

  // Visiting a surface counts as completing its (informational) step.
  useEffect(() => {
    if (!eligible) return;
    const path = location.pathname;
    if (path === '/account' && !accountVisited) {
      writeLS(acctKey, '1');
      setAccountVisited(true);
    } else if (path === '/educator-dashboard' && !productsVisited) {
      writeLS(prodKey, '1');
      setProductsVisited(true);
    } else if (path === '/simulation-catalog' && !catalogVisited) {
      writeLS(catKey, '1');
      setCatalogVisited(true);
    } else if (path === '/classes' && !classesVisited) {
      writeLS(clsKey, '1');
      setClassesVisited(true);
    } else if (path === '/simulationlibrary' && !libraryVisited) {
      writeLS(libKey, '1');
      setLibraryVisited(true);
    }
  }, [
    eligible,
    location.pathname,
    accountVisited,
    productsVisited,
    catalogVisited,
    classesVisited,
    libraryVisited,
    acctKey,
    prodKey,
    catKey,
    clsKey,
    libKey,
  ]);

  const dismiss = useCallback(() => {
    writeLS(dismissKey, '1');
    setDismissed(true);
  }, [dismissKey]);

  const accountDone = accountVisited;
  const productsDone = productsVisited;
  const catalogDone = catalogVisited || (libraryData?.length ?? 0) > 0;
  const classesDone = classesVisited || (classes?.length ?? 0) > 0;
  const libraryDone = libraryVisited;

  const steps = useMemo<EducatorSetupStep[]>(
    () => [
      {
        key: 'products',
        index: 1,
        label: 'STEP 1 · IDENTIFY YOUR ASSOCIATED PRODUCTS',
        instructions: [
          'Check out your Dashboard. Use the Dashboard > My Products & Usage > My Associated Products to identify the products your administrator has associated with you (if none listed, ask your administrator). Use this information to then filter down the focus of the content you have access to in the Simulation Catalog (the next step).',
        ],
        route: '/educator-dashboard',
        cta: 'Go to Dashboard',
        done: productsDone,
      },
      {
        key: 'catalog',
        index: 2,
        label: 'STEP 2 · ADD SIMULATIONS FROM THE CATALOG TO YOUR LIBRARY',
        instructions: [
          "Use the Simulation Catalog and filter content to fit your needs and focus. We've provided quick filters and views to help you get started.",
          'For a jump-start to making your first assignment, view simulations by Sim Packs and select the heart icon on the Sim Pack that aligns with your associated product(s).',
          'You are welcome to view simulation details by selecting any of the simulation tiles.',
          'Using the heart icon or clicking the "Add to My Library" button adds simulations to your favorites list, which will populate your Simulation Library so you can make simulation assignments.',
        ],
        route: '/simulation-catalog',
        cta: 'Go to Simulation Catalog',
        done: catalogDone,
      },
      {
        key: 'classes',
        index: 3,
        label: 'STEP 3 · ADD YOUR CLASSES',
        instructions: [
          'Use Class Management to create a class (or multiple) with start and end dates, then add the number of students you will have in the class.',
          'Once the class is created, the system will automatically generate the student access codes, and you will be able to make simulation assignments.',
          'Print or export student codes with ease and share the codes with your learners.',
          "Return to the Class Management page to review student simulation attempts and performance, with records of each student's reports and transcripts from simulation attempts.",
        ],
        route: '/classes',
        cta: 'Go to Class Management',
        done: classesDone,
      },
      {
        key: 'library',
        index: 4,
        label: 'STEP 4 · BATCH ASSIGN SIMULATIONS',
        instructions: [
          'Use My Simulation Library to manage or review the details of your favorite simulations, access simulation guides and facilitation documents, and select and assign multiple simulations to multiple classes at once.',
        ],
        route: '/simulationlibrary',
        cta: 'Go to My Simulation Library',
        done: libraryDone,
      },
      {
        key: 'account',
        index: 5,
        label: 'STEP 5 · CONFIGURE YOUR ACCOUNT',
        instructions: [
          'Use the Account tab to adjust your name or add a picture to your account profile and configure your notification preferences.',
        ],
        route: '/account',
        cta: 'Go to Account',
        done: accountDone,
      },
    ],
    [accountDone, productsDone, catalogDone, classesDone, libraryDone],
  );

  const completedCount = steps.filter((s) => s.done).length;
  const currentIndex = steps.find((s) => !s.done)?.index ?? steps.length + 1;
  const allGatesDone = steps.every((s) => s.done);
  const visible = eligible && !dismissed;

  return {
    eligible,
    visible,
    steps,
    completedCount,
    totalSteps: steps.length,
    currentIndex,
    allGatesDone,
    dismiss,
  };
}
