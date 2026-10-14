import { useFormik } from 'formik';
import { Filter, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/DropdownMenu';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import * as Yup from 'yup';
import { fetchCurrentUser } from '../../redux/auth/MeRedux';
import { getAiSeats } from '../../utils/normalizeAuthUser';
import FilterPanel from '../../components/common/FilterPanel';
import FilterChips from '../../components/common/FilterChips';
import ListTable, { type Column } from '../../components/common/ListTable';
import SortableHeader from '../../components/common/SortableHeader';
import { toast } from '../../components/common/Toast';
import { translateApiError } from '../../utils/translateApiError';
import { PageHeader } from '../../components/common/PageHeader';
import ProgressCard from '../../components/ui/ProgressCard';
import { SearchBar } from '../../components/common/SearchBar';
import { InviteEducatorRequest } from '../../redux/educator/CreateEducatorRedux';
import { DeleteEducatorRequest } from '../../redux/educator/DeleteEducatorRedux';
import { AddEducatorSchoolRequest } from '../../redux/educator/AddEducatorSchoolRedux';
import { RemoveEducatorSchoolRequest } from '../../redux/educator/RemoveEducatorSchoolRedux';
import { ResendInviteRequest } from '../../redux/educator/ResendInviteRedux';
import {
  clearGetEducatorState,
  GetEducatorByUserRequest,
  selectGetEducatorsData,
  selectGetEducatorStatus,
  selectGetEducatorResponse,
} from '../../redux/educator/GetEducatorRedux';
import { UpdateEducatorRequest } from '../../redux/educator/UpdateEducatorRedux';
import {
  GetSchoolRequest,
  selectSchools,
} from '../../redux/schools/GetSchoolsRedux';
import { selectNotifications } from '../../redux/notifications/NotificationsRedux';
import { Button } from '../../components/ui/Button';
import { getParsedUser } from '../../utils/storage';
import StatusBadge from '../../components/ui/StatusBadge';
import { getStatusTone } from '../../utils/statusTone';
import type { AppDispatch } from '../../store';
import type {
  Educator,
  EducatorFilterState,
  EducatorFormValues,
} from '../../types';
import { EDUCATOR_VALIDATION } from '../../utils/messages/educator';
import {
  EDUCATOR_NAME_MAX_LENGTH,
  hasBlockedCodingKeyword,
  hasCodeLikeSyntaxPattern,
  hasDisallowedClassNameChars,
  hasSqlInjectionLikePattern,
  hasUnsafeMarkupOrScriptPattern,
  sanitizeEducatorNameForSubmission,
  sanitizeTextForTyping,
} from '../../utils/inputSecurity';
import CreateEducatorModal from '../../components/modal/CreateEducatorModal';
import DeleteEducatorModal from '../../components/modal/DeleteEducatorModal';
import ConfirmationModal from '../../components/modal/ConfirmationModal';
import TransferClassModal from '../../components/modal/TransferClassModal';
import { RemoveSeats } from '../../redux/educator/RemoveReallocateSeatsRedux';
import {
  GetEducatorClassesRequest,
  clearEducatorClasses,
  selectEducatorClassesForTransfer,
  selectEducatorClassesStatus,
} from '../../redux/class/GetEducatorClassesRedux';
import { getDashboardOverview } from '../../redux/dashboard/admin/DashboardOverviewRedux';

import {
  DEFAULT_SORT_STATE,
  nextSortState,
  sortEducators,
  type EducatorSortState,
} from '../../utils/educatorSort';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';

type SupportedLang = 'en' | 'es';

const LANGUAGE_STORAGE_KEY = 'app_language';

// Reads admin seat totals from the auth cookie; District Admin uses subscription data, others use token fields
const computeAdminSeatData = () => {
  // Seat usage comes pre-computed from the backend for both roles.
  const { total, consumed, available } = getAiSeats(getParsedUser());
  return { purchased: total, consumed, remaining: available };
};

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

const formatLocaleText = (
  template: string,
  vars: Record<string, string | number>
) => {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) =>
    String(vars[key] ?? '')
  );
};

const DEFAULT_FILTER: EducatorFilterState = {
  educator_id: '',
  school_id: '',
  status: '',
};

function HoverTooltip({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null
  );
  const triggerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 4, left: rect.left });
    }
    setVisible(true);
  };

  return (
    <div
      ref={triggerRef}
      className="w-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible &&
        coords &&
        createPortal(
          <div
            style={{ position: 'fixed', top: coords.top, left: coords.left }}
            className="z-[9999] bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg pointer-events-none"
          >
            {label}
          </div>,
          document.body
        )}
    </div>
  );
}

function SchoolsPopup({
  schools,
}: {
  schools: Array<{ id: string; school_name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null
  );
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const updateCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 4, left: rect.left });
    }
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateCoords();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const reposition = () => updateCoords();
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  return (
    <div ref={triggerRef} className="flex flex-wrap gap-1 items-center">
      <span className="truncate max-w-[100px]" title={schools[0]?.school_name}>
        {schools[0]?.school_name}
      </span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="bg-orange-100 text-orange-600 text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap hover:bg-orange-200 transition-colors cursor-pointer"
        title={`${schools.length} schools assigned`}
      >
        +{schools.length - 1}
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{ position: 'fixed', top: coords.top, left: coords.left }}
            className="z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg min-w-[180px] max-h-52 overflow-y-auto py-1"
          >
            <p className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              All Schools
            </p>
            {schools.map((s) => (
              <div
                key={s.id}
                className="px-3 py-1.5 text-sm text-gray-700 hover:bg-orange-50 rounded-lg"
              >
                {s.school_name}
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

export default function Educators() {
  const dispatch = useDispatch<AppDispatch>();
  const location = useLocation();
  const navigate = useNavigate();
  const locationState =
    (location.state as { educatorId?: string } | null) ?? null;
  const { items: educators } = useSelector(selectGetEducatorsData);
  const educatorStatus = useSelector(selectGetEducatorStatus);
  const educatorResponse = useSelector(selectGetEducatorResponse);
  const schools = useSelector(selectSchools) || [];
  const notifications = useSelector(selectNotifications);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'view' | 'edit'>(
    'create'
  );
  const [selectedEducator, setSelectedEducator] = useState<Educator | null>(
    null
  );
  const createAdditionalSchoolIdsRef = useRef<string[]>([]);
  const editSchoolsModifiedRef = useRef(false);
  const editPendingSchoolIdsRef = useRef<string[] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tokensInput, setTokensInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResendModalOpen, setIsResendModalOpen] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendTargetEducator, setResendTargetEducator] =
    useState<Educator | null>(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferSourceEducator, setTransferSourceEducator] =
    useState<Educator | null>(null);
  // Mirrors the seat summary shown on the Admin Account page
  const [adminSeatData, setAdminSeatData] = useState(computeAdminSeatData);
  const [removeSeatsInput, setRemoveSeatsInput] = useState('');
  const educatorClassesForTransfer = useSelector(
    selectEducatorClassesForTransfer
  );
  const educatorClassesStatus = useSelector(selectEducatorClassesStatus);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [pendingFilter, setPendingFilter] =
    useState<EducatorFilterState>(DEFAULT_FILTER);
  const [appliedFilter, setAppliedFilter] =
    useState<EducatorFilterState>(DEFAULT_FILTER);
  const [showTargetHighlight, setShowTargetHighlight] = useState(true);
  const [sortState, setSortState] =
    useState<EducatorSortState>(DEFAULT_SORT_STATE);
  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const educatorsCopy = {
    title: locale?.educators?.title ?? 'Educators',
    listTitle: locale?.educators?.listTitle ?? 'All Educator List',
    addEducator: locale?.educators?.addEducator ?? 'Add Educator',
    searchPlaceholder: locale?.educators?.searchPlaceholder ?? 'Search...',
    filterTitle: locale?.educators?.filterTitle ?? 'Filter Educators',
    filterEducator: locale?.educators?.filterEducator ?? 'Educator',
    filterEducatorPlaceholder:
      locale?.educators?.filterEducatorPlaceholder ?? 'Type educator name',
    filterSchool: locale?.educators?.filterSchool ?? 'School',
    filterSchoolPlaceholder:
      locale?.educators?.filterSchoolPlaceholder ?? 'Select School',
    filterStatus: locale?.educators?.filterStatus ?? 'Status',
    filterStatusPlaceholder:
      locale?.educators?.filterStatusPlaceholder ?? 'Select Status',
    resetFilter: locale?.educators?.resetFilter ?? 'Reset Filter',
    applyFilter: locale?.educators?.applyFilter ?? 'Apply Filter',
    clear: locale?.educators?.clear ?? 'Clear',
    clearAll: locale?.educators?.clearAll ?? 'Clear All',
    headerEducatorName:
      locale?.educators?.headerEducatorName ?? 'Educator Name',
    headerEducatorEmail:
      locale?.educators?.headerEducatorEmail ?? 'Educator Email',
    headerSchoolName: locale?.educators?.headerSchoolName ?? 'School Name',
    headerAllocatedSeats:
      locale?.educators?.headerAllocatedSeats ?? 'Allocated Seats',
    headerUsedSeats: locale?.educators?.headerUsedSeats ?? 'Used Seats',
    headerRemainingSeats:
      locale?.educators?.headerRemainingSeats ?? 'Remaining Seats',
    headerStatus: locale?.educators?.headerStatus ?? 'Status',
    statusPending: locale?.educators?.statusPending ?? 'Pending',
    statusActive: locale?.educators?.statusActive ?? 'Active',
    statusInactive: locale?.educators?.statusInactive ?? 'Inactive',
    emptyMessage: locale?.educators?.emptyMessage ?? 'No educators found.',
    paginationPrev: locale?.dashboard?.prev ?? 'Prev',
    paginationNext: locale?.dashboard?.next ?? 'Next',
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      await Promise.all([
        dispatch(GetEducatorByUserRequest()).unwrap(),
        dispatch(GetSchoolRequest()).unwrap(),
      ]);
    } catch {
      return;
    }
  };

  const reactedNotificationIdsRef = useRef<Set<string>>(new Set());
  const notificationsHydratedRef = useRef(false);
  useEffect(() => {
    if (!notifications || notifications.length === 0) return;
    if (!notificationsHydratedRef.current) {
      notifications.forEach((n) => reactedNotificationIdsRef.current.add(n.id));
      notificationsHydratedRef.current = true;
      return;
    }
    let triggered = false;
    for (const n of notifications) {
      if (reactedNotificationIdsRef.current.has(n.id)) continue;
      reactedNotificationIdsRef.current.add(n.id);
      if (n.type === 'EDUCATOR_REGISTERED') {
        triggered = true;
      }
    }
    if (triggered) {
      void dispatch(GetEducatorByUserRequest());
    }
  }, [notifications, dispatch]);

  const handleSearch = (query: string) => {
    setSearchTerm(query);
  };

  const handleSort = (field: string) => {
    setSortState((prev) => nextSortState(prev, field));
  };

  const formatStatus = (status?: string) => {
    if (!status) return educatorsCopy.statusPending;
    const normalized = status.toLowerCase();
    if (normalized === 'pending') return educatorsCopy.statusPending;
    if (normalized === 'active') return educatorsCopy.statusActive;
    if (normalized === 'inactive') return educatorsCopy.statusInactive;
    return status;
  };

  const allEducators = Array.isArray(educators)
    ? (educators as Educator[])
    : [];

  const educatorStatusOptions = [
    { value: 'ACTIVE', label: educatorsCopy.statusActive },
    { value: 'PENDING', label: educatorsCopy.statusPending },
    { value: 'INACTIVE', label: educatorsCopy.statusInactive },
  ];

  const hasActiveFilters = useMemo(() => {
    return Object.values(appliedFilter).some((val) => val !== '');
  }, [appliedFilter]);

  const activeFilterChips = useMemo(() => {
    const chips: Array<{
      key: string;
      label: string;
      value: string;
      displayValue: string;
    }> = [];

    if (appliedFilter.educator_id) {
      const educator = allEducators.find(
        (e) => e.id === appliedFilter.educator_id
      );
      chips.push({
        key: 'educator_id',
        label: educatorsCopy.filterEducator,
        value: appliedFilter.educator_id,
        displayValue: educator?.full_name || appliedFilter.educator_id,
      });
    }

    if (appliedFilter.school_id) {
      const school = schools.find((s) => s.id === appliedFilter.school_id);
      chips.push({
        key: 'school_id',
        label: educatorsCopy.filterSchool,
        value: appliedFilter.school_id,
        displayValue: school?.school_name || appliedFilter.school_id,
      });
    }

    if (appliedFilter.status) {
      const statusOption = educatorStatusOptions.find(
        (opt) => opt.value === appliedFilter.status
      );
      chips.push({
        key: 'status',
        label: educatorsCopy.filterStatus,
        value: appliedFilter.status,
        displayValue: statusOption?.label || appliedFilter.status,
      });
    }

    return chips;
  }, [
    appliedFilter,
    allEducators,
    schools,
    educatorsCopy,
    educatorStatusOptions,
  ]);

  const filteredEducators = useMemo(() => {
    const filtered = allEducators.filter((e) => {
      const term = searchTerm.toLowerCase();

      const matchesSearch =
        !searchTerm ||
        e.full_name?.toLowerCase().includes(term) ||
        e.email?.toLowerCase().includes(term) ||
        e.school_name?.toLowerCase().includes(term) ||
        e.schools?.some((s) => s.school_name.toLowerCase().includes(term)) ||
        e.class_name?.toLowerCase().includes(term) ||
        (e.status || '').toLowerCase().includes(term);

      const matchesEducator =
        !appliedFilter.educator_id || e.id === appliedFilter.educator_id;

      const matchesSchool =
        !appliedFilter.school_id ||
        e.school_id === appliedFilter.school_id ||
        (e.schools?.some((s) => s.id === appliedFilter.school_id) ?? false);

      const matchesStatus =
        !appliedFilter.status ||
        (e.status || '').toUpperCase() === appliedFilter.status;

      return matchesSearch && matchesEducator && matchesSchool && matchesStatus;
    });

    return sortEducators(filtered, sortState.field, sortState.direction);
  }, [allEducators, searchTerm, appliedFilter, sortState]);

  const targetEducatorId = useMemo(() => {
    if (!showTargetHighlight) return null;
    const id = locationState?.educatorId;
    return id && id.trim().length > 0 ? id : null;
  }, [locationState, showTargetHighlight]);

  // Track if we've applied the notification filter
  const hasAppliedNotificationFilter = useRef(false);

  useEffect(() => {
    const id = locationState?.educatorId;

    // If there's no educator ID in location state, reset the ref and filters
    // This handles page refresh where location state is cleared
    if (!id || !id.trim()) {
      hasAppliedNotificationFilter.current = false;
      return;
    }

    // Only apply the filter once per navigation, not on refresh
    if (hasAppliedNotificationFilter.current) return;

    hasAppliedNotificationFilter.current = true;
    setSearchTerm('');
    setShowTargetHighlight(true);
    const nextFilter = {
      educator_id: id,
      school_id: '',
      status: '',
    };
    setPendingFilter(nextFilter);
    setAppliedFilter(nextFilter);

    // Clear the location state so on page refresh, the filter isn't reapplied
    navigate(location.pathname, { replace: true, state: {} });
  }, [locationState?.educatorId, navigate, location.pathname]);

  const columns: Column<Educator>[] = [
    {
      header: (
        <SortableHeader
          label={educatorsCopy.headerEducatorName}
          field="full_name"
          sortField={sortState.field}
          sortDirection={sortState.direction}
          onSort={handleSort}
        />
      ),
      accessor: 'full_name',
      width: '1.2fr',
      align: 'left',
    },
    {
      header: (
        <SortableHeader
          label={educatorsCopy.headerEducatorEmail}
          field="email"
          sortField={sortState.field}
          sortDirection={sortState.direction}
          onSort={handleSort}
        />
      ),
      width: '1.1fr',
      align: 'left',
      render: (row) => (
        <HoverTooltip label={row.email ?? ''}>
          <span className="block truncate w-full pr-3 cursor-default">
            {row.email ?? ''}
          </span>
        </HoverTooltip>
      ),
    },
    {
      header: (
        <SortableHeader
          label={educatorsCopy.headerSchoolName}
          field="school_name"
          sortField={sortState.field}
          sortDirection={sortState.direction}
          onSort={handleSort}
        />
      ),
      width: '1.1fr',
      align: 'left',
      render: (row) => {
        const allSchools =
          row.schools && row.schools.length > 0
            ? row.schools
            : row.school_name
              ? [{ id: row.school_id || '', school_name: row.school_name }]
              : [];
        if (!allSchools.length) return <span className="text-gray-400">—</span>;
        if (allSchools.length === 1)
          return (
            <span
              title={allSchools[0]?.school_name}
              className="truncate block max-w-full"
            >
              {allSchools[0]?.school_name}
            </span>
          );
        return <SchoolsPopup schools={allSchools} />;
      },
    },
    {
      header: (
        <SortableHeader
          label={educatorsCopy.headerAllocatedSeats}
          field="totalTokens"
          sortField={sortState.field}
          sortDirection={sortState.direction}
          onSort={handleSort}
        />
      ),
      accessor: 'totalTokens',
      align: 'center',
      width: '1fr',
    },
    {
      header: (
        <SortableHeader
          label={educatorsCopy.headerUsedSeats}
          field="tokensUsed"
          sortField={sortState.field}
          sortDirection={sortState.direction}
          onSort={handleSort}
        />
      ),
      accessor: 'tokensUsed',
      align: 'center',
      width: '1fr',
    },
    {
      header: (
        <SortableHeader
          label={educatorsCopy.headerRemainingSeats}
          field="remainingTokens"
          sortField={sortState.field}
          sortDirection={sortState.direction}
          onSort={handleSort}
        />
      ),
      accessor: 'remainingTokens',
      align: 'center',
      width: '1.1fr',
    },
    {
      header: (
        <SortableHeader
          label={educatorsCopy.headerStatus}
          field="status"
          sortField={sortState.field}
          sortDirection={sortState.direction}
          onSort={handleSort}
        />
      ),
      align: 'center',
      width: '1fr',
      render: (row) => (
        <StatusBadge
          tone={getStatusTone(row.status ?? 'pending')}
          label={formatStatus(row.status)}
        />
      ),
    },
  ];

  const formik = useFormik<EducatorFormValues>({
    initialValues: {
      full_name: '',
      email: '',
      status: 'PENDING',
      tokens: 0,
      school_id: '',
    },
    validationSchema: Yup.object({
      full_name: Yup.string()
        .transform((value) =>
          sanitizeTextForTyping(value ?? '', EDUCATOR_NAME_MAX_LENGTH)
        )
        .required(
          locale?.validation?.educatorNameRequired ??
            EDUCATOR_VALIDATION.NAME_REQUIRED
        )
        .min(3, 'Educator name must be at least 3 characters')
        .max(
          EDUCATOR_NAME_MAX_LENGTH,
          locale?.validation?.educatorNameMaxLength ??
            EDUCATOR_VALIDATION.NAME_MAX_LENGTH
        )
        .test(
          'safe-markup-pattern',
          'Educator name cannot include HTML or script-like content',
          (value) => !value || !hasUnsafeMarkupOrScriptPattern(value)
        )
        .test(
          'allowed-characters',
          'Educator name cannot include < or > characters',
          (value) => !value || !hasDisallowedClassNameChars(value)
        )
        .test(
          'sql-injection-pattern',
          'Educator name looks like a query. Please enter a normal name.',
          (value) => !value || !hasSqlInjectionLikePattern(value)
        )
        .test(
          'blocked-coding-keyword',
          'Educator name cannot include coding or scripting keywords.',
          (value) => !value || !hasBlockedCodingKeyword(value)
        )
        .test(
          'code-like-syntax',
          'Educator name cannot include code-like syntax.',
          (value) => !value || !hasCodeLikeSyntaxPattern(value)
        ),
      email: Yup.string()
        .email(
          locale?.validation?.educatorEmailInvalid ??
            'Please enter a valid email address'
        )
        .required(
          locale?.validation?.educatorEmailRequired ??
            EDUCATOR_VALIDATION.EMAIL_REQUIRED
        ),
      school_id:
        modalMode === 'create'
          ? Yup.string().required(
              locale?.validation?.educatorSchoolRequired ??
                EDUCATOR_VALIDATION.SCHOOL_REQUIRED
            )
          : Yup.string().notRequired(),
      status: Yup.string().required(
        locale?.validation?.educatorStatusRequired ??
          EDUCATOR_VALIDATION.EDUCATOR_STATUS
      ),
      tokens: Yup.number()
        .typeError('Tokens must be a number')
        .max(
          500,
          locale?.validation?.educatorTokensMaxExceeded ??
            EDUCATOR_VALIDATION.TOKENS_MAX_EXCEEDED
        )
        .notRequired(),
    }),
    onSubmit: async (values) => {
      const sanitizedName = sanitizeEducatorNameForSubmission(values.full_name);

      if (
        hasUnsafeMarkupOrScriptPattern(sanitizedName) ||
        hasDisallowedClassNameChars(sanitizedName) ||
        hasSqlInjectionLikePattern(sanitizedName) ||
        hasBlockedCodingKeyword(sanitizedName) ||
        hasCodeLikeSyntaxPattern(sanitizedName)
      ) {
        formik.setFieldError(
          'full_name',
          'Educator name contains unsafe content. Please enter plain text only.'
        );
        return;
      }

      // Validate remove-seats input before allowing submit
      if (modalMode === 'edit' && removeSeatsInput.trim() !== '') {
        const removeAmount = Number(removeSeatsInput);
        if (isNaN(removeAmount) || removeAmount <= 0) {
          toast.error(locale.toast.removeSeatsGreaterZero);
          return;
        }
        if (tokensInput.trim() !== '' && Number(tokensInput) > 0) {
          formik.setFieldError(
            'tokens',
            locale.educators.removeSeatsError ??
              'Cannot add and remove seats at the same time'
          );
          formik.setFieldTouched('tokens', true, true);
          return;
        }
        const maxRemove = selectedEducator?.remainingTokens ?? 0;
        if (removeAmount > maxRemove) {
          toast.error(
            (
              locale.toast.cannotRemoveMoreSeats ??
              'Cannot remove more than {max} available seats'
            ).replace('{max}', String(maxRemove))
          );
          return;
        }
      }

      // Prevent adding more seats than the admin currently has available
      if (
        modalMode === 'edit' &&
        tokensInput.trim() !== '' &&
        Number(tokensInput) > adminSeatData.remaining
      ) {
        formik.setFieldError(
          'tokens',
          `Cannot add more than ${adminSeatData.remaining} currently available seats`
        );
        formik.setFieldTouched('tokens', true, true);
        return;
      }

      if (
        modalMode === 'edit' &&
        !formik.dirty &&
        editPendingSchoolIdsRef.current === null &&
        removeSeatsInput.trim() === ''
      ) {
        toast.error(locale.toast.noChangesMade);
        return;
      }
      setIsSubmitting(true);

      const isInactive =
        modalMode === 'create' && values.status.toUpperCase() === 'INACTIVE';

      const payload: EducatorFormValues = {
        ...values,
        full_name: sanitizedName,
        email: values.email,
        status:
          modalMode === 'create'
            ? isInactive
              ? 'INACTIVE'
              : 'PENDING'
            : values.status.toUpperCase(),
        tokens:
          modalMode === 'create'
            ? Number(values.tokens)
            : tokensInput.trim() !== ''
              ? Number(values.tokens)
              : 0,
      };

      try {
        if (modalMode === 'create') {
          await dispatch(InviteEducatorRequest(payload)).unwrap();
          toast.success(
            isInactive
              ? locale.toast.educatorCreated
              : locale.toast.educatorInvited
          );
          const extraSchoolIds = createAdditionalSchoolIdsRef.current.slice();
          createAdditionalSchoolIdsRef.current = [];

          setIsModalOpen(false);
          formik.resetForm({
            values: {
              full_name: '',
              email: '',
              status: 'PENDING',
              school_id: '',
              tokens: 0,
            },
          });
          await dispatch(clearGetEducatorState());

          try {
            const freshRes = await dispatch(
              GetEducatorByUserRequest()
            ).unwrap();
            if (extraSchoolIds.length > 0) {
              const freshItems: Educator[] =
                (freshRes as { data?: { items?: Educator[] } })?.data?.items ??
                [];
              const newEducator = freshItems.find(
                (e) => e.email === values.email
              );
              if (newEducator?.id) {
                for (const schoolId of extraSchoolIds) {
                  try {
                    await dispatch(
                      AddEducatorSchoolRequest({
                        educatorId: newEducator.id,
                        school_id: schoolId,
                      })
                    ).unwrap();
                  } catch {
                    // non-fatal — additional school assignment failed silently
                  }
                }
                await dispatch(GetEducatorByUserRequest()).unwrap();
              }
            }
            await dispatch(fetchCurrentUser()).unwrap();
          } catch {
            // ignore refresh errors
          }
        } else if (modalMode === 'edit' && selectedEducator) {
          const pendingSchoolIds = editPendingSchoolIdsRef.current;
          if (pendingSchoolIds !== null) {
            const originalSchoolIds = (selectedEducator.schools ?? []).map(
              (s) => s.id
            );
            const toAdd = pendingSchoolIds.filter(
              (id) => !originalSchoolIds.includes(id)
            );
            const toRemove = originalSchoolIds.filter(
              (id) => !pendingSchoolIds.includes(id)
            );
            for (const schoolId of toAdd) {
              await dispatch(
                AddEducatorSchoolRequest({
                  educatorId: selectedEducator.id,
                  school_id: schoolId,
                })
              ).unwrap();
            }
            for (const schoolId of toRemove) {
              await dispatch(
                RemoveEducatorSchoolRequest({
                  educatorId: selectedEducator.id,
                  schoolId,
                })
              ).unwrap();
            }
            editPendingSchoolIdsRef.current = null;
          }

          await dispatch(
            UpdateEducatorRequest({ id: selectedEducator.id, data: payload })
          ).unwrap();

          // Remove seats returns them to the admin pool; dispatched after the educator update succeeds
          if (removeSeatsInput.trim() !== '') {
            await dispatch(
              RemoveSeats({
                educatorId: selectedEducator.id,
                amount: Number(removeSeatsInput),
              })
            ).unwrap();
            const message =
              locale?.educators?.educatorUpdatedSeatsRemoved?.replace(
                '{count}',
                removeSeatsInput
              ) ||
              `Educator updated and ${removeSeatsInput} seat(s) removed successfully`;
            toast.success(message);
          } else {
            toast.success(locale.toast.educatorUpdated);
          }

          setIsModalOpen(false);
          setRemoveSeatsInput('');
          formik.resetForm({
            values: {
              full_name: '',
              email: '',
              status: 'ACTIVE',
              school_id: '',
              tokens: 0,
            },
          });
          await dispatch(clearGetEducatorState());

          try {
            await dispatch(GetEducatorByUserRequest()).unwrap();
            // Refresh the stored user so seat counts reflect the deduction
            await dispatch(fetchCurrentUser()).unwrap();
            // Recompute from updated cookie so the header summary stays in sync
            setAdminSeatData(computeAdminSeatData());
          } catch {
            return;
          }
        }
      } catch (err: unknown) {
        const msg =
          (err as { message?: string })?.message || 'Something went wrong';

        if (
          (modalMode === 'create' || modalMode === 'edit') &&
          msg.toLowerCase().includes('insufficient')
        ) {
          formik.setFieldError('tokens', msg);
          formik.setFieldTouched('tokens', true, true);
        }
        const translatedMsg = translateApiError(msg, language);
        toast.error(translatedMsg);
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  const handleAddEducator = () => {
    setModalMode('create');
    setSelectedEducator(null);
    createAdditionalSchoolIdsRef.current = [];
    formik.resetForm({
      values: {
        full_name: '',
        email: '',
        status: 'ACTIVE',
        school_id: '',
        tokens: 0,
      },
    });
    setTokensInput('');
    setRemoveSeatsInput('');
    setAdminSeatData(computeAdminSeatData());
    setIsSubmitting(false);
    setIsModalOpen(true);
  };

  const openModal = (educator: Educator, mode: 'view' | 'edit') => {
    setModalMode(mode);
    setSelectedEducator(educator);
    editSchoolsModifiedRef.current = false;
    editPendingSchoolIdsRef.current = null;
    formik.resetForm({
      values: {
        full_name: educator.full_name ?? '',
        email: educator.email ?? '',
        status: (educator.status || 'ACTIVE').toUpperCase(),
        school_id: educator.school_id ?? '',
        tokens: educator.tokens || 0,
      },
    });
    setTokensInput('');
    setRemoveSeatsInput('');
    setAdminSeatData(computeAdminSeatData());
    setIsSubmitting(false);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (educator: Educator) => {
    setSelectedEducator(educator);
    setIsDeleteModalOpen(true);
    setIsDeleting(false);
  };

  const handleTransferClick = async (educator: Educator) => {
    setTransferSourceEducator(educator);
    dispatch(clearEducatorClasses());
    setIsTransferModalOpen(true);
    try {
      await dispatch(GetEducatorClassesRequest(educator.id)).unwrap();
    } catch {
      // error shown inside modal
    }
  };

  const confirmDelete = async () => {
    if (!selectedEducator) return;
    setIsDeleting(true);

    try {
      await dispatch(DeleteEducatorRequest(selectedEducator.id)).unwrap();
      setIsDeleteModalOpen(false);
      setSelectedEducator(null);
      await dispatch(GetEducatorByUserRequest()).unwrap();
      dispatch(getDashboardOverview());
      toast.success(locale.toast.educatorDeleted);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message;
      const translatedMsg = msg
        ? translateApiError(msg, language)
        : locale.toast.deleteFailed;
      toast.error(translatedMsg);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddSchoolToEducator = async (
    educatorId: string,
    schoolId: string
  ): Promise<void> => {
    try {
      await dispatch(
        AddEducatorSchoolRequest({ educatorId, school_id: schoolId })
      ).unwrap();
      await dispatch(GetEducatorByUserRequest()).unwrap();
      editSchoolsModifiedRef.current = true;
      toast.success(locale.toast.schoolAddedToEducator);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message;
      const translatedMsg = msg
        ? translateApiError(msg, language)
        : locale.toast.failedToAddSchool;
      toast.error(translatedMsg);
      throw err;
    }
  };

  const handleRemoveSchoolFromEducator = async (
    educatorId: string,
    schoolId: string
  ): Promise<void> => {
    try {
      await dispatch(
        RemoveEducatorSchoolRequest({ educatorId, schoolId })
      ).unwrap();
      await dispatch(GetEducatorByUserRequest()).unwrap();
      editSchoolsModifiedRef.current = true;
      toast.success(locale.toast.schoolRemovedFromEducator);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message;
      const translatedMsg = msg
        ? translateApiError(msg, language)
        : locale.toast.failedToRemoveSchool;
      toast.error(translatedMsg);
      throw err;
    }
  };

  const handleResendClick = (educator: Educator) => {
    setResendTargetEducator(educator);
    setIsResendModalOpen(true);
  };

  const confirmResend = async () => {
    if (!resendTargetEducator) return;
    setIsResending(true);
    try {
      await dispatch(ResendInviteRequest(resendTargetEducator.id)).unwrap();
      toast.success(locale.toast.invitationResent);
      setIsResendModalOpen(false);
      setResendTargetEducator(null);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message;
      const translatedMsg = msg
        ? translateApiError(msg, language)
        : locale.toast.failedToResendInvitation;
      toast.error(translatedMsg);
    } finally {
      setIsResending(false);
    }
  };

  const handleApplyFilter = () => {
    setAppliedFilter({ ...pendingFilter });
    setIsFilterOpen(false);
  };

  const handleResetFilter = () => {
    setPendingFilter(DEFAULT_FILTER);
    setAppliedFilter(DEFAULT_FILTER);
    setShowTargetHighlight(false);
  };

  const handleRemoveFilter = (key: string) => {
    const nextFilter = { ...appliedFilter, [key]: '' };
    setPendingFilter(nextFilter);
    setAppliedFilter(nextFilter);
    // Clear target highlighting when removing educator filter
    if (key === 'educator_id') {
      setShowTargetHighlight(false);
    }
  };

  const handleClearAllFilters = () => {
    setPendingFilter(DEFAULT_FILTER);
    setAppliedFilter(DEFAULT_FILTER);
    setShowTargetHighlight(false);
  };

  const handleCloseFilter = () => {
    setPendingFilter({ ...appliedFilter });
    setIsFilterOpen(false);
  };

  return (
    <div className="p-6 min-h-full font-sans text-text-primary">
      <PageHeader
        title={educatorsCopy.title}
        actionButton={
          <Button
            variant="gradient"
            className="h-10 px-5 flex items-center gap-2 rounded-full shadow-md"
            onClick={handleAddEducator}
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            {educatorsCopy.addEducator}
          </Button>
        }
        sub_text={''}
        summaryCards={
          <>
            <ProgressCard
              label={locale.account.totalSeats}
              value={String(adminSeatData.purchased)}
              subText={locale.account.totalSeatsSubtext}
            />
            <ProgressCard
              label={locale.account.usedSeats}
              value={String(adminSeatData.consumed)}
              progress={adminSeatData.consumed}
              total={adminSeatData.purchased}
              subText={formatLocaleText(locale.account.usedSeatsSubtext, {
                used: adminSeatData.consumed,
                total: adminSeatData.purchased,
              })}
            />
            <ProgressCard
              label={locale.account.remainingSeats}
              value={String(adminSeatData.remaining)}
              progress={adminSeatData.remaining}
              total={adminSeatData.purchased}
              subText={formatLocaleText(locale.account.remainingSeatsSubtext, {
                remaining: adminSeatData.remaining,
                total: adminSeatData.purchased,
              })}
            />
          </>
        }
      />
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100">
          <h2 className="text-base sm:text-lg font-semibold flex-1 min-w-0 truncate">
            {educatorsCopy.listTitle}
          </h2>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 ml-auto">
            <div className="w-32 sm:w-52 md:w-64 min-w-0">
              <SearchBar
                value={searchTerm}
                onSearch={handleSearch}
                placeholder={educatorsCopy.searchPlaceholder}
                debounceMs={1000}
                className="w-full"
              />
            </div>
            <Button
              variant="outline"
              className={`w-10 h-10 sm:w-11 sm:h-11 flex-shrink-0 flex items-center justify-center rounded-full border focus:outline-none focus-visible:outline-none ${
                hasActiveFilters
                  ? 'border-orange-500 bg-orange-50 text-orange-600 hover:bg-orange-100'
                  : 'border-gray-400 hover:border-orange-500'
              }`}
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              aria-label={hasActiveFilters ? 'Filter (active)' : 'Filter'}
            >
              <Filter size={18} strokeWidth={2.5} />
            </Button>
          </div>
        </div>
        {activeFilterChips.length > 0 && (
          <FilterChips
            filters={activeFilterChips}
            onRemoveFilter={handleRemoveFilter}
            onClearAll={handleClearAllFilters}
            clearAllLabel={
              activeFilterChips.length === 1
                ? educatorsCopy.clear
                : educatorsCopy.clearAll
            }
            className="px-6"
          />
        )}
        {isFilterOpen && (
          <FilterPanel
            title={educatorsCopy.filterTitle}
            onApply={handleApplyFilter}
            onReset={handleResetFilter}
            onClose={handleCloseFilter}
            resetLabel={educatorsCopy.resetFilter}
            applyLabel={educatorsCopy.applyFilter}
            noFiltersMessage={
              locale?.educators?.noFiltersApplied ?? 'No filters applied'
            }
            fields={[
              {
                label: educatorsCopy.filterEducator,
                value: pendingFilter.educator_id,
                placeholder: educatorsCopy.filterEducatorPlaceholder,
                searchable: true,
                onChange: (val) =>
                  setPendingFilter((p) => ({
                    ...p,
                    educator_id: val,
                  })),
                options: [...allEducators]
                  .sort((a, b) =>
                    (a.full_name || '').localeCompare(b.full_name || '')
                  )
                  .map((e) => ({
                    value: e.id,
                    label: e.full_name || '',
                  })),
              },
              {
                label: educatorsCopy.filterSchool,
                value: pendingFilter.school_id,
                placeholder: educatorsCopy.filterSchoolPlaceholder,
                onChange: (val) =>
                  setPendingFilter((p) => ({ ...p, school_id: val })),
                options: schools
                  .filter((s) => s.status?.toUpperCase() === 'ACTIVE')
                  .sort((a, b) => a.school_name.localeCompare(b.school_name))
                  .map((s) => ({
                    value: s.id,
                    label: s.school_name,
                  })),
              },
              {
                label: educatorsCopy.filterStatus,
                value: pendingFilter.status,
                placeholder: educatorsCopy.filterStatusPlaceholder,
                onChange: (val) =>
                  setPendingFilter((p) => ({ ...p, status: val })),
                options: educatorStatusOptions,
              },
            ]}
          />
        )}

        <ListTable
          columns={columns}
          data={filteredEducators}
          targetRowId={targetEducatorId}
          rowClassName={(row) =>
            targetEducatorId && String(row.id) === String(targetEducatorId)
              ? 'bg-orange-50'
              : ''
          }
          actionHeader={locale?.schools?.headerActions ?? 'Actions'}
          actionColWidth="minmax(60px, 80px)"
          prevLabel={educatorsCopy.paginationPrev}
          nextLabel={educatorsCopy.paginationNext}
          loading={
            educatorResponse === null &&
            (educatorStatus === 'idle' || educatorStatus === 'loading')
          }
          emptyMessage={educatorsCopy.emptyMessage}
          renderActions={(row) => {
            const isActive = (row.status || '').toUpperCase() === 'ACTIVE';
            const isPending = (row.status || '').toUpperCase() === 'PENDING';
            return (
              <div className="flex items-center justify-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="row actions"
                      className="flex items-center gap-1 p-2 rounded-full hover:bg-gray-100"
                    >
                      {[0, 1, 2].map((d) => (
                        <span
                          key={d}
                          className="w-1.5 h-1.5 rounded-full bg-gray-500 inline-block"
                        />
                      ))}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem
                      onSelect={() => openModal(row, 'view')}
                      className="gap-2"
                    >
                      {locale.educatorActions.view}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => openModal(row, 'edit')}
                      className="gap-2"
                    >
                      {locale.educatorActions.edit}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => void handleTransferClick(row)}
                      disabled={!isActive}
                      className="gap-2"
                    >
                      {locale.educatorActions.transferClass}
                    </DropdownMenuItem>
                    {isPending && (
                      <DropdownMenuItem
                        onSelect={() => handleResendClick(row)}
                        disabled={
                          isResending && resendTargetEducator?.id === row.id
                        }
                        className="gap-2"
                      >
                        {locale.educatorActions.resendInvitation}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => handleDeleteClick(row)}
                      className="gap-2 text-red-600 focus:text-red-600 focus:bg-red-50"
                    >
                      {locale.educatorActions.delete}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          }}
        />
      </div>

      {/*Create Educator Modal*/}
      <CreateEducatorModal
        key={selectedEducator?.id ?? 'create-new'}
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        modalMode={modalMode}
        schools={schools}
        isSubmitting={isSubmitting}
        tokensInput={tokensInput}
        setTokensInput={setTokensInput}
        selectedEducator={selectedEducator}
        onAddSchool={handleAddSchoolToEducator}
        onRemoveSchool={handleRemoveSchoolFromEducator}
        onAdditionalSchoolsChange={(ids) => {
          createAdditionalSchoolIdsRef.current = ids;
        }}
        onSchoolChanges={(ids) => {
          editPendingSchoolIdsRef.current = ids;
        }}
        formik={formik}
        adminAvailableSeats={adminSeatData.remaining}
        removeSeatsInput={removeSeatsInput}
        setRemoveSeatsInput={setRemoveSeatsInput}
      />
      <DeleteEducatorModal
        isDeleteModalOpen={isDeleteModalOpen}
        setIsDeleteModalOpen={setIsDeleteModalOpen}
        selectedEducator={selectedEducator}
        confirmDelete={confirmDelete}
        isDeleting={isDeleting}
      />
      <ConfirmationModal
        isOpen={isResendModalOpen}
        title={locale?.educators?.resendInvitationTitle || 'Resend Invitation'}
        message={(
          locale?.educators?.resendInvitationMessage ||
          'Resend the invitation email to {name}?'
        ).replace(
          '{name}',
          resendTargetEducator?.full_name ||
            resendTargetEducator?.email ||
            'this educator'
        )}
        confirmText={locale?.educators?.resend || 'Resend'}
        cancelText={locale?.educators?.cancel || 'Cancel'}
        isLoading={isResending}
        onConfirm={confirmResend}
        onCancel={() => {
          setIsResendModalOpen(false);
          setResendTargetEducator(null);
        }}
      />
      {isTransferModalOpen && transferSourceEducator && (
        <TransferClassModal
          isOpen={isTransferModalOpen}
          onClose={() => {
            setIsTransferModalOpen(false);
            setTransferSourceEducator(null);
            dispatch(clearEducatorClasses());
          }}
          sourceEducator={transferSourceEducator}
          sourceClasses={educatorClassesForTransfer}
          isLoadingClasses={educatorClassesStatus === 'loading'}
          allActiveEducators={allEducators.filter(
            (e) => (e.status || '').toUpperCase() === 'ACTIVE'
          )}
        />
      )}
    </div>
  );
}
