import { Fragment, useId, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type {
  GuidedPathProgress,
  GuidedPathStep,
} from '@/hooks/useGuidedPathProgress';
import type { SetupStepKey } from '@/redux/api/guidedPath/guidedPath.types';
import { CheckIcon, ChevronIcon, FlagIcon } from './SetupTrackerIcons';
import { StepStone } from './StepStone';
import { StepDetailPanel, type StepAction } from './StepDetailPanel';
import { SetupTrackerSkeleton } from './SetupTrackerSkeleton';
import { SetupTrackerUnavailable } from './SetupTrackerUnavailable';

/** What the detail panel shows for one stone. */
export interface StepDetail {
  label: string;
  /** A paragraph, or a list of bullets. */
  instructions: string | string[];
  actions?: StepAction[];
}

/** Role-specific copy around the shared stepping-stone layout. */
export interface SetupTrackerCopy {
  titleInProgress: string;
  titleDone: string;
  subtitleDone: string;
  startAriaLabel: string;
  start: StepDetail;
  finish: StepDetail;
}

interface SetupTrackerBannerProps<K extends SetupStepKey> {
  progress: GuidedPathProgress<K>;
  copy: SetupTrackerCopy;
  getStepDetail: (step: GuidedPathStep<K>) => StepDetail;
}

/**
 * The setup guide banner shared by every role: gradient header with progress,
 * a Start → Step N → Finish row of stones, and a detail panel for the selected
 * stone. Renders the loading / unavailable states itself and nothing when the
 * guide is hidden. Each role's tracker only supplies its copy and actions.
 */
export function SetupTrackerBanner<K extends SetupStepKey>({
  progress,
  copy,
  getStepDetail,
}: Readonly<SetupTrackerBannerProps<K>>) {
  const { t } = useTranslation(['onboarding', 'common']);
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState<'start' | K | 'finish' | null>(null);
  const panelId = useId();

  const progressLabel = t('tracker.header.progress', {
    completed: progress.completedCount,
    total: progress.totalSteps,
  });

  // Screen-reader announcement of progress. The first text seen is the
  // baseline and is not announced (the visible header already says it);
  // any later change — a step completing, or the whole guide — is. Adjusting
  // state during render, not in an effect, so the region updates in the same
  // commit as the header.
  const progressText = !progress.visible
    ? null
    : progress.allGatesDone
      ? `${copy.titleDone}. ${copy.subtitleDone}`
      : progressLabel;
  const [announceBaseline, setAnnounceBaseline] = useState<string | null>(null);
  if (progressText !== null && announceBaseline === null) {
    setAnnounceBaseline(progressText);
  }
  const announcement =
    progressText !== null &&
    announceBaseline !== null &&
    progressText !== announceBaseline
      ? progressText
      : '';

  if (progress.status === 'loading') return <SetupTrackerSkeleton />;
  if (progress.status === 'error') {
    return <SetupTrackerUnavailable onRetry={progress.retry} />;
  }
  if (!progress.visible) return null;

  const firstIncomplete = progress.steps.find((s) => !s.done);
  const resolved =
    selected ??
    (progress.allGatesDone ? 'finish' : (firstIncomplete?.key ?? 'finish'));
  const activeStep = progress.steps.find((s) => s.key === resolved);

  let detail: StepDetail;
  if (activeStep) detail = getStepDetail(activeStep);
  else if (resolved === 'start') detail = copy.start;
  else detail = copy.finish;

  return (
    <div className="border-b border-[#e9e9e9] bg-white font-guide shadow-[0_2px_10px_rgba(95,96,96,0.06)]">
      <div className="flex items-center gap-4 bg-gradient-btn px-6 py-3 text-white">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold tracking-[0.01em]">
            {progress.allGatesDone ? copy.titleDone : copy.titleInProgress}
          </div>
          <div className="mt-0.5 text-[12.5px] opacity-95">
            {progress.allGatesDone ? copy.subtitleDone : progressLabel}
          </div>
        </div>

        <div
          role="progressbar"
          aria-label={t('tracker.a11y.progressLabel')}
          aria-valuemin={0}
          aria-valuemax={progress.totalSteps}
          aria-valuenow={progress.completedCount}
          aria-valuetext={progressLabel}
          className="h-1.5 w-[140px] flex-none overflow-hidden rounded-full bg-white/35"
        >
          <div
            className="h-full rounded-full bg-white transition-[width] duration-[250ms] ease-[ease]"
            style={{
              width: `${(progress.completedCount / progress.totalSteps) * 100}%`,
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={
            collapsed
              ? t('a11y.expandSetupGuide', { ns: 'common' })
              : t('a11y.collapseSetupGuide', { ns: 'common' })
          }
          aria-expanded={!collapsed}
          aria-controls={panelId}
          className="grid flex-none cursor-pointer place-items-center rounded bg-transparent p-1 text-white focus-visible:outline-white"
        >
          <ChevronIcon
            className={cn(
              'transition-transform duration-[180ms] ease-[ease]',
              collapsed && 'rotate-180'
            )}
          />
        </button>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {!collapsed && (
        <div id={panelId} className="px-6 pb-5 pt-[18px]">
          <div className="overflow-x-auto">
            <div className="flex min-w-[620px] items-start gap-2 px-0.5 py-2.5">
              <StepStone
                kind="start"
                label={t('tracker.start.stoneLabel')}
                state="done"
                icon={<CheckIcon />}
                isSelected={resolved === 'start'}
                ariaLabel={copy.startAriaLabel}
                onSelect={() => setSelected('start')}
                hasConnector={false}
                connectorActive={false}
              />

              {progress.steps.map((step, i) => {
                const isCurrent =
                  !progress.allGatesDone && firstIncomplete?.key === step.key;
                const state = step.done
                  ? 'done'
                  : isCurrent
                    ? 'current'
                    : 'upcoming';
                const prevDone =
                  i === 0 ? true : (progress.steps[i - 1]?.done ?? false);
                return (
                  <StepStone
                    key={step.key}
                    kind="step"
                    // `<0>` keeps the number a separate text node, as the
                    // design's `Step {index}` renders it; one combined string
                    // shapes the glyphs a fraction of a pixel differently.
                    label={
                      <Trans
                        t={t}
                        i18nKey="tracker.stone.stepLabel"
                        values={{ index: step.index }}
                        components={[<Fragment key="index" />]}
                      />
                    }
                    state={state}
                    icon={step.done ? <CheckIcon /> : step.index}
                    isSelected={resolved === step.key}
                    ariaLabel={
                      step.done
                        ? t('tracker.stone.ariaLabelDone', {
                            index: step.index,
                          })
                        : t('tracker.stone.ariaLabel', { index: step.index })
                    }
                    onSelect={() => setSelected(step.key)}
                    hasConnector
                    connectorActive={prevDone}
                  />
                );
              })}

              <StepStone
                kind="finish"
                label={t('tracker.finish.stoneLabel')}
                state={progress.allGatesDone ? 'done' : 'upcoming'}
                icon={progress.allGatesDone ? <CheckIcon /> : <FlagIcon />}
                isSelected={resolved === 'finish'}
                ariaLabel={t('tracker.finish.ariaLabel')}
                onSelect={() => setSelected('finish')}
                hasConnector
                connectorActive={
                  progress.steps[progress.steps.length - 1]?.done ?? false
                }
              />
            </div>
          </div>

          <StepDetailPanel
            label={detail.label}
            instructions={detail.instructions}
            actions={detail.actions}
          />
        </div>
      )}
    </div>
  );
}
