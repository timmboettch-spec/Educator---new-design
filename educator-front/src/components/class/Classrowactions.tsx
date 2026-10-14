import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import ClassEmailReportModal from '../../components/class/BulkEmailReportModal';
import StudentEmailAccessCodeModal from '../../components/class/ClassEmailAccesscode';
import ExportReportModal from '../../components/class/simulation/ExportReportModal';
import ExportTranscriptModal from '../../components/class/simulation/ExportTranscriptModal';
import ClassActionReportsModal from './ClassActionReportsModal';
import type { Class, ClassWithStudents } from '../../types/Class_types';
import { computeClassStatus } from '../../utils/classUtils';
import { useAppSelector } from '../../store/hooks';
import { selectEducatorReports } from '../../redux/reports/EducatorReportsRedux';
import { useBulkReportReview } from '../../hooks/useBulkReportReview';
import { SimulationReportSelectorType } from '../../redux/api/reports/reports.types';
import {
  CommonStatus,
  SELECTABLE_CLASS_STATUSES,
  type SelectableClassStatus,
  StudentCodesExportFormat,
} from '../../redux/api/classes/classes.types';
import { useStudentCodesExport } from '../../hooks/useStudentCodesExport';
import { PrintClassStudentCodesModal } from './PrintClassStudentCodesModal';

interface ClassRowActionsProps {
  row: ClassWithStudents;
  openMenuId: string | null;
  openStatusId: string | null;
  onMenuToggle: (id: string | null) => void;
  onStatusToggle: (id: string | null) => void;
  onEdit: (row: ClassWithStudents) => void;
  onDelete: (row: ClassWithStudents) => void;
  onStatusChange: (
    row: ClassWithStudents,
    status: NonNullable<Class['status']>
  ) => void;
  onAIInsights: (row: ClassWithStudents) => void;
  defaultViewModalOpen?: boolean;
}

export default function ClassRowActions({
  row,
  openMenuId,
  onMenuToggle,
  onStatusToggle,
  onEdit,
  onDelete,
  onStatusChange,
  defaultViewModalOpen = false,
}: ClassRowActionsProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { t } = useTranslation('classManagement');
  const [dropdownPos, setDropdownPos] = useState<{
    top?: number;
    bottom?: number;
    right: number;
  } | null>(null);

  const dateStatus = computeClassStatus(row.start_date, row.end_date);
  const isDateActive = dateStatus === 'ACTIVE';

  const allReports = useAppSelector(selectEducatorReports);
  const classStudentIds = new Set<string>();
  for (const s of row.students ?? []) {
    if (s.user_id) classStudentIds.add(s.user_id);
    if (s.student_id) classStudentIds.add(s.student_id);
  }
  const classReports = allReports.filter(
    (r) => r.userId != null && classStudentIds.has(r.userId)
  );

  const { t: tRow } = useTranslation('classManagement');
  const { review } = useBulkReportReview();

  const handleMarkAll = (reviewed: boolean) => {
    onMenuToggle(null);
    void review({
      type: SimulationReportSelectorType.CLASS,
      ids: [row.id],
      reviewed,
      classId: String(row.id),
    });
  };

  const { exportStudentCodes, printStudentCodes, cancelExport, isExporting } =
    useStudentCodesExport();
  const [showPrintModal, setShowPrintModal] = useState(false);

  const handleExportStudentCodes = (format: StudentCodesExportFormat) => {
    onMenuToggle(null);
    void exportStudentCodes({
      classId: row.id,
      className: row.class_name,
      format,
    });
  };

  const statusLabels: Record<SelectableClassStatus, string> = {
    [CommonStatus.ACTIVE]: t('rowActions.statusActive'),
    [CommonStatus.INACTIVE]: t('rowActions.statusInactive'),
    [CommonStatus.ARCHIEVED]: t('rowActions.statusArchived'),
  };
  const statusOptions = SELECTABLE_CLASS_STATUSES.map((status) => ({
    label: statusLabels[status],
    value: status,
    disabled: status === CommonStatus.ACTIVE && !isDateActive,
  }));

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showAccessCodeModal, setShowAccessCodeModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(defaultViewModalOpen);
  const [statusSubmenuStyle, setStatusSubmenuStyle] =
    useState<React.CSSProperties>({});
  const [showStatusSubmenu, setShowStatusSubmenu] = useState(false);
  const statusButtonRef = useRef<HTMLButtonElement>(null);

  const handleToggleMenu = () => {
    if (openMenuId === row.id) {
      onMenuToggle(null);
    } else {
      onMenuToggle(row.id);
    }
  };

  useEffect(() => {
    if (openMenuId === row.id) {
      const rect = buttonRef.current?.getBoundingClientRect() ?? {
        top: 0,
        bottom: 0,
        right: 0,
      };
      const DROPDOWN_HEIGHT = 320; // approximate max height of dropdown
      const spaceBelow = window.innerHeight - rect.bottom;
      const flipUp = spaceBelow < DROPDOWN_HEIGHT && rect.top > DROPDOWN_HEIGHT;
      setDropdownPos(
        flipUp
          ? {
              bottom: window.innerHeight - rect.top + 6,
              right: window.innerWidth - rect.right,
            }
          : { top: rect.bottom + 6, right: window.innerWidth - rect.right }
      );
    } else {
      setDropdownPos(null);
    }
  }, [openMenuId, row.id]);

  useEffect(() => {
    if (openMenuId !== row.id) return;
    const handleScroll = () => {
      onMenuToggle(null);
      setDropdownPos(null);
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [openMenuId, row.id, onMenuToggle]);

  useEffect(() => {
    if (openMenuId !== row.id) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const inButton = buttonRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inButton && !inDropdown) {
        onMenuToggle(null);
        onStatusToggle(null);
        setDropdownPos(null);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openMenuId, row.id, onMenuToggle, onStatusToggle]);

  useEffect(() => {
    if (openMenuId !== row.id || !dropdownPos) return;
    const rafId = requestAnimationFrame(() => {
      const first = dropdownRef.current?.querySelector<HTMLElement>(
        'button:not([disabled])'
      );
      first?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!dropdownRef.current) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onMenuToggle(null);
        buttonRef.current?.focus();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const focusable = Array.from(
          dropdownRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled])'
          )
        );
        if (!focusable.length) return;
        const idx = focusable.indexOf(document.activeElement as HTMLElement);
        if (e.key === 'ArrowDown') {
          focusable[idx < focusable.length - 1 ? idx + 1 : 0]?.focus();
        } else {
          focusable[idx > 0 ? idx - 1 : focusable.length - 1]?.focus();
        }
        return;
      }
      if (e.key === 'Tab') {
        const focusable = Array.from(
          dropdownRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled])'
          )
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenuId, row.id, dropdownPos, onMenuToggle]);

  return (
    <>
      <div
        className="relative"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          ref={buttonRef}
          type="button"
          aria-label={tRow('rowActions.menuLabel')}
          aria-haspopup="menu"
          aria-expanded={openMenuId === row.id}
          onClick={handleToggleMenu}
          className="flex items-center gap-1 p-2 rounded-full hover:bg-gray-100"
        >
          {[0, 1, 2].map((d) => (
            <span
              key={d}
              className="w-1.5 h-1.5 rounded-full bg-gray-500 inline-block"
            />
          ))}
        </button>

        {openMenuId === row.id &&
          dropdownPos &&
          createPortal(
            <div
              ref={dropdownRef}
              style={{
                top: dropdownPos.top,
                bottom: dropdownPos.bottom,
                right: dropdownPos.right,
              }}
              className="fixed bg-white border border-gray-200 rounded-xl shadow-xl min-w-[200px] py-2 z-[9999] flex flex-col"
            >
              {row.status !== 'INACTIVE' ? (
                <>
                  <button
                    onClick={() => {
                      onEdit(row);
                      onMenuToggle(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {t('rowActions.editClassDetails')}
                  </button>

                  {row.status === 'ACTIVE' &&
                    row.students &&
                    row.students[0]?.email && (
                      <button
                        onClick={() => {
                          setShowAccessCodeModal(true);
                          onMenuToggle(null);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        {t('rowActions.emailStudentCode')}
                      </button>
                    )}

                  <button
                    onClick={() =>
                      handleExportStudentCodes(StudentCodesExportFormat.CSV)
                    }
                    disabled={isExporting}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed"
                  >
                    {tRow('rowActions.exportStudentCodes')}
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowPrintModal(true);
                      onMenuToggle(null);
                    }}
                    disabled={isExporting}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed"
                  >
                    {t('rowActions.printStudentCode')}
                  </button>

                  <button
                    onClick={() => {
                      setShowViewModal(true);
                      onMenuToggle(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {tRow('rowActions.viewReport')}
                  </button>

                  <button
                    onClick={() => {
                      setShowExportModal(true);
                      onMenuToggle(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {tRow('rowActions.exportReport')}
                  </button>

                  <button
                    onClick={() => {
                      setShowTranscriptModal(true);
                      onMenuToggle(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {tRow('rowActions.exportTranscripts')}
                  </button>

                  <button
                    onClick={() => handleMarkAll(true)}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {tRow('rowActions.markAllReviewed')}
                  </button>
                  <button
                    onClick={() => handleMarkAll(false)}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {tRow('rowActions.markAllUnreviewed')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      onEdit(row);
                      onMenuToggle(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {t('rowActions.editClassDetails')}
                  </button>
                  {row.students && row.students[0]?.email && (
                    <button
                      disabled
                      className="w-full text-left px-4 py-2 text-sm text-gray-300 cursor-not-allowed"
                    >
                      {t('rowActions.emailStudentCode')}
                    </button>
                  )}
                  <button
                    onClick={() =>
                      handleExportStudentCodes(StudentCodesExportFormat.CSV)
                    }
                    disabled={isExporting}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed"
                  >
                    {tRow('rowActions.exportStudentCodes')}
                  </button>

                  <button
                    disabled
                    className="w-full text-left px-4 py-2 text-sm text-gray-300 cursor-not-allowed"
                  >
                    {t('rowActions.printStudentCode')}
                  </button>
                  <button
                    onClick={() => {
                      setShowViewModal(true);
                      onMenuToggle(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {tRow('rowActions.viewReport')}
                  </button>
                  <button
                    onClick={() => {
                      setShowExportModal(true);
                      onMenuToggle(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {tRow('rowActions.exportReport')}
                  </button>

                  <button
                    onClick={() => {
                      setShowTranscriptModal(true);
                      onMenuToggle(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {tRow('rowActions.exportTranscripts')}
                  </button>

                  <button
                    onClick={() => handleMarkAll(true)}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {tRow('rowActions.markAllReviewed')}
                  </button>
                  <button
                    onClick={() => handleMarkAll(false)}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {tRow('rowActions.markAllUnreviewed')}
                  </button>
                </>
              )}

              <div className="border-t border-gray-100 relative">
                <button
                  ref={statusButtonRef}
                  onClick={(e) => e.stopPropagation()}
                  onMouseEnter={() => {
                    const rect =
                      statusButtonRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    const SUBMENU_WIDTH = 160;
                    const SUBMENU_HEIGHT = statusOptions.length * 36 + 16;
                    const spaceRight = window.innerWidth - rect.right;
                    const spaceBelow = window.innerHeight - rect.top;
                    const horizontal: React.CSSProperties =
                      spaceRight >= SUBMENU_WIDTH
                        ? { left: '100%' }
                        : { right: '100%' };
                    const vertical: React.CSSProperties =
                      spaceBelow >= SUBMENU_HEIGHT ? { top: 0 } : { bottom: 0 };
                    setStatusSubmenuStyle({
                      position: 'absolute',
                      width: SUBMENU_WIDTH,
                      ...horizontal,
                      ...vertical,
                    });
                    setShowStatusSubmenu(true);
                  }}
                  onMouseLeave={() => setShowStatusSubmenu(false)}
                  className="flex items-center justify-between w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {t('rowActions.classStatus')}
                  <span className="text-gray-400">◂</span>
                </button>
                {showStatusSubmenu && (
                  <div
                    style={statusSubmenuStyle}
                    onMouseEnter={() => setShowStatusSubmenu(true)}
                    onMouseLeave={() => setShowStatusSubmenu(false)}
                    className="bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-[400]"
                  >
                    {statusOptions.map((opt) => (
                      <button
                        key={opt.value}
                        disabled={opt.disabled}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (opt.disabled) return;
                          onStatusChange(row, opt.value);
                          onStatusToggle(null);
                          onMenuToggle(null);
                          setShowStatusSubmenu(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm ${
                          opt.disabled
                            ? 'text-gray-300 cursor-not-allowed'
                            : row.status === opt.value
                              ? 'text-primary-500 font-medium hover:bg-gray-50'
                              : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  onDelete(row);
                  onMenuToggle(null);
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {tRow('rowActions.delete')}
              </button>
            </div>,
            document.body
          )}

        <PrintClassStudentCodesModal
          isOpen={showPrintModal}
          onClose={() => {
            // Closing while it loads (Back, X or Escape) cancels it and its print window.
            cancelExport();
            setShowPrintModal(false);
          }}
          className={row.class_name}
          isPrinting={isExporting}
          onPrint={() => {
            // Stays open after printing, as before, so the educator can print again.
            void printStudentCodes({
              classId: row.id,
              className: row.class_name,
            });
          }}
        />

        {showViewModal && (
          <ClassActionReportsModal
            classId={row.id}
            className={row.class_name}
            reports={classReports}
            students={row.students ?? []}
            isClassInactive={row.status?.toUpperCase() === 'ARCHIEVED'}
            onClose={() => setShowViewModal(false)}
          />
        )}

        {showExportModal && (
          <ExportReportModal
            source={{
              type: 'class',
              classId: row.id,
              className: row.class_name,
              startDate: row.start_date,
              endDate: row.end_date,
            }}
            students={row.students ?? []}
            onClose={() => setShowExportModal(false)}
          />
        )}

        {showTranscriptModal && (
          <ExportTranscriptModal
            source={{
              type: 'class',
              classId: row.id,
              className: row.class_name,
              startDate: row.start_date,
              endDate: row.end_date,
            }}
            students={row.students ?? []}
            onClose={() => setShowTranscriptModal(false)}
          />
        )}

        {showEmailModal && (
          <ClassEmailReportModal
            classId={row.id}
            onClose={() => setShowEmailModal(false)}
          />
        )}

        {showAccessCodeModal && (
          <StudentEmailAccessCodeModal
            class_id={row.id}
            students={row.students ?? []}
            onClose={() => setShowAccessCodeModal(false)}
          />
        )}
      </div>
    </>
  );
}
