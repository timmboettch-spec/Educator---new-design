import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, School } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { selectClasses, selectClassStatus } from '@/redux/class/GetClassRedux';
import { useDashboardCardState } from '@/hooks/useDashboardCardState';
import {
  summarizeSchools,
  type DashboardSchool,
} from '@/utils/dashboardSchools';

interface YourSchoolsCardProps {
  schools: DashboardSchool[];
}

/**
 * Multi-school view for an educator teaching at more than one school: each
 * school's active classes and students. Renders nothing for a single school.
 */
export function YourSchoolsCard({ schools }: YourSchoolsCardProps) {
  const { t } = useTranslation('dashboard');
  const [open, setOpen] = useDashboardCardState('schools', true);
  const classes = useAppSelector(selectClasses);
  const status = useAppSelector(selectClassStatus);

  const summaries = useMemo(
    () => summarizeSchools(schools, classes ?? []),
    [schools, classes]
  );

  if (schools.length < 2) return null;

  const isLoading = status === 'loading';
  const hasError = status === 'failed';

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-4 sm:px-5 min-h-[44px] text-left hover:bg-[#e9e9e9]/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400"
      >
        <h2 className="text-sm sm:text-base font-semibold text-gray-800 m-0 flex items-center gap-2">
          <School size={18} className="text-primary-500" aria-hidden="true" />
          {t('yourSchools.title', { count: schools.length })}
        </h2>
        <ChevronDown
          size={20}
          aria-hidden="true"
          className={cn(
            'text-gray-500 shrink-0 transition-transform duration-200',
            !open && '-rotate-90'
          )}
        />
      </button>

      {open && (
        <div className="px-4 sm:px-5 pb-5 pt-4 border-t border-gray-100 space-y-3">
          {hasError && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600"
            >
              {t('yourSchools.error')}
            </p>
          )}
          <ul className="space-y-3" aria-busy={isLoading}>
            {summaries.map((school) => (
              <li
                key={school.id}
                className="rounded-xl border border-gray-200 p-3 min-w-0"
              >
                <p className="text-sm font-semibold text-gray-800 break-words">
                  {school.name}
                </p>
                {isLoading ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="mt-2 block h-3 w-40 max-w-full rounded bg-gray-200 animate-pulse"
                    />
                    <span className="sr-only">{t('yourSchools.loading')}</span>
                  </>
                ) : (
                  <p className="text-xs text-gray-500 mt-1 tabular-nums">
                    {hasError
                      ? t('yourSchools.unavailable')
                      : `${t('yourSchools.classes', {
                          count: school.activeClasses,
                        })} · ${t('yourSchools.students', {
                          count: school.activeStudents,
                        })}`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
