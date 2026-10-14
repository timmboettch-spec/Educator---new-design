import {
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  FileText,
  GraduationCap,
  Presentation,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ActivityTileCard } from '../ui/ActivityTileCard';
import { useGetActivityOverviewQuery } from '@/redux/api/classes/classesApi';
import {
  ClassAttentionMeasure,
  type ActivityOverviewResDto,
} from '@/redux/api/classes/classes.types';

type TileLabelKey =
  | 'activeClasses'
  | 'classesWithUnreadReports'
  | 'classesClosingSoon'
  | 'studentsInActiveClasses'
  | 'totalUnreadReports'
  | 'classesNearAvatarLimit';

interface TileConfig {
  labelKey: TileLabelKey;
  field: keyof ActivityOverviewResDto;
  icon: LucideIcon;
  // The class-list set the tile opens; student/report counts open the classes that hold them.
  measure: ClassAttentionMeasure;
}

// Row order for a two-column grid: class measures on the left, the rest on the right.
const TILES: TileConfig[] = [
  {
    labelKey: 'activeClasses',
    field: 'activeClasses',
    icon: Presentation,
    measure: ClassAttentionMeasure.ACTIVE,
  },
  {
    labelKey: 'studentsInActiveClasses',
    field: 'studentsInActiveClasses',
    icon: GraduationCap,
    measure: ClassAttentionMeasure.ACTIVE,
  },
  {
    labelKey: 'classesWithUnreadReports',
    field: 'classesWithUnreadReports',
    icon: ClipboardList,
    measure: ClassAttentionMeasure.UNREAD_REPORTS,
  },
  {
    labelKey: 'totalUnreadReports',
    field: 'totalUnreadReports',
    icon: FileText,
    measure: ClassAttentionMeasure.UNREAD_REPORTS,
  },
  {
    labelKey: 'classesClosingSoon',
    field: 'classesClosingSoon',
    icon: CalendarDays,
    measure: ClassAttentionMeasure.CLOSING_SOON,
  },
  {
    labelKey: 'classesNearAvatarLimit',
    field: 'classesWithStudentsNearAvatarLimit',
    icon: AlertTriangle,
    measure: ClassAttentionMeasure.NEAR_AVATAR_LIMIT,
  },
];

const GRID_CLASSES = 'grid grid-cols-2 gap-2.5 [container-type:inline-size]';

interface ActivityOverviewProps {
  onTileClick: (measure: ClassAttentionMeasure) => void;
}

export function ActivityOverview({ onTileClick }: ActivityOverviewProps) {
  const { t } = useTranslation('dashboard');
  const { data, isLoading, isError } = useGetActivityOverviewQuery();

  return (
    <div className="h-full flex flex-col">
      <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
        {t('activityOverview.title')}
      </h3>
      {isError && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {t('activityOverview.error')}
        </p>
      )}
      {isLoading && (
        <div role="status" className={GRID_CLASSES}>
          <span className="sr-only">{t('activityOverview.loading')}</span>
          {TILES.map((tile) => (
            <div
              key={tile.labelKey}
              className="rounded-xl border border-gray-100 bg-gray-100 min-h-[72px] animate-pulse"
            />
          ))}
        </div>
      )}
      {/* Every measure is always shown, 0 included: users rely on the fixed set of
          tiles, and a missing one reads as the dashboard being broken. */}
      {data && (
        <div className={GRID_CLASSES}>
          {TILES.map((tile) => {
            const label = t(`activityOverview.tiles.${tile.labelKey}`);
            return (
              <ActivityTileCard
                key={tile.labelKey}
                label={label}
                value={data[tile.field]}
                icon={tile.icon}
                onClick={() => onTileClick(tile.measure)}
                ariaLabel={t('activityOverview.viewClassesAria', { label })}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
