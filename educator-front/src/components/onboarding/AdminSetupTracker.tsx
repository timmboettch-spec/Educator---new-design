import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useAdminSetupProgress,
  type AdminSetupStep,
} from '@/hooks/useAdminSetupProgress';
import { cn } from '@/lib/utils';
import { ROUTE_PATHS } from '@/routes/routePath';
import {
  SetupTrackerBanner,
  type SetupTrackerCopy,
  type StepDetail,
} from './SetupTrackerBanner';
import type { StepAction } from './StepDetailPanel';

const STEP_CTA_CLASS = 'h-12 w-[260px] max-w-full';

/**
 * First-time district admin setup journey tracker ("Account and Organization
 * Set Up Guide"). Shown at the top of the admin surfaces (Dashboard, LMS
 * Integration, Schools, Educators, Account) until the guide is walked or
 * dismissed.
 */
export default function AdminSetupTracker() {
  const { t } = useTranslation('onboarding');
  const progress = useAdminSetupProgress();
  const navigate = useNavigate();

  const copy: SetupTrackerCopy = {
    titleInProgress: t('adminTracker.header.titleInProgress'),
    titleDone: t('adminTracker.header.titleDone'),
    subtitleDone: t('adminTracker.header.subtitleDone'),
    startAriaLabel: t('adminTracker.start.ariaLabel'),
    start: {
      label: t('adminTracker.start.detailLabel'),
      instructions: t('adminTracker.start.instructions'),
    },
    finish: {
      label: t('adminTracker.finish.detailLabel'),
      instructions: t('adminTracker.finish.instructions'),
      actions: [
        {
          label: t('adminTracker.finish.actions.goToDashboard'),
          onClick: () => navigate(ROUTE_PATHS.dashboard.admin),
        },
        ...(progress.allGatesDone
          ? [
              {
                label: t('adminTracker.finish.actions.hideGuide'),
                onClick: progress.dismiss,
                variant: 'outline' as const,
                size: 'lg' as const,
                className: 'font-semibold',
              },
            ]
          : []),
      ],
    },
  };

  const getStepDetail = (step: AdminSetupStep): StepDetail => {
    const actions: StepAction[] = [
      {
        label: t(`adminTracker.steps.${step.key}.cta`),
        onClick: () => navigate(step.route),
        className: STEP_CTA_CLASS,
      },
    ];
    // An organization that won't connect an LMS completes the step here.
    if (step.key === 'lms' && !step.done) {
      actions.push({
        label: t('adminTracker.steps.lms.skip'),
        onClick: progress.skipLms,
        variant: 'outline',
        size: 'lg',
        className: cn(STEP_CTA_CLASS, 'font-semibold'),
      });
    }
    return {
      label: t(`adminTracker.steps.${step.key}.label`),
      instructions: t(`adminTracker.steps.${step.key}.instructions`),
      actions,
    };
  };

  return (
    <SetupTrackerBanner
      progress={progress}
      copy={copy}
      getStepDetail={getStepDetail}
    />
  );
}
