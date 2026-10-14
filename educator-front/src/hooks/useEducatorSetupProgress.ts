import { useEffect } from 'react';
import { ROLE } from '@/features/auth/model/roles';
import type { EducatorStepKey } from '@/redux/api/guidedPath/guidedPath.types';
import { ROUTE_PATHS } from '@/routes/routePath';
import {
  useGuidedPathProgress,
  type GuidedPathConfig,
  type GuidedPathProgress,
  type GuidedPathStatus,
  type GuidedPathStep,
} from './useGuidedPathProgress';

/**
 * First-time educator setup tracker state. Stays anchored on the educator
 * surfaces (Dashboard, Class Management, Simulation Library, Simulation
 * Catalog, Account) until the educator has walked the guide. Every step
 * completes the same way: the first visit to its page.
 */

export type { EducatorStepKey };
export type EducatorSetupStep = GuidedPathStep<EducatorStepKey>;
export type EducatorSetupStatus = GuidedPathStatus;
export type EducatorSetupProgress = GuidedPathProgress<EducatorStepKey>;

const EDUCATOR_GUIDE: GuidedPathConfig<EducatorStepKey> = {
  role: ROLE.EDUCATOR,
  steps: [
    { key: 'dashboard', route: ROUTE_PATHS.dashboard.educator },
    { key: 'catalog', route: ROUTE_PATHS.simulation.catalog },
    { key: 'classes', route: ROUTE_PATHS.schoolsEducators.classes },
    { key: 'library', route: ROUTE_PATHS.simulation.library },
    { key: 'account', route: ROUTE_PATHS.accountLms.account },
  ],
};

/**
 * Progress and the hidden flag used to live in localStorage
 * (`rw_edu_setup_<step|dismissed>_<userId>`). Both are on the backend now, so
 * every such key is dead weight — including other accounts' keys left on a
 * shared browser. Delete this once the old keys are no longer expected in the
 * wild. The current cache uses a different prefix (`rw_edu_guide_`).
 */
const LEGACY_KEY_PREFIX = 'rw_edu_setup_';

const removeLegacySetupKeys = (): void => {
  try {
    const { localStorage } = window;
    const legacyKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(LEGACY_KEY_PREFIX)) legacyKeys.push(key);
    }
    // Collected first: removing while iterating shifts the indexes.
    legacyKeys.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* storage unavailable — nothing to clean */
  }
};

export function useEducatorSetupProgress(): EducatorSetupProgress {
  useEffect(() => {
    removeLegacySetupKeys();
  }, []);

  return useGuidedPathProgress(EDUCATOR_GUIDE);
}
