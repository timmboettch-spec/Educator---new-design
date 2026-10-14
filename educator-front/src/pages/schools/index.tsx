import { useFormik } from 'formik';
import { Filter, Plus } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import SortableHeader from '../../components/common/SortableHeader';
import * as Yup from 'yup';
import ListTable, { type Column } from '../../components/common/ListTable';
import { toast } from '../../components/common/Toast';
import { translateApiError } from '../../utils/translateApiError';
import { PageHeader } from '../../components/common/PageHeader';
import { SearchBar } from '../../components/common/SearchBar';
import { DeleteSchoolRequest } from '../../redux/schools/DeleteSchoolsRedux';
import {
  GetSchoolRequest,
  type School,
  selectSchoolResponse,
} from '../../redux/schools/GetSchoolsRedux';
import { PatchSchoolRequest } from '../../redux/schools/PatchSchoolsRedux';
import { PostSchoolRequest } from '../../redux/schools/PostSchoolsRedux';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { SchoolFormValues, User } from '../../types';
import { Button } from '../../components/ui/Button';
import FilterPanel from '@/components/common/FilterPanel';
import FilterChips from '@/components/common/FilterChips';
import { SCHOOL_VALIDATION } from '../../utils/messages';
import {
  SCHOOL_NAME_MAX_LENGTH,
  hasBlockedCodingKeyword,
  hasCodeLikeSyntaxPattern,
  hasDisallowedClassNameChars,
  hasSqlInjectionLikePattern,
  hasUnsafeMarkupOrScriptPattern,
  sanitizeSchoolNameForSubmission,
  sanitizeTextForTyping,
} from '../../utils/inputSecurity';
import CreateSchoolModal from '@/components/modal/CreateSchoolModal';
import ConfirmModal from '@/components/modal/ConfirmationModal';
import { getParsedUser } from '../../utils/storage';

import { getDashboardOverview } from '../../redux/dashboard/admin/DashboardOverviewRedux';
import {
  GetEducatorByUserRequest,
  selectGetEducatorsData,
} from '../../redux/educator/GetEducatorRedux';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';
import StatusBadge from '@/components/ui/StatusBadge';
import { getStatusTone } from '../../utils/statusTone';

type SupportedLang = 'en' | 'es';

const LANGUAGE_STORAGE_KEY = 'app_language';

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

type ApiError = {
  message?: string;
  data?: {
    message?: string;
  };
  error?: string;
};

export default function Schools() {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const dispatch = useAppDispatch();
  const location = useLocation();
  const locationState =
    (location.state as { schoolId?: string; schoolName?: string } | null) ??
    null;
  const schoolResponse = useAppSelector(selectSchoolResponse);
  const { items: educators } = useAppSelector(selectGetEducatorsData);
  const [user, setUser] = useState<User | null>(null);
  const schools = Array.isArray(schoolResponse?.data)
    ? schoolResponse.data
    : [];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<
    'create' | 'view' | 'edit' | 'delete'
  >('create');
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showStep1Confirm, setShowStep1Confirm] = useState(false);
  const [showStep2Confirm, setShowStep2Confirm] = useState(false);
  const [pendingSubmitValues, setPendingSubmitValues] =
    useState<SchoolFormValues | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof School | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(
    null
  );

  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const schoolsCopy = {
    title: locale?.schools?.title ?? 'Schools',
    listTitle: locale?.schools?.listTitle ?? 'All School List',
    addSchool: locale?.schools?.addSchool ?? 'Add School',
    searchPlaceholder: locale?.schools?.searchPlaceholder ?? 'Search...',
    filterTitle: locale?.schools?.filterTitle ?? 'Filter Schools',
    filterSchool: locale?.schools?.filterSchool ?? 'School',
    filterSchoolPlaceholder:
      locale?.schools?.filterSchoolPlaceholder ?? 'Select School',
    filterStatus: locale?.schools?.filterStatus ?? 'Status',
    filterStatusPlaceholder:
      locale?.schools?.filterStatusPlaceholder ?? 'Select Status',
    resetFilter: locale?.schools?.resetFilter ?? 'Reset Filter',
    applyFilter: locale?.schools?.applyFilter ?? 'Apply Filter',
    headerSchoolName: locale?.schools?.headerSchoolName ?? 'School Name',
    headerStatus: locale?.schools?.headerStatus ?? 'Status',
    headerSeatsAllocated:
      locale?.schools?.headerSeatsAllocated ?? 'Seats Allocated',
    headerSeatsUsed: locale?.schools?.headerSeatsUsed ?? 'Seats Used',
    headerSeatsRemaining:
      locale?.schools?.headerSeatsRemaining ?? 'Seats Remaining',
    headerActions: locale?.schools?.headerActions ?? 'Actions',
    paginationPrev: locale?.dashboard?.prev ?? 'Prev',
    paginationNext: locale?.dashboard?.next ?? 'Next',
    statusActive: locale?.schools?.statusActive ?? 'Active',
    statusInactive: locale?.schools?.statusInactive ?? 'Inactive',
  };

  useEffect(() => {
    const isUser = getParsedUser() as import('../../types').User | null;
    setUser(isUser);
    getSchools();
    dispatch(GetEducatorByUserRequest());
  }, []);

  const handleSort = (field: string) => {
    const key = field as keyof School;
    if (sortField === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(key);
      setSortDirection('asc');
    }
  };

  const [pendingFilter, setPendingFilter] = useState({
    school_id: '',
    status: '',
  });

  const [appliedFilter, setAppliedFilter] = useState({
    school_id: '',
    status: '',
  });

  const handleApplyFilter = () => {
    setAppliedFilter({ ...pendingFilter });
    setIsFilterOpen(false);
  };

  const handleResetFilter = () => {
    const empty = { school_id: '', status: '' };
    setPendingFilter(empty);
    setAppliedFilter(empty);
  };

  const handleCloseFilter = () => {
    setPendingFilter({ ...appliedFilter });
    setIsFilterOpen(false);
  };

  const activeFilterChips = useMemo(() => {
    const chips: Array<{
      key: string;
      label: string;
      value: string;
      displayValue: string;
    }> = [];

    if (appliedFilter.school_id) {
      const school = schools.find((s) => s.id === appliedFilter.school_id);
      chips.push({
        key: 'school_id',
        label: schoolsCopy.filterSchool,
        value: appliedFilter.school_id,
        displayValue: school?.school_name || appliedFilter.school_id,
      });
    }

    if (appliedFilter.status) {
      chips.push({
        key: 'status',
        label: schoolsCopy.filterStatus,
        value: appliedFilter.status,
        displayValue:
          appliedFilter.status.charAt(0).toUpperCase() +
          appliedFilter.status.slice(1).toLowerCase(),
      });
    }

    return chips;
  }, [appliedFilter, schools, schoolsCopy]);

  const handleRemoveFilter = (key: string) => {
    const nextFilter = { ...appliedFilter, [key]: '' };
    setPendingFilter(nextFilter);
    setAppliedFilter(nextFilter);
  };

  const handleClearAllFilters = () => {
    const empty = { school_id: '', status: '' };
    setPendingFilter(empty);
    setAppliedFilter(empty);
  };

  const getSchools = async (status?: string) => {
    try {
      if (status) {
        await dispatch(GetSchoolRequest({ status })).unwrap();
      } else {
        await dispatch(GetSchoolRequest()).unwrap();
      }
    } catch {
      return;
    }
  };

  const handleSearch = (query: string) => {
    setSearchTerm(query);
  };

  const formik = useFormik<SchoolFormValues>({
    enableReinitialize: true,
    initialValues: {
      school_name: '',
      status: 'ACTIVE',
      google_classroom_enabled: false,
    },
    validationSchema: Yup.object({
      school_name: Yup.string()
        .transform((value) =>
          sanitizeTextForTyping(value ?? '', SCHOOL_NAME_MAX_LENGTH)
        )
        .required(
          locale?.validation?.schoolNameRequired ??
            SCHOOL_VALIDATION.NAME_REQUIRED
        )
        .min(
          3,
          locale?.validation?.schoolNameMinLength ??
            'School name must be at least 3 characters'
        )
        .max(
          SCHOOL_NAME_MAX_LENGTH,
          locale?.validation?.schoolNameMaxLength ??
            SCHOOL_VALIDATION.NAME_MAX_LENGTH
        )
        .test(
          'no-leading-space',
          SCHOOL_VALIDATION.NAME_NO_LEADING_SPACE,
          (value) => !value || value === value.trimStart()
        )
        .test(
          'no-emoji',
          SCHOOL_VALIDATION.NAME_NO_EMOJI,
          (value) => !value || !/\p{Extended_Pictographic}/u.test(value)
        )
        .test(
          'safe-markup-pattern',
          'School name cannot include HTML or script-like content',
          (value) => !value || !hasUnsafeMarkupOrScriptPattern(value)
        )
        .test(
          'allowed-characters',
          'School name cannot include < or > characters',
          (value) => !value || !hasDisallowedClassNameChars(value)
        )
        .test(
          'sql-injection-pattern',
          'School name looks like a query. Please enter a normal school name.',
          (value) => !value || !hasSqlInjectionLikePattern(value)
        )
        .test(
          'blocked-coding-keyword',
          'School name cannot include coding or scripting keywords.',
          (value) => !value || !hasBlockedCodingKeyword(value)
        )
        .test(
          'code-like-syntax',
          'School name cannot include code-like syntax.',
          (value) => !value || !hasCodeLikeSyntaxPattern(value)
        ),

      status: Yup.string().required('Status is required'),
    }),

    onSubmit: async (values) => {
      setIsSubmitting(true);

      try {
        const sanitizedSchoolName = sanitizeSchoolNameForSubmission(
          values.school_name
        );

        if (
          hasUnsafeMarkupOrScriptPattern(sanitizedSchoolName) ||
          hasDisallowedClassNameChars(sanitizedSchoolName) ||
          hasSqlInjectionLikePattern(sanitizedSchoolName) ||
          hasBlockedCodingKeyword(sanitizedSchoolName) ||
          hasCodeLikeSyntaxPattern(sanitizedSchoolName)
        ) {
          formik.setFieldError(
            'school_name',
            'School name contains unsafe content. Please enter plain text only.'
          );
          setIsSubmitting(false);
          return;
        }

        if (modalMode === 'create') {
          const res = await dispatch(
            PostSchoolRequest({
              school_name: sanitizedSchoolName,
              status: values.status.toUpperCase(),
              user_id: user?.id ? String(user.id) : '',
              // Omit when false so older APIs (forbidNonWhitelisted) still accept create.
              ...(values.google_classroom_enabled === true
                ? { google_classroom_enabled: true }
                : {}),
            })
          ).unwrap();

          const msg = res?.message?.toLowerCase() || '';

          if (msg.includes('exist') || msg.includes('duplicate')) {
            toast.error(locale.toast.schoolAlreadyExists);
            formik.setFieldError(
              'school_name',
              locale.toast.schoolAlreadyExists
            );
            return;
          }

          toast.success(locale.toast.schoolCreated);
        }

        if (modalMode === 'edit' && selectedSchool) {
          if (
            values.school_name.trim() === selectedSchool.school_name.trim() &&
            values.status.toUpperCase() === selectedSchool.status &&
            values.google_classroom_enabled ===
              (selectedSchool.google_classroom_enabled === true)
          ) {
            toast.error(locale.toast.noChangesMade);
            setIsSubmitting(false);
            return;
          }

          if (
            selectedSchool.status === 'ACTIVE' &&
            values.status.toUpperCase() === 'INACTIVE'
          ) {
            setPendingSubmitValues({
              ...values,
              school_name: sanitizedSchoolName,
            });
            setIsSubmitting(false);
            setIsModalOpen(false);
            setShowStep1Confirm(true);
            return;
          }

          const res = await dispatch(
            PatchSchoolRequest({
              id: selectedSchool.id,
              school_name: sanitizedSchoolName,
              status: values.status.toUpperCase(),
              // Send true when enabling; send false only when turning off an
              // already-enabled school. Omit otherwise for older APIs.
              ...(values.google_classroom_enabled === true
                ? { google_classroom_enabled: true }
                : selectedSchool.google_classroom_enabled === true
                  ? { google_classroom_enabled: false }
                  : {}),
            })
          ).unwrap();

          const msg = res?.message?.toLowerCase() || '';

          if (msg.includes('no changes')) {
            toast.error(locale.toast.noChangesApplied);
            return;
          }

          toast.success(locale.toast.schoolUpdated);
        }

        setIsModalOpen(false);
        formik.resetForm();
        await getSchools();
      } catch (err: unknown) {
        let message = '';

        if (typeof err === 'object' && err !== null) {
          const e = err as ApiError;
          message = e.data?.message || e.message || e.error || '';
        }

        const normalizedMessage = message.toLowerCase();

        if (
          normalizedMessage.includes('exist') ||
          normalizedMessage.includes('duplicate')
        ) {
          const translatedMsg = translateApiError(message, language);
          toast.error(translatedMsg);
          formik.setFieldError('school_name', translatedMsg);
          return;
        }

        const translatedMsg = message
          ? translateApiError(message, language)
          : locale.toast.somethingWentWrong;
        toast.error(translatedMsg);
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  const handleAddSchool = () => {
    setModalMode('create');
    setSelectedSchool(null);
    formik.resetForm({
      values: {
        school_name: '',
        status: 'ACTIVE',
        google_classroom_enabled: false,
      },
    });
    setIsModalOpen(true);
  };

  const handleViewSchool = (school: School) => {
    setModalMode('view');
    setSelectedSchool(school);
    formik.setValues({
      school_name: school.school_name || '',
      status: school.status || 'ACTIVE',
      google_classroom_enabled: school.google_classroom_enabled === true,
    });
    setIsModalOpen(true);
  };

  const handleEditSchool = (school: School) => {
    setModalMode('edit');
    setSelectedSchool(school);
    formik.setValues({
      school_name: school.school_name || '',
      status: school.status || 'ACTIVE',
      google_classroom_enabled: school.google_classroom_enabled === true,
    });
    setIsModalOpen(true);
  };

  const executeInactiveUpdate = async () => {
    if (!pendingSubmitValues || !selectedSchool) return;
    setIsSubmitting(true);
    try {
      const res = await dispatch(
        PatchSchoolRequest({
          id: selectedSchool.id,
          school_name: pendingSubmitValues.school_name,
          status: 'INACTIVE',
          ...(pendingSubmitValues.google_classroom_enabled === true
            ? { google_classroom_enabled: true }
            : selectedSchool.google_classroom_enabled === true
              ? { google_classroom_enabled: false }
              : {}),
        })
      ).unwrap();

      const msg = res?.message?.toLowerCase() || '';
      if (msg.includes('no changes')) {
        toast.error(locale.toast.noChangesApplied);
      } else {
        toast.success(locale.toast.schoolUpdated);
      }

      setShowStep2Confirm(false);
      setPendingSubmitValues(null);
      formik.resetForm();
      await getSchools();
    } catch (err: unknown) {
      let message = '';
      if (typeof err === 'object' && err !== null) {
        const e = err as ApiError;
        message = e.data?.message || e.message || e.error || '';
      }
      const translatedMsg = message
        ? translateApiError(message, language)
        : locale.toast.somethingWentWrong;
      toast.error(translatedMsg);
      setShowStep2Confirm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (school: School) => {
    setSelectedSchool(school);
    setModalMode('delete');
    setIsModalOpen(true);
  };

  const confirmDelete = async () => {
    if (selectedSchool) {
      setIsDeleting(true);
      try {
        await dispatch(DeleteSchoolRequest(selectedSchool.id)).unwrap();
        toast.success(locale.toast.schoolDeleted);
        setIsModalOpen(false);
        setSelectedSchool(null);
        await getSchools();
        await dispatch(getDashboardOverview()).unwrap();
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message;
        const translatedMsg = msg
          ? translateApiError(msg, language)
          : locale.toast.deleteFailed;
        toast.error(translatedMsg);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const schoolColumns: Column<School>[] = [
    {
      header: (
        <SortableHeader
          label={schoolsCopy.headerSchoolName}
          field="school_name"
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ),
      accessor: 'school_name',
      width: '1fr',
    },
    {
      header: (
        <SortableHeader
          label={schoolsCopy.headerStatus}
          field="status"
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ),
      width: '1fr',
      align: 'center',
      render: (row) => {
        const isActive = row.status?.toUpperCase() === 'ACTIVE';
        return (
          <StatusBadge
            tone={getStatusTone(row.status)}
            label={
              isActive ? schoolsCopy.statusActive : schoolsCopy.statusInactive
            }
          />
        );
      },
    },
    {
      header: (
        <SortableHeader
          label={schoolsCopy.headerSeatsAllocated}
          field="totalTokens"
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ),
      align: 'center',
      render: (row) => (
        <span className="text-sm font-medium text-gray-700 tabular-nums">
          {row.totalTokens ?? 0}
        </span>
      ),
    },
    {
      header: (
        <SortableHeader
          label={schoolsCopy.headerSeatsUsed}
          field="tokensUsed"
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ),
      align: 'center',
      render: (row) => {
        const used = row.tokensUsed ?? 0;
        const total = row.totalTokens ?? 0;
        return (
          <div className="flex flex-col items-center gap-1">
            <span
              className={`text-sm font-medium tabular-nums ${used > 0 ? 'text-orange-600' : 'text-gray-400'}`}
            >
              {used}
            </span>
            {total > 0 && (
              <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 rounded-full"
                  style={{ width: `${Math.min((used / total) * 100, 100)}%` }}
                />
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: (
        <SortableHeader
          label={schoolsCopy.headerSeatsRemaining}
          field="remainingTokens"
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ),
      align: 'center',
      render: (row) => (
        <span
          className={`text-sm font-semibold tabular-nums ${(row.remainingTokens ?? 0) > 0 ? 'text-green-600' : 'text-gray-400'}`}
        >
          {row.remainingTokens ?? 0}
        </span>
      ),
    },
  ];

  const schoolTokenMap = useMemo(() => {
    const map: Record<
      string,
      {
        totalTokens: number;
        tokensUsed: number;
        remainingTokens: number;
        educatorCount: number;
      }
    > = {};
    for (const e of educators) {
      const sid = e.school_id;
      if (!sid) continue;
      if (!map[sid])
        map[sid] = {
          totalTokens: 0,
          tokensUsed: 0,
          remainingTokens: 0,
          educatorCount: 0,
        };
      map[sid].totalTokens += e.totalTokens ?? 0;
      map[sid].tokensUsed += e.tokensUsed ?? 0;
      map[sid].remainingTokens += e.remainingTokens ?? 0;
      map[sid].educatorCount += 1;
    }
    return map;
  }, [educators]);

  const filteredSchools = useMemo(() => {
    const filtered = schools
      .filter((school) => {
        const matchesSearch = school.school_name
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase());
        const matchesSchool =
          appliedFilter.school_id === '' ||
          school.id === appliedFilter.school_id;
        const matchesStatus =
          appliedFilter.status === '' ||
          school.status.toLowerCase() === appliedFilter.status.toLowerCase();

        return matchesSearch && matchesSchool && matchesStatus;
      })
      .map((school) => ({
        ...school,
        ...(schoolTokenMap[school.id] ?? {
          totalTokens: 0,
          tokensUsed: 0,
          remainingTokens: 0,
          educatorCount: 0,
        }),
      }));

    if (!sortField || !sortDirection) return filtered;

    const numericFields: Array<keyof School> = [
      'totalTokens',
      'tokensUsed',
      'remainingTokens',
    ];

    return [...filtered].sort((a, b) => {
      if (numericFields.includes(sortField)) {
        const aNum = Number(a[sortField] ?? 0);
        const bNum = Number(b[sortField] ?? 0);
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
      }
      const aVal = (a[sortField] ?? '').toString().toLowerCase();
      const bVal = (b[sortField] ?? '').toString().toLowerCase();
      return sortDirection === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    });
  }, [
    schools,
    searchTerm,
    appliedFilter,
    sortField,
    sortDirection,
    schoolTokenMap,
  ]);

  const targetSchoolId = useMemo(() => {
    const id = locationState?.schoolId?.trim();
    if (id) return id;

    const name = locationState?.schoolName?.trim().toLowerCase();
    if (!name) return null;

    const matched = schools.find(
      (school) => school.school_name?.trim().toLowerCase() === name
    );
    return matched?.id ?? null;
  }, [locationState, schools]);

  useEffect(() => {
    if (!targetSchoolId) return;

    setSearchTerm('');
    const nextFilter = {
      school_id: targetSchoolId,
      status: '',
    };
    setPendingFilter(nextFilter);
    setAppliedFilter(nextFilter);
  }, [targetSchoolId]);

  return (
    <div className="p-6 min-h-full font-sans text-text-primary">
      <PageHeader
        title={schoolsCopy.title}
        actionButton={
          <Button
            variant="gradient"
            className="px-7 flex items-center gap-2 rounded-full shadow-md"
            onClick={handleAddSchool}
          >
            <Plus className="text-white stroke-[4]" />
            {schoolsCopy.addSchool}
          </Button>
        }
        sub_text={''}
      />

      <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100">
          <h2 className="text-base sm:text-lg font-semibold flex-1 min-w-0 truncate">
            {schoolsCopy.listTitle}
          </h2>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 ml-auto">
            <div className="w-32 sm:w-52 md:w-64 min-w-0">
              <SearchBar
                value={searchTerm}
                onSearch={handleSearch}
                placeholder={schoolsCopy.searchPlaceholder}
                debounceMs={1000}
                className="w-full"
              />
            </div>
            <Button
              variant="outline"
              className="w-10 h-10 sm:w-11 sm:h-11 flex-shrink-0 flex items-center justify-center rounded-full border border-gray-400 focus:outline-none focus-visible:outline-none focus:border-orange-500"
              onClick={() => setIsFilterOpen(!isFilterOpen)}
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
          />
        )}

        {isFilterOpen && (
          <FilterPanel
            title={schoolsCopy.filterTitle}
            onApply={handleApplyFilter}
            onReset={handleResetFilter}
            onClose={handleCloseFilter}
            resetLabel={schoolsCopy.resetFilter}
            applyLabel={schoolsCopy.applyFilter}
            noFiltersMessage={
              locale?.schools?.noFiltersApplied ?? 'No filters applied'
            }
            fields={[
              {
                label: schoolsCopy.filterSchool,
                value: pendingFilter.school_id,
                placeholder: schoolsCopy.filterSchoolPlaceholder,
                onChange: (val) =>
                  setPendingFilter((p) => ({
                    ...p,
                    school_id: val,
                  })),
                options: [...schools]
                  .sort((a, b) => a.school_name.localeCompare(b.school_name))
                  .map((s) => ({
                    value: s.id,
                    label: s.school_name,
                  })),
              },
              {
                label: schoolsCopy.filterStatus,
                value: pendingFilter.status,
                placeholder: schoolsCopy.filterStatusPlaceholder,
                onChange: (val) =>
                  setPendingFilter((p) => ({
                    ...p,
                    status: val,
                  })),
                options: Array.from(
                  new Set(schools.map((s) => s.status).filter(Boolean))
                ).map((status) => ({
                  value: status,
                  label:
                    status.charAt(0).toUpperCase() +
                    status.slice(1).toLowerCase(),
                })),
              },
            ]}
          />
        )}

        <ListTable<School>
          columns={schoolColumns}
          data={filteredSchools}
          targetRowId={targetSchoolId}
          rowClassName={(row) =>
            targetSchoolId && String(row.id) === String(targetSchoolId)
              ? 'ring-1 ring-orange-300 bg-orange-50'
              : ''
          }
          actionHeader={schoolsCopy.headerActions}
          prevLabel={schoolsCopy.paginationPrev}
          nextLabel={schoolsCopy.paginationNext}
          onView={handleViewSchool}
          onEdit={handleEditSchool}
          onDelete={handleDeleteClick}
        />
      </div>

      <CreateSchoolModal
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        modalMode={modalMode}
        selectedSchool={selectedSchool}
        isDeleting={isDeleting}
        isSubmitting={isSubmitting}
        confirmDelete={confirmDelete}
        formik={formik}
      />

      {/* Step 1: Confirm status change to Inactive */}
      <ConfirmModal
        isOpen={showStep1Confirm}
        title="Change School Status?"
        message={`Are you sure you want to change "${selectedSchool?.school_name}" status to Inactive?`}
        confirmText="Yes, Change"
        cancelText="Cancel"
        onConfirm={() => {
          setShowStep1Confirm(false);
          setShowStep2Confirm(true);
        }}
        onCancel={() => {
          setShowStep1Confirm(false);
          setPendingSubmitValues(null);
          setIsModalOpen(true);
        }}
      />

      {/* Step 2: Warn about impact of Inactive status */}
      <ConfirmModal
        isOpen={showStep2Confirm}
        title="Impact Warning"
        message={`If "${selectedSchool?.school_name}" is set to Inactive:\n• Educator logins will stop working\n• All associated classes will stop working\n• All student codes will stop working\n\nDo you still want to proceed?`}
        confirmText="Yes, Proceed"
        cancelText="Cancel"
        isLoading={isSubmitting}
        onConfirm={executeInactiveUpdate}
        onCancel={() => {
          setShowStep2Confirm(false);
          setPendingSubmitValues(null);
          setIsModalOpen(true);
        }}
      />
    </div>
  );
}
