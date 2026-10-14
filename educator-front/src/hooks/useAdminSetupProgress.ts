import { useCallback } from 'react';
import { ROLE } from '@/features/auth/model/roles';
import type { AdminStepKey } from '@/redux/api/guidedPath/guidedPath.types';
import { ROUTE_PATHS } from '@/routes/routePath';
import {
  useGuidedPathProgress,
  type GuidedPathConfig,
  type GuidedPathProgress,
  type GuidedPathStep,
} from './useGuidedPathProgress';

/**
 * First-time district admin setup tracker state ("Account and Organization Set
 * Up Guide"). Shown to a licensed district admin on the admin surfaces until
 * the guide is walked and hidden. A step completes on the first visit to its
 * page; the LMS step can also be skipped by an organization that won't
 * connect an LMS.
 */

export type { AdminStepKey };
export type AdminSetupStep = GuidedPathStep<AdminStepKey>;

export interface AdminSetupProgress extends GuidedPathProgress<AdminStepKey> {
  /** Completes the LMS step for an organization not connecting an LMS. */
  skipLms: () => void;
}

const ADMIN_GUIDE: GuidedPathConfig<AdminStepKey> = {
  role: ROLE.DISTRICT_ADMIN,
  // Trial admins can't open Schools or Educators, so the guide would lead nowhere.
  requireLicense: true,
  steps: [
    { key: 'lms', route: ROUTE_PATHS.accountLms.lmsIntegration },
    { key: 'schools', route: ROUTE_PATHS.schoolsEducators.schools },
    { key: 'educators', route: ROUTE_PATHS.schoolsEducators.educators },
    { key: 'account', route: ROUTE_PATHS.accountLms.account },
  ],
  extraRoutes: [ROUTE_PATHS.dashboard.admin],
};

export function useAdminSetupProgress(): AdminSetupProgress {
  const { markStep, ...progress } = useGuidedPathProgress(ADMIN_GUIDE);
  const skipLms = useCallback(() => markStep('lms'), [markStep]);
  return { ...progress, skipLms };
}
