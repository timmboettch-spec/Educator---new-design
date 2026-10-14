import { useTranslation } from 'react-i18next';
import { useSimulationDurationLabel } from '../../hooks/useSimulationValueLabel';
import type { Simulation } from '../../redux/dashboard/simulationlibrary/GetSimulationRedux';

interface SimulationDetailsPanelProps {
  sim: Simulation;
}

/** A simulation's difficulty, duration, setting, description and objectives; hidden when it has none. */
export function SimulationDetailsPanel({ sim }: SimulationDetailsPanelProps) {
  const { t } = useTranslation('simulationLibrary', {
    keyPrefix: 'assignModal.details',
  });
  const durationLabel = useSimulationDurationLabel();
  const rows = [
    { label: t('difficulty'), value: sim.difficulty },
    { label: t('duration'), value: durationLabel(sim.duration ?? '') },
    { label: t('clinicalSetting'), value: sim.clinicalSetting },
    { label: t('description'), value: sim.description },
    {
      label: t('learningObjectives'),
      value: sim.learningObjectives?.filter(Boolean).join('; '),
    },
  ].filter((row) => row.value?.trim());

  if (rows.length === 0) return null;

  return (
    <section
      aria-label={t('title')}
      className="rounded-xl border border-gray-200 bg-gray-50 p-4"
    >
      <p className="text-sm font-semibold text-primary-600 mb-2">
        {t('title')}
      </p>
      <dl className="space-y-2">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {row.label}
            </dt>
            <dd className="text-sm text-gray-700 whitespace-pre-line">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
