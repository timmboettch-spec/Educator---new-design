import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useEducatorSetupProgress,
  type EducatorSetupStep,
} from '@/hooks/useEducatorSetupProgress';
import { ROUTE_PATHS } from '@/routes/routePath';
import {
  SetupTrackerBanner,
  type SetupTrackerCopy,
  type StepDetail,
} from './SetupTrackerBanner';

/**
 * First-time educator setup journey tracker. Shown at the top of the
 * educator surfaces (Dashboard, Class Management, Simulation Library,
 * Simulation Catalog, Account), scrolling with the page content, until the
 * guide is walked or dismissed.
 */
export default function EducatorSetupTracker() {
  const { t } = useTranslation('onboarding');
  const progress = useEducatorSetupProgress();
  const navigate = useNavigate();

  const copy: SetupTrackerCopy = {
    titleInProgress: t('tracker.header.titleInProgress'),
    titleDone: t('tracker.header.titleDone'),
    subtitleDone: t('tracker.header.subtitleDone'),
    startAriaLabel: t('tracker.start.ariaLabel'),
    start: {
      label: t('tracker.start.detailLabel'),
      instructions: t('tracker.start.instructions', { returnObjects: true }),
    },
    finish: {
      label: t('tracker.finish.detailLabel'),
      instructions: t('tracker.finish.instructions', { returnObjects: true }),
      actions: [
        {
          label: t('tracker.finish.actions.goToDashboard'),
          onClick: () => navigate(ROUTE_PATHS.dashboard.educator),
        },
        {
          label: t('tracker.finish.actions.goToClasses'),
          onClick: () => navigate(ROUTE_PATHS.schoolsEducators.classes),
        },
        ...(progress.allGatesDone
          ? [
              {
                label: t('tracker.finish.actions.hideGuide'),
                onClick: progress.dismiss,
                variant: 'outline' as const,
                className: 'rounded-full px-6 font-semibold',
              },
            ]
          : []),
      ],
    },
  };

  const getStepDetail = (step: EducatorSetupStep): StepDetail => ({
    label: t(`tracker.steps.${step.key}.label`),
    instructions: t(`tracker.steps.${step.key}.instructions`, {
      returnObjects: true,
    }),
    actions: [
      {
        label: t(`tracker.steps.${step.key}.cta`),
        onClick: () => navigate(step.route),
        className: 'h-12 max-w-full',
      },
    ],
  });

  return (
    <SetupTrackerBanner
      progress={progress}
      copy={copy}
      getStepDetail={getStepDetail}
    />
  );
}
