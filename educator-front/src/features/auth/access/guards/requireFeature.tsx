import { Navigate } from 'react-router-dom';
import ContentLoader from '../../../../components/layout/ContentLoader';
import { useSessionIdentity } from '../../model/useSessionIdentity';
import { fallbackRouteFor } from '../fallbackRouteFor';
import type { FeatureKey, GuardComponent, GuardProps } from './types';

/**
 * Feature availability, as its own axis.
 *
 * Distinct from both role and entitlement: Google Classroom can be switched off for a
 * school whose educators are otherwise fully licensed. Expressing it as a guard rather
 * than as another branch inside the role check keeps "not shipped here" separable from
 * "not allowed" — and lets the sidebar hide the item using the same rule.
 */
const isFeatureEnabled = (
  feature: FeatureKey,
  identity: { googleClassroomEnabled: boolean }
): boolean => {
  switch (feature) {
    case 'googleClassroom':
      return identity.googleClassroomEnabled;
    default:
      // Unknown feature: fail closed rather than silently granting access.
      return false;
  }
};

export const requireFeature = (feature: FeatureKey): GuardComponent => {
  const FeatureGuard = ({ children, redirect }: GuardProps) => {
    const identity = useSessionIdentity();

    if (!identity.isResolved) {
      return <ContentLoader />;
    }

    if (isFeatureEnabled(feature, identity)) {
      return <>{children}</>;
    }

    return <Navigate to={redirect?.to ?? fallbackRouteFor(identity)} replace />;
  };

  FeatureGuard.displayName = `requireFeature(${feature})`;
  FeatureGuard.rules = [{ kind: 'feature', feature }] as const;

  return FeatureGuard;
};

export { isFeatureEnabled };
