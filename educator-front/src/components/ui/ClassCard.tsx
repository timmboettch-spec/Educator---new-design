import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import { getStatusTone } from '@/utils/statusTone';
import { LmsLinkagePill } from '@/components/ui/LmsLinkagePill';
import type { ClassLmsLinkageSummary } from '@/types/Class_types';
import dayjs from 'dayjs';

function formatDate(raw: string | undefined): string {
  if (!raw) return '';
  const d = dayjs(raw, ['YYYY-MM-DD', 'MM-DD-YYYY', 'MM/DD/YYYY']);
  return d.isValid() ? d.format('MM/DD/YYYY') : '';
}

interface ClassCardProps {
  year?: number;
  term?: string;
  startDate?: string;
  endDate?: string;
  activeStudents: number;
  simulations: number;
  newReports: number;
  reportNote?: string;
  status?: 'Active' | 'Inactive' | 'Draft';
  statusLabel?: string;
  hideStatus?: boolean;
  title: string;
  classId?: string;
  lmsLinkage?: ClassLmsLinkageSummary | null;
  labels?: {
    activeStudents: string;
    activeSimulations: string;
    newReports: string;
    manageStudent: string;
    manageSims: string;
    viewReports: string;
  };
}

export default function ClassCard({
  term: _term = 'i',
  startDate,
  endDate,
  activeStudents,
  simulations,
  newReports,
  reportNote = 'Reports not reviewed since last log in',
  status = 'Active',
  statusLabel,
  hideStatus = false,
  title,
  lmsLinkage,
  classId,
  labels,
}: ClassCardProps) {
  const uiText = {
    activeStudents: labels?.activeStudents ?? 'Active Students',
    activeSimulations: labels?.activeSimulations ?? 'Active Simulations',
    newReports: labels?.newReports ?? 'New Reports',
    manageStudent: labels?.manageStudent ?? 'Manage Students',
    manageSims: labels?.manageSims ?? 'Manage Sims',
    viewReports: labels?.viewReports ?? 'View Reports',
  };

  const navigate = useNavigate();
  const handleManageSims = () => {
    navigate('/classes', { state: { classId, expandType: 'sims' } });
  };
  const handleManageStudent = () => {
    navigate('/classes', { state: { classId, expandType: 'students' } });
  };
  const handleViewReports = () => {
    navigate('/classes', { state: { classId, expandType: 'reports' } });
  };
  return (
    <div className="bg-white rounded-2xl border border-orange-100 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 text-[14px] sm:text-[15px] leading-tight break-words">
            {title}
          </h3>
          {(startDate || endDate) && (
            <p className="text-sm mt-1 flex items-center gap-1">
              {startDate && (
                <span className="font-medium text-black-500">
                  {formatDate(startDate)}
                </span>
              )}
              {startDate && endDate && (
                <span className="text-black-400">-</span>
              )}
              {endDate && (
                <span className="font-medium text-black-500">
                  {formatDate(endDate)}
                </span>
              )}
            </p>
          )}
          {lmsLinkage && (
            <LmsLinkagePill
              linkage={lmsLinkage}
              fallbackCourseName={title}
              className="mt-1.5"
            />
          )}
        </div>
        <div className="relative flex-shrink-0">
          {!hideStatus && (
            <StatusBadge
              tone={getStatusTone(status)}
              label={statusLabel ?? status}
            />
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 px-4 mb-3">
        {/* Active Students */}
        <div className="flex flex-col items-center py-3 px-2 gap-1">
          <img
            src="/assets/dashboard/student.svg"
            alt="student"
            className="w-7 h-7"
          />
          <span className="text-xl font-bold text-gray-800 tabular-nums leading-none">
            {activeStudents}
          </span>
          <div className="flex items-center gap-1 justify-center">
            <span className="text-sm font-normal text-gray-600 text-center leading-tight">
              {uiText.activeStudents}
            </span>
          </div>
        </div>

        {/* Active Simulations */}
        <div className="flex flex-col items-center py-3 px-2 gap-1">
          <img
            src="/assets/dashboard/sims.svg"
            alt="simulation"
            className="w-7 h-7"
          />
          <span className="text-xl font-bold text-gray-800 tabular-nums leading-none">
            {simulations}
          </span>
          <div className="flex items-center gap-1 justify-center">
            <span className="text-sm font-normal text-gray-600 text-center leading-tight">
              {uiText.activeSimulations}
            </span>
          </div>
        </div>

        {/* New Reports */}
        <div className="flex flex-col items-center py-3 px-2 gap-1">
          <img
            src="/assets/dashboard/report.svg"
            alt="report"
            className="w-7 h-7"
          />
          <span className="text-xl font-bold text-gray-800 tabular-nums leading-none">
            {newReports}
          </span>
          <div className="flex items-center gap-1 justify-center">
            <span className="text-sm font-normal text-gray-600 text-center leading-tight">
              {uiText.newReports}
            </span>
          </div>
          {reportNote && (
            <p className="text-xs text-gray-400 font-normal text-center leading-snug mt-0.5">
              {reportNote}
            </p>
          )}
        </div>
      </div>

      {/* Buttons row */}
      <div className="grid grid-cols-3 gap-2 px-4 pb-4">
        <Button
          onClick={handleManageStudent}
          className="w-full text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white py-2 rounded-full transition-colors"
        >
          <span className="block truncate">{uiText.manageStudent}</span>
        </Button>
        <Button
          onClick={handleManageSims}
          className="w-full text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white py-2 rounded-full transition-colors"
        >
          <span className="block truncate">{uiText.manageSims}</span>
        </Button>
        <Button
          onClick={handleViewReports}
          className="w-full text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white py-2 rounded-full transition-colors"
        >
          <span className="block truncate">{uiText.viewReports}</span>
        </Button>
      </div>
    </div>
  );
}
