import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import loginEn from "../../locales/auth/login/en.json";
import loginEs from "../../locales/auth/login/es.json";
import ClassEmailReportModal from "../../components/class/BulkEmailReportModal";
import StudentEmailAccessCodeModal from "../../components/class/ClassEmailAccesscode";
import ExportReportModal from "../../components/class/simulation/ExportReportModal";
import ExportTranscriptModal from "../../components/class/simulation/ExportTranscriptModal";
import ClassActionReportsModal from "./ClassActionReportsModal";
import type { Class, ClassWithStudents } from "../../types/Class_types";
import { computeClassStatus } from "../../utils/classUtils";
import { useAppSelector, useAppDispatch } from "../../store/hooks";
import { selectEducatorReports } from "../../redux/reports/EducatorReportsRedux";
import { MarkReportViewed } from "../../redux/class/SimsCompletedreportsRedux";
import { markReportUnviewed } from "../../redux/class/GetClassRedux";

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
    status: NonNullable<Class["status"]>,
  ) => void;
  onPrint: (row: ClassWithStudents) => void;
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
  onPrint,
  defaultViewModalOpen = false,
}: ClassRowActionsProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const t = (
    localStorage.getItem("app_language")?.toLowerCase() === "es"
      ? loginEs
      : loginEn
  ).classRowActions;
  const [dropdownPos, setDropdownPos] = useState<{
    top?: number;
    bottom?: number;
    right: number;
  } | null>(null);

  const dateStatus = computeClassStatus(row.start_date, row.end_date);
  const isDateActive = dateStatus === "ACTIVE";

  const allReports = useAppSelector(selectEducatorReports);
  const classStudentIds = new Set<string>();
  for (const s of row.students ?? []) {
    if (s.user_id) classStudentIds.add(s.user_id);
    if (s.student_id) classStudentIds.add(s.student_id);
  }
  const classReports = allReports.filter(
    (r) => r.userId != null && classStudentIds.has(r.userId),
  );
  const dispatch = useAppDispatch();
  const classReportIds = classReports
    .map((r) => r.id)
    .filter((id): id is string => Boolean(id));
  const handleMarkAllReviewed = () => {
    if (classReportIds.length)
      void dispatch(
        MarkReportViewed({ reportId: classReportIds, classId: String(row.id) }),
      );
    onMenuToggle(null);
  };
  const handleMarkAllUnreviewed = () => {
    if (classReportIds.length)
      dispatch(
        markReportUnviewed({
          reportId: classReportIds,
          classId: String(row.id),
        }),
      );
    onMenuToggle(null);
  };

  const statusOptions: {
    label: string;
    value: NonNullable<Class["status"]>;
    disabled?: boolean;
  }[] = [
    { label: t.statusActive, value: "ACTIVE", disabled: !isDateActive },
    { label: t.statusDraft, value: "DRAFT" },
    { label: t.statusInactive, value: "INACTIVE" },
    { label: t.statusArchived, value: "ARCHIEVED" },
  ];

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showAccessCodeModal, setShowAccessCodeModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(defaultViewModalOpen);
  const [statusSubmenuStyle, setStatusSubmenuStyle] =
    useState<React.CSSProperties>({});
  const [showStatusSubmenu, setShowStatusSubmenu] = useState(false);
  // Which side the Class Status submenu opens on, so the caret can point at it.
  const [statusSubmenuSide, setStatusSubmenuSide] = useState<"left" | "right">(
    "right",
  );
  const statusButtonRef = useRef<HTMLButtonElement>(null);

  const handleToggleMenu = () => {
    if (openMenuId === row.id) {
      onMenuToggle(null);
    } else {
      onMenuToggle(row.id);
    }
  };

  // Position + open the Class Status submenu (shared by hover, click, keyboard).
  const openStatusSubmenu = () => {
    const rect = statusButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const SUBMENU_WIDTH = 160;
    const SUBMENU_HEIGHT = statusOptions.length * 36 + 16;
    const spaceRight = window.innerWidth - rect.right;
    const spaceBelow = window.innerHeight - rect.top;
    const opensRight = spaceRight >= SUBMENU_WIDTH;
    setStatusSubmenuSide(opensRight ? "right" : "left");
    const horizontal: React.CSSProperties = opensRight
      ? { left: "100%" }
      : { right: "100%" };
    const vertical: React.CSSProperties =
      spaceBelow >= SUBMENU_HEIGHT ? { top: 0 } : { bottom: 0 };
    setStatusSubmenuStyle({
      position: "absolute",
      width: SUBMENU_WIDTH,
      ...horizontal,
      ...vertical,
    });
    setShowStatusSubmenu(true);
  };

  // Export a CSV of this class's student codes, with class/school/date metadata
  // and a blank column for the educator to note a name per code.
  const handleExportCodesCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const dateOnly = (d?: string) => String(d ?? "").split("T")[0];
    const generated = new Date().toLocaleDateString("en-US");
    const meta = [
      ["Class Name", row.class_name],
      ["School", row.school_name],
      ["Start Date", dateOnly(row.start_date)],
      ["End Date", dateOnly(row.end_date)],
      ["Generated", generated],
    ]
      .map(([k, v]) => `${esc(k)},${esc(v)}`)
      .join("\n");
    const header = `${esc("Student Code")},${esc("Student Name")}`;
    const body = (row.students ?? [])
      .map((s) => `${esc(s.student_id)},${esc("")}`)
      .join("\n");
    const csv = `${meta}\n\n${header}\n${body}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (row.class_name ?? "class").replace(/[^\w-]+/g, "_").slice(0, 60);
    a.href = url;
    a.download = `student-codes-${safeName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onMenuToggle(null);
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
          : { top: rect.bottom + 6, right: window.innerWidth - rect.right },
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
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
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
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openMenuId, row.id, onMenuToggle, onStatusToggle]);

  useEffect(() => {
    if (openMenuId !== row.id || !dropdownPos) return;
    const rafId = requestAnimationFrame(() => {
      const first = dropdownRef.current?.querySelector<HTMLElement>(
        "button:not([disabled])",
      );
      first?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!dropdownRef.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onMenuToggle(null);
        buttonRef.current?.focus();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const focusable = Array.from(
          dropdownRef.current.querySelectorAll<HTMLElement>(
            "button:not([disabled])",
          ),
        );
        if (!focusable.length) return;
        const idx = focusable.indexOf(document.activeElement as HTMLElement);
        if (e.key === "ArrowDown") {
          focusable[idx < focusable.length - 1 ? idx + 1 : 0]?.focus();
        } else {
          focusable[idx > 0 ? idx - 1 : focusable.length - 1]?.focus();
        }
        return;
      }
      if (e.key === "Tab") {
        const focusable = Array.from(
          dropdownRef.current.querySelectorAll<HTMLElement>(
            "button:not([disabled])",
          ),
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("keydown", handleKeyDown);
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
          onClick={handleToggleMenu}
          aria-label="Class actions"
          aria-haspopup="menu"
          aria-expanded={openMenuId === row.id}
          className="flex items-center gap-1 p-2 rounded-full hover:bg-gray-100"
        >
          {[0, 1, 2].map((d) => (
            <span
              key={d}
              aria-hidden="true"
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
              {row.status !== "INACTIVE" ? (
                <>
                  <button
                    onClick={() => {
                      onEdit(row);
                      onMenuToggle(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {t.editClassDetails}
                  </button>

                  {/* Student-code group: Email → Export CSV → Print */}
                  {row.status === "ACTIVE" &&
                    row.students &&
                    row.students[0]?.email && (
                      <button
                        onClick={() => {
                          setShowAccessCodeModal(true);
                          onMenuToggle(null);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        {t.emailStudentCode}
                      </button>
                    )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExportCodesCsv();
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Export Student Codes (CSV)
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPrint(row);
                      onMenuToggle(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {t.printStudentCode}
                  </button>

                  {/* Reports group */}
                  <button
                    onClick={() => {
                      setShowViewModal(true);
                      onMenuToggle(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {t.viewReport}
                  </button>
                  <button
                    onClick={() => {
                      setShowExportModal(true);
                      onMenuToggle(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {t.exportReport}
                  </button>
                  <button
                    onClick={() => {
                      setShowTranscriptModal(true);
                      onMenuToggle(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {t.exportTranscripts}
                  </button>
                  <button
                    onClick={handleMarkAllReviewed}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Mark All Reports Reviewed
                  </button>
                  <button
                    onClick={handleMarkAllUnreviewed}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Mark All Reports Unreviewed
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
                    {t.editClassDetails}
                  </button>

                  {row.students && row.students[0]?.email && (
                    <button
                      disabled
                      className="w-full text-left px-4 py-2 text-sm text-gray-300 cursor-not-allowed"
                    >
                      {t.emailStudentCode}
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExportCodesCsv();
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Export Student Codes (CSV)
                  </button>
                  <button
                    disabled
                    className="w-full text-left px-4 py-2 text-sm text-gray-300 cursor-not-allowed"
                  >
                    {t.printStudentCode}
                  </button>

                  <button
                    onClick={() => {
                      setShowViewModal(true);
                      onMenuToggle(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {t.viewReport}
                  </button>
                  <button
                    onClick={() => {
                      setShowExportModal(true);
                      onMenuToggle(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {t.exportReport}
                  </button>
                  <button
                    onClick={() => {
                      setShowTranscriptModal(true);
                      onMenuToggle(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {t.exportTranscripts}
                  </button>
                  <button
                    onClick={handleMarkAllReviewed}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Mark All Reports Reviewed
                  </button>
                  <button
                    onClick={handleMarkAllUnreviewed}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Mark All Reports Unreviewed
                  </button>
                </>
              )}

              <div className="border-t border-gray-100 relative">
                <button
                  ref={statusButtonRef}
                  aria-haspopup="menu"
                  aria-expanded={showStatusSubmenu}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (showStatusSubmenu) {
                      setShowStatusSubmenu(false);
                      return;
                    }
                    openStatusSubmenu();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && showStatusSubmenu) {
                      e.stopPropagation();
                      setShowStatusSubmenu(false);
                    }
                  }}
                  onMouseEnter={openStatusSubmenu}
                  onMouseLeave={() => setShowStatusSubmenu(false)}
                  className="flex items-center justify-between w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {t.classStatus}
                  <span
                    className={`text-gray-500 inline-block transition-transform duration-150 ${
                      (
                        showStatusSubmenu
                          ? statusSubmenuSide === "right"
                          : statusSubmenuSide === "left"
                      )
                        ? "rotate-180"
                        : ""
                    }`}
                    aria-hidden="true"
                  >
                    ▸
                  </span>
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
                            ? "text-gray-300 cursor-not-allowed"
                            : row.status === opt.value
                              ? "text-primary-500 font-medium hover:bg-gray-50"
                              : "text-gray-700 hover:bg-gray-50"
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
                className="w-full text-left px-4 py-2 text-sm text-red-500 hover:text-red-600 hover:bg-gray-50"
              >
                Delete Class
              </button>
            </div>,
            document.body,
          )}

      {showViewModal && (
        <ClassActionReportsModal
          classId={row.id}
          className={row.class_name}
          reports={classReports}
          students={row.students ?? []}
          isClassInactive={row.status?.toUpperCase() === "ARCHIEVED"}
          onClose={() => setShowViewModal(false)}
        />
      )}

      {showExportModal && (
        <ExportReportModal
          source={{
            type: "class",
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
            type: "class",
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
