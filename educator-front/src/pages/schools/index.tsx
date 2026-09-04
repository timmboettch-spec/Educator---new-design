import { useFormik } from "formik";
import { AlertTriangle, Filter, Plus } from "lucide-react";
import ProgressCard from "../../components/ui/ProgressCard";
import { useEffect, useRef, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SortableHeader from "../../components/common/SortableHeader";
import * as Yup from "yup";
import ListTable, { type Column } from "../../components/common/ListTable";
import { toast } from "../../components/common/Toast";
import { PageHeader } from "../../components/common/PageHeader";
import { SearchBar } from "../../components/common/SearchBar";
import { DeleteSchoolRequest } from "../../redux/schools/DeleteSchoolsRedux";
import {
  GetSchoolRequest,
  type School,
  selectSchoolResponse,
} from "../../redux/schools/GetSchoolsRedux";
import { PatchSchoolRequest } from "../../redux/schools/PatchSchoolsRedux";
import { PostSchoolRequest } from "../../redux/schools/PostSchoolsRedux";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import type { SchoolFormValues, Subscription, User } from "../../types";
import { Button } from "../../components/ui/Button";
import FilterPanel from "@/components/common/FilterPanel";
import { FilterChips } from "../../components/simulationcatalog/FilterChips";
import {
  SCHOOL_VALIDATION,
} from "../../utils/messages";
import {
  SCHOOL_NAME_MAX_LENGTH,
  hasBlockedCodingKeyword,
  hasCodeLikeSyntaxPattern,
  hasDisallowedClassNameChars,
  hasSqlInjectionLikePattern,
  hasUnsafeMarkupOrScriptPattern,
  sanitizeSchoolNameForSubmission,
  sanitizeTextForTyping,
} from "../../utils/inputSecurity";
import CreateSchoolModal from "@/components/modal/CreateSchoolModal";
import ConfirmModal from "@/components/modal/ConfirmationModal";
import TwoStepDeleteModal from "@/components/modal/TwoStepDeleteModal";
import { getParsedUser } from "../../utils/storage";
import { getEntitlementFlags } from "../../utils/entitlements";
import StatusPill from "../../components/common/StatusPill";
import api from "../../redux/api";
import config from "../../redux/config";
import { isActiveClass, getActiveStudentCount } from "../../utils/classUtils";
import type { ClassWithStudents } from "../../types/Class_types";
import { listProductUnits } from "../../components/myproducts/ProductEntitlements";
import {
  setEducatorProductAssociations,
  setEducatorProductAllocation,
} from "../../utils/productNotes";

import { getDashboardOverview } from "../../redux/dashboard/admin/DashboardOverviewRedux";
import {
  GetEducatorByUserRequest,
  selectGetEducatorsData,
} from "../../redux/educator/GetEducatorRedux";
import { AddEducatorSchoolRequest } from "../../redux/educator/AddEducatorSchoolRedux";
import { RemoveEducatorSchoolRequest } from "../../redux/educator/RemoveEducatorSchoolRedux";
import { InviteEducatorRequest } from "../../redux/educator/CreateEducatorRedux";
import loginEn from "../../locales/auth/login/en.json";
import loginEs from "../../locales/auth/login/es.json";

type SupportedLang = "en" | "es";

const LANGUAGE_STORAGE_KEY = "app_language";

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === "undefined") {
    return "en";
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === "es" ? "es" : "en";
};

// Associated-educator count → filter bucket (schools page).
const educatorAssocBucket = (count: number): "none" | "one" | "many" =>
  count === 0 ? "none" : count === 1 ? "one" : "many";
const EDUCATOR_ASSOC_OPTIONS = [
  { value: "none", label: "No associated educators" },
  { value: "one", label: "One associated educator" },
  { value: "many", label: "Many associated educators" },
];

// Sentinel option in the educator-names filter that matches schools with 0
// associated educators.
const NO_EDUCATORS_VALUE = "__no_educators__";

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
  const navigate = useNavigate();
  const locationState =
    (location.state as {
      schoolId?: string;
      schoolName?: string;
      viewSchoolId?: string;
      status?: string;
      educatorAssoc?: "with" | "without";
    } | null) ?? null;
  const schoolResponse = useAppSelector(selectSchoolResponse);
  const { items: educators } = useAppSelector(selectGetEducatorsData);
  const [user, setUser] = useState<User | null>(null);
  const schools = Array.isArray(schoolResponse?.data)
    ? schoolResponse.data
    : [];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<
    "create" | "view" | "edit" | "delete"
  >("create");
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  // When true, the Edit School modal opens with the "Add a new educator" form
  // auto-expanded (from a 0-educators chip or the View-School Add button).
  const [addEducatorOnOpen, setAddEducatorOnOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [showStep1Confirm, setShowStep1Confirm] = useState(false);
  const [showStep2Confirm, setShowStep2Confirm] = useState(false);
  const [pendingSubmitValues, setPendingSubmitValues] = useState<SchoolFormValues | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<keyof School | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(
    null,
  );
  // Per-educator active-class / active-student counts for the View School modal.
  const [educatorClassCounts, setEducatorClassCounts] = useState<
    Record<string, { activeClasses: number; activeStudents: number }>
  >({});
  const [educatorCountsLoading, setEducatorCountsLoading] = useState(false);

  const language = getStoredLanguage();
  const locale = language === "es" ? loginEs : loginEn;
  const schoolsCopy = {
    title: locale?.schools?.title ?? "Schools",
    listTitle: locale?.schools?.listTitle ?? "All School List",
    addSchool: locale?.schools?.addSchool ?? "Add School",
    searchPlaceholder: locale?.schools?.searchPlaceholder ?? "Search...",
    filterTitle: locale?.schools?.filterTitle ?? "Filter Schools",
    filterSchool: locale?.schools?.filterSchool ?? "School",
    filterSchoolPlaceholder:
      locale?.schools?.filterSchoolPlaceholder ?? "Select School",
    filterStatus: locale?.schools?.filterStatus ?? "School Status",
    filterStatusPlaceholder:
      locale?.schools?.filterStatusPlaceholder ?? "Select Status",
    resetFilter: locale?.schools?.resetFilter ?? "Reset Filter",
    applyFilter: locale?.schools?.applyFilter ?? "Apply Filter",
    headerStatus: locale?.schools?.headerStatus ?? "School Status",
    headerEducators: locale?.schools?.headerEducators ?? "Educators",
    headerSeatsAllocated:
      locale?.schools?.headerSeatsAllocated ?? "Seats Allocated",
    headerSeatsUsed:
      locale?.schools?.headerSeatsUsed ?? "Cumulative Avatar Seats Used",
    headerSeatsRemaining:
      locale?.schools?.headerSeatsRemaining ?? "Avatar Seats Remaining",
    headerHardwareHours:
      locale?.schools?.headerHardwareHours ?? "Cumulative Hardware Hours Used",
    headerActions: locale?.schools?.headerActions ?? "Actions",
    paginationPrev: locale?.dashboard?.prev ?? "Prev",
    paginationNext: locale?.dashboard?.next ?? "Next",
    statusActive: locale?.schools?.statusActive ?? "Active",
    statusInactive: locale?.schools?.statusInactive ?? "Inactive",
  };

  useEffect(() => {
    const isUser = getParsedUser() as import("../../types").User | null;
    setUser(isUser);
    getSchools();
    dispatch(GetEducatorByUserRequest());
  }, []);

  const handleSort = (field: string) => {
    const key = field as keyof School;
    if (sortField === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(key);
      setSortDirection("asc");
    }
  };

  const [pendingFilter, setPendingFilter] = useState<{
    school_ids: string[];
    statuses: string[];
    educatorAssoc: string[];
    educatorIds: string[];
  }>({
    school_ids: [],
    statuses: [],
    educatorAssoc: [],
    educatorIds: [],
  });

  const [appliedFilter, setAppliedFilter] = useState<{
    school_ids: string[];
    statuses: string[];
    educatorAssoc: string[];
    educatorIds: string[];
  }>({
    school_ids: [],
    statuses: [],
    educatorAssoc: [],
    educatorIds: [],
  });

  const hasActiveFilters =
    appliedFilter.school_ids.length > 0 ||
    appliedFilter.statuses.length > 0 ||
    appliedFilter.educatorAssoc.length > 0 ||
    appliedFilter.educatorIds.length > 0;

  const handleApplyFilter = () => {
    setAppliedFilter({ ...pendingFilter });
    setIsFilterOpen(false);
  };

  const handleResetFilter = () => {
    const empty = {
      school_ids: [],
      statuses: [],
      educatorAssoc: [],
      educatorIds: [],
    };
    setPendingFilter(empty);
    setAppliedFilter(empty);
  };

  const handleCloseFilter = () => {
    setPendingFilter({ ...appliedFilter });
    setIsFilterOpen(false);
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
      school_name: "",
      status: "ACTIVE",
    },
    validationSchema: Yup.object({
      school_name: Yup.string()
        .transform((value) =>
          sanitizeTextForTyping(value ?? "", SCHOOL_NAME_MAX_LENGTH),
        )
        .required(SCHOOL_VALIDATION.NAME_REQUIRED)
        .min(3, "School name must be at least 3 characters")
        .max(SCHOOL_NAME_MAX_LENGTH, SCHOOL_VALIDATION.NAME_MAX_LENGTH)
        .test(
          "no-leading-space",
          SCHOOL_VALIDATION.NAME_NO_LEADING_SPACE,
          (value) => !value || value === value.trimStart(),
        )
        .test(
          "no-emoji",
          SCHOOL_VALIDATION.NAME_NO_EMOJI,
          (value) => !value || !/\p{Extended_Pictographic}/u.test(value),
        )
        .test(
          "safe-markup-pattern",
          "School name cannot include HTML or script-like content",
          (value) => !value || !hasUnsafeMarkupOrScriptPattern(value),
        )
        .test(
          "allowed-characters",
          "School name cannot include < or > characters",
          (value) => !value || !hasDisallowedClassNameChars(value),
        )
        .test(
          "sql-injection-pattern",
          "School name looks like a query. Please enter a normal school name.",
          (value) => !value || !hasSqlInjectionLikePattern(value),
        )
        .test(
          "blocked-coding-keyword",
          "School name cannot include coding or scripting keywords.",
          (value) => !value || !hasBlockedCodingKeyword(value),
        )
        .test(
          "code-like-syntax",
          "School name cannot include code-like syntax.",
          (value) => !value || !hasCodeLikeSyntaxPattern(value),
        ),

      status: Yup.string().required("Status is required"),
    }),

    onSubmit: async (values) => {
      setIsSubmitting(true);

      try {
        const sanitizedSchoolName = sanitizeSchoolNameForSubmission(values.school_name);

        if (
          hasUnsafeMarkupOrScriptPattern(sanitizedSchoolName) ||
          hasDisallowedClassNameChars(sanitizedSchoolName) ||
          hasSqlInjectionLikePattern(sanitizedSchoolName) ||
          hasBlockedCodingKeyword(sanitizedSchoolName) ||
          hasCodeLikeSyntaxPattern(sanitizedSchoolName)
        ) {
          formik.setFieldError(
            "school_name",
            "School name contains unsafe content. Please enter plain text only.",
          );
          setIsSubmitting(false);
          return;
        }

        if (modalMode === "create") {
          const res = await dispatch(
            PostSchoolRequest({
              school_name: sanitizedSchoolName,
              status: values.status.toUpperCase(),
              user_id: user?.id ? String(user.id) : "",
            }),
          ).unwrap();

          const msg = res?.message?.toLowerCase() || "";

          if (msg.includes("exist") || msg.includes("duplicate")) {
            toast.error("School already exists");
            formik.setFieldError("school_name", "School already exists");
            return;
          }

          toast.success("School created successfully");
        }

        if (modalMode === "edit" && selectedSchool) {
          if (
            values.school_name.trim() === selectedSchool.school_name.trim() &&
            values.status.toUpperCase() === selectedSchool.status
          ) {
            toast.error("No changes made");
            setIsSubmitting(false);
            return;
          }

          if (
            selectedSchool.status === "ACTIVE" &&
            values.status.toUpperCase() === "INACTIVE"
          ) {
            setPendingSubmitValues({ ...values, school_name: sanitizedSchoolName });
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
            }),
          ).unwrap();

          const msg = res?.message?.toLowerCase() || "";

          if (msg.includes("no changes")) {
            toast.error("No changes applied");
            return;
          }

          toast.success("School updated successfully");
        }

        setIsModalOpen(false);
        formik.resetForm();
        await getSchools();
      } catch (err: unknown) {
        let message = "";

        if (typeof err === "object" && err !== null) {
          const e = err as ApiError;
          message = e.data?.message || e.message || e.error || "";
        }

        const normalizedMessage = message.toLowerCase();

        if (
          normalizedMessage.includes("exist") ||
          normalizedMessage.includes("duplicate")
        ) {
          toast.error("School already exists");
          formik.setFieldError("school_name", "School already exists");
          return;
        }

        toast.error(message || "Something went wrong");
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  const handleAddSchool = () => {
    setModalMode("create");
    setSelectedSchool(null);
    setAddEducatorOnOpen(false);
    formik.resetForm({ values: { school_name: "", status: "ACTIVE" } });
    setIsModalOpen(true);
  };

  const handleViewSchool = (school: School) => {
    setModalMode("view");
    setSelectedSchool(school);
    setAddEducatorOnOpen(false);
    formik.setValues({
      school_name: school.school_name || "",
      status: school.status || "ACTIVE",
    });
    setIsModalOpen(true);
  };

  const handleEditSchool = (school: School) => {
    setModalMode("edit");
    setSelectedSchool(school);
    setAddEducatorOnOpen(false);
    formik.setValues({
      school_name: school.school_name || "",
      status: school.status || "ACTIVE",
    });
    setIsModalOpen(true);
  };

  // Open the Edit School modal with the inline "Add a new educator" form
  // auto-expanded (clicking a 0-educators chip, or the View-School Add button).
  const handleAddEducatorForSchoolModal = (school: School) => {
    setModalMode("edit");
    setSelectedSchool(school);
    setAddEducatorOnOpen(true);
    formik.setValues({
      school_name: school.school_name || "",
      status: school.status || "ACTIVE",
    });
    setIsModalOpen(true);
  };

  // Educators associated with the school currently open in the modal.
  const associatedEducators = useMemo(() => {
    if (!selectedSchool) return [];
    return educators
      .filter(
        (e) =>
          e.school_id === selectedSchool.id ||
          (e.schools?.some((s) => s.id === selectedSchool.id) ?? false),
      )
      .map((e) => ({
        id: e.id,
        name: e.full_name || e.educator_name || e.email || "Unknown",
        email: e.email ?? undefined,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [educators, selectedSchool]);

  // When the View School modal is open, fetch each associated educator's classes
  // (one request per educator — no bulk endpoint exists) and aggregate active
  // class / active student counts for display.
  useEffect(() => {
    if (!(isModalOpen && modalMode === "view" && selectedSchool)) return;
    const ids = associatedEducators.map((e) => e.id);
    if (ids.length === 0) {
      setEducatorClassCounts({});
      return;
    }
    let cancelled = false;
    setEducatorCountsLoading(true);
    void (async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await api.get<{ data?: ClassWithStudents[] }>(
              `${config.ClassTransferAPI}/educator/${id}/classes`,
              { headers: { "ngrok-skip-browser-warning": "true" } },
            );
            const classes = res.data?.data ?? [];
            const active = classes.filter(isActiveClass);
            const activeStudents = active.reduce(
              (t, c) => t + getActiveStudentCount(c),
              0,
            );
            return [
              id,
              { activeClasses: active.length, activeStudents },
            ] as const;
          } catch {
            return [id, { activeClasses: 0, activeStudents: 0 }] as const;
          }
        }),
      );
      if (!cancelled) {
        setEducatorClassCounts(Object.fromEntries(entries));
        setEducatorCountsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isModalOpen, modalMode, selectedSchool, associatedEducators]);

  // Entitlement visibility: hide seat UI when no avatar product, hide hardware
  // UI when no workstation product.
  const { hasAvatar, hasWorkstation } = useMemo(() => getEntitlementFlags(), []);

  // Admin's remaining avatar-seat pool (District Admin → subscription seats;
  // others → token balance). Mirrors the educators page computation.
  const availableAvatarSeats = useMemo(() => {
    const cached = getParsedUser() as unknown as Record<string, unknown> | null;
    if (!cached) return 0;
    const roleValue = cached.role;
    const roleName =
      typeof roleValue === "string"
        ? roleValue
        : (roleValue as Record<string, string> | undefined)?.role_name || "";
    if (roleName === "District Admin") {
      const subs = (cached.subscriptions as Record<string, number>[] | undefined) || [];
      return subs.reduce((t, s) => t + (s?.seats_available || 0), 0);
    }
    return Number(cached.tokens) || 0;
  }, []);

  const allEducatorOptions = useMemo(
    () =>
      [...educators]
        .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""))
        .map((e) => ({
          value: e.id,
          label: e.full_name || e.educator_name || e.email || "Unknown",
        })),
    [educators],
  );

  // Product options for associating products to a new educator (edit modal).
  const productOptions = useMemo(() => {
    const cached = getParsedUser() as unknown as {
      subscriptions?: Subscription[];
    } | null;
    return listProductUnits(cached?.subscriptions ?? []).map((u) => ({
      value: u.key,
      label: u.label,
      kind: u.kind,
      // Per-product avatar seats still available to allocate (license remaining).
      availableSeats:
        u.kind === "online"
          ? Math.max(0, (u.seatsTotal ?? 0) - (u.seatsConsumed ?? 0))
          : undefined,
      subLabels: [
        u.usageSummary,
        u.licensedThrough ? `Expires ${u.licensedThrough}` : "",
      ].filter(Boolean),
    }));
  }, []);

  const handleAssociatedEducatorsChange = async (ids: string[]) => {
    if (!selectedSchool) return;
    const current = new Set(associatedEducators.map((e) => e.id));
    const next = new Set(ids);
    const toAdd = ids.filter((id) => !current.has(id));
    const toRemove = [...current].filter((id) => !next.has(id));
    if (toAdd.length === 0 && toRemove.length === 0) return;
    try {
      await Promise.all([
        ...toAdd.map((educatorId) =>
          dispatch(
            AddEducatorSchoolRequest({ educatorId, school_id: selectedSchool.id }),
          ).unwrap(),
        ),
        ...toRemove.map((educatorId) =>
          dispatch(
            RemoveEducatorSchoolRequest({ educatorId, schoolId: selectedSchool.id }),
          ).unwrap(),
        ),
      ]);
      await dispatch(GetEducatorByUserRequest()).unwrap().catch(() => undefined);
      toast.success("Educators updated for this school");
    } catch {
      toast.error("Could not update educators for this school");
    }
  };

  const handleCreateEducatorForSchool = async (payload: {
    name: string;
    email: string;
    status: string;
    seats: number;
    productKeys: string[];
    allocations: Record<string, number>;
  }) => {
    if (!selectedSchool) return;
    try {
      await dispatch(
        InviteEducatorRequest({
          full_name: payload.name,
          email: payload.email,
          school_id: selectedSchool.id,
          status: payload.status,
          tokens: payload.seats,
        }),
      ).unwrap();
      // Refresh, then associate the chosen products with the new educator once
      // we can resolve its id by email (admin-local notes; best-effort).
      const refreshed = (await dispatch(GetEducatorByUserRequest())
        .unwrap()
        .catch(() => undefined)) as { data?: { items?: { id?: string; email?: string }[] } } | undefined;
      if (payload.productKeys.length > 0) {
        const created = (refreshed?.data?.items ?? []).find(
          (e) => (e.email ?? "").toLowerCase() === payload.email.toLowerCase(),
        );
        if (created?.id) {
          setEducatorProductAssociations(
            created.id,
            payload.productKeys,
            productOptions.map((o) => o.value),
          );
          // Persist the per-avatar-product seat allocations (admin-local).
          for (const [key, seats] of Object.entries(payload.allocations)) {
            setEducatorProductAllocation(created.id, key, seats);
          }
        }
      }
      toast.success(`Educator "${payload.name}" added to this school`);
    } catch {
      toast.error("Could not create the educator");
    }
  };

  const executeInactiveUpdate = async () => {
    if (!pendingSubmitValues || !selectedSchool) return;
    setIsSubmitting(true);
    try {
      const res = await dispatch(
        PatchSchoolRequest({
          id: selectedSchool.id,
          school_name: pendingSubmitValues.school_name,
          status: "INACTIVE",
        }),
      ).unwrap();

      const msg = res?.message?.toLowerCase() || "";
      if (msg.includes("no changes")) {
        toast.error("No changes applied");
      } else {
        toast.success("School updated successfully");
      }

      setShowStep2Confirm(false);
      setPendingSubmitValues(null);
      formik.resetForm();
      await getSchools();
    } catch (err: unknown) {
      let message = "";
      if (typeof err === "object" && err !== null) {
        const e = err as ApiError;
        message = e.data?.message || e.message || e.error || "";
      }
      toast.error(message || "Something went wrong");
      setShowStep2Confirm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (school: School) => {
    setSelectedSchool(school);
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (selectedSchool) {
      setIsDeleting(true);
      try {
        await dispatch(DeleteSchoolRequest(selectedSchool.id)).unwrap();
        toast.success("School deleted successfully");
        setIsDeleteOpen(false);
        setIsModalOpen(false);
        setSelectedSchool(null);
        await getSchools();
        await dispatch(getDashboardOverview()).unwrap();
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message;
        toast.error(msg || "Delete failed");
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const schoolColumns: Column<School>[] = [
    {
      header: (
        <SortableHeader
          label="School Name"
          field="school_name"
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ),
      accessor: "school_name",
      width: "1fr",
    },
    {
      header: (
        <SortableHeader
          label={schoolsCopy.headerEducators}
          field="educatorCount"
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ),
      align: "center",
      render: (row) => {
        const count = row.educatorCount ?? 0;
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              // No educators yet → jump straight to adding one; otherwise show
              // the View School modal with the associated-educator list.
              if (count === 0) handleAddEducatorForSchoolModal(row);
              else handleViewSchool(row);
            }}
            className={`text-sm tabular-nums transition-colors ${
              count === 0
                ? "font-semibold text-primary-700 border border-primary-500 rounded-full px-2 py-0.5 hover:bg-[#e9e9e9]"
                : "text-gray-700 hover:text-gray-900 hover:underline"
            }`}
            aria-label={
              count === 0
                ? `Add an educator to ${row.school_name}`
                : `View educators for ${row.school_name}`
            }
          >
            {count}
          </button>
        );
      },
    },
    ...(hasAvatar
      ? ([
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
            align: "center",
            render: (row) => (
              <span className="text-sm font-medium text-gray-700 tabular-nums">
                {row.tokensUsed ?? 0}
              </span>
            ),
          },
        ] as Column<School>[])
      : []),
    ...(hasWorkstation
      ? ([
          {
            // PLACEHOLDER: hardware hours are not tracked per school yet. Shown
            // with deterministic sample data for UI review — see utils/entitlements.
            header: (
              <SortableHeader
                label={schoolsCopy.headerHardwareHours}
                field="hardwareHoursUsed"
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            ),
            align: "center",
            render: (row) => {
              // Hardware hours are shared, not allocated per school — show only
              // the total used, not used / cap.
              const used = row.hardwareHoursUsed ?? 300 + (((row.educatorCount ?? 0) * 137) % 1150);
              return (
                <span className="text-sm text-gray-700 tabular-nums">
                  {used.toLocaleString()} hrs
                </span>
              );
            },
          },
        ] as Column<School>[])
      : []),
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
      width: "1fr",
      align: "center",
      render: (row) => {
        const isActive = row.status?.toUpperCase() === "ACTIVE";
        return (
          <StatusPill
            label={isActive ? schoolsCopy.statusActive : schoolsCopy.statusInactive}
            tone={isActive ? "success" : "danger"}
          />
        );
      },
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

  // School-level usage for the View School modal: aggregate avatar seats used +
  // a deterministic placeholder for hardware hours (matches the table formula).
  const schoolUsage = useMemo(() => {
    if (!selectedSchool) return null;
    const t = schoolTokenMap[selectedSchool.id];
    const educatorCount = t?.educatorCount ?? 0;
    return {
      avatarSeatsUsed: t?.tokensUsed ?? 0,
      hardwareHoursUsed: 300 + ((educatorCount * 137) % 1150),
    };
  }, [selectedSchool, schoolTokenMap]);

  const filteredSchools = useMemo(() => {
    const filtered = schools
      .filter((school) => {
        const matchesSearch = school.school_name
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase());
        const matchesSchool =
          appliedFilter.school_ids.length === 0 ||
          appliedFilter.school_ids.includes(school.id);
        const matchesStatus =
          appliedFilter.statuses.length === 0 ||
          appliedFilter.statuses
            .map((s) => s.toLowerCase())
            .includes(school.status.toLowerCase());

        const matchesEducatorAssoc =
          appliedFilter.educatorAssoc.length === 0 ||
          appliedFilter.educatorAssoc.includes(
            educatorAssocBucket(schoolTokenMap[school.id]?.educatorCount ?? 0),
          );

        const wantsNoEducators =
          appliedFilter.educatorIds.includes(NO_EDUCATORS_VALUE);
        const selectedEducatorIds = appliedFilter.educatorIds.filter(
          (id) => id !== NO_EDUCATORS_VALUE,
        );
        const educatorCount = schoolTokenMap[school.id]?.educatorCount ?? 0;
        const matchesEducatorNames =
          appliedFilter.educatorIds.length === 0 ||
          (wantsNoEducators && educatorCount === 0) ||
          educators.some(
            (e) =>
              selectedEducatorIds.includes(e.id) &&
              (e.school_id === school.id ||
                (e.schools?.some((s) => s.id === school.id) ?? false)),
          );

        return (
          matchesSearch &&
          matchesSchool &&
          matchesStatus &&
          matchesEducatorAssoc &&
          matchesEducatorNames
        );
      })
      .map((school) => {
        const tokens =
          schoolTokenMap[school.id] ?? {
            totalTokens: 0,
            tokensUsed: 0,
            remainingTokens: 0,
            educatorCount: 0,
          };
        return {
          ...school,
          ...tokens,
          hardwareHoursUsed: 300 + ((tokens.educatorCount * 137) % 1150),
        };
      });

    if (!sortField || !sortDirection) return filtered;

    const numericFields: Array<keyof School> = ["totalTokens", "tokensUsed", "remainingTokens", "educatorCount", "hardwareHoursUsed"];

    return [...filtered].sort((a, b) => {
      if (numericFields.includes(sortField)) {
        const aNum = Number(a[sortField] ?? 0);
        const bNum = Number(b[sortField] ?? 0);
        return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
      }
      const aVal = (a[sortField] ?? "").toString().toLowerCase();
      const bVal = (b[sortField] ?? "").toString().toLowerCase();
      return sortDirection === "asc"
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
      (school) => school.school_name?.trim().toLowerCase() === name,
    );
    return matched?.id ?? null;
  }, [locationState, schools]);

  useEffect(() => {
    if (!targetSchoolId) return;

    setSearchTerm("");
    const nextFilter = {
      school_ids: [targetSchoolId],
      statuses: [],
      educatorAssoc: [],
      educatorIds: [],
    };
    setPendingFilter(nextFilter);
    setAppliedFilter(nextFilter);
  }, [targetSchoolId]);

  // Apply a status filter passed via navigation (e.g. dashboard "View Active /
  // Inactive Schools" buttons).
  const hasAppliedStatusNav = useRef(false);
  useEffect(() => {
    const status = locationState?.status;
    if (!status || !status.trim()) {
      hasAppliedStatusNav.current = false;
      return;
    }
    if (hasAppliedStatusNav.current) return;
    hasAppliedStatusNav.current = true;
    setSearchTerm("");
    const assoc = locationState?.educatorAssoc;
    const educatorAssoc =
      assoc === "with" ? ["one", "many"] : assoc === "without" ? ["none"] : [];
    const nextFilter = {
      school_ids: [],
      statuses: [status.toUpperCase()],
      educatorAssoc,
      educatorIds: [],
    };
    setPendingFilter(nextFilter);
    setAppliedFilter(nextFilter);
    navigate(location.pathname, { replace: true, state: {} });
  }, [locationState?.status, navigate, location.pathname]);

  // Deep-link from the View Educator modal: open the View School modal for the
  // clicked school once the school list is loaded, then clear nav state.
  const hasOpenedViewFromNav = useRef(false);
  useEffect(() => {
    const id = locationState?.viewSchoolId;
    if (!id || !id.trim()) {
      hasOpenedViewFromNav.current = false;
      return;
    }
    if (hasOpenedViewFromNav.current) return;
    const school = schools.find((s) => String(s.id) === String(id));
    if (!school) return; // wait for the list to load
    hasOpenedViewFromNav.current = true;
    handleViewSchool(school);
    navigate(location.pathname, { replace: true, state: {} });
  }, [locationState?.viewSchoolId, schools, navigate, location.pathname]);

  // Chips for the currently-applied filters (removable individually).
  const activeFilterChips = useMemo(() => {
    const chips: {
      key: string;
      label: string;
      value: string;
      displayValue: string;
    }[] = [];
    appliedFilter.school_ids.forEach((id) => {
      chips.push({
        key: `school_ids::${id}`,
        label: "School",
        value: id,
        displayValue: schools.find((s) => s.id === id)?.school_name ?? id,
      });
    });
    appliedFilter.educatorIds.forEach((id) => {
      chips.push({
        key: `educatorIds::${id}`,
        label: "Educator",
        value: id,
        displayValue:
          id === NO_EDUCATORS_VALUE
            ? "No associated educators"
            : allEducatorOptions.find((o) => o.value === id)?.label ?? id,
      });
    });
    appliedFilter.educatorAssoc.forEach((b) => {
      chips.push({
        key: `educatorAssoc::${b}`,
        label: "Educators",
        value: b,
        displayValue: EDUCATOR_ASSOC_OPTIONS.find((o) => o.value === b)?.label ?? b,
      });
    });
    appliedFilter.statuses.forEach((st) => {
      chips.push({
        key: `statuses::${st}`,
        label: "School Status",
        value: st,
        displayValue: st.charAt(0).toUpperCase() + st.slice(1).toLowerCase(),
      });
    });
    return chips;
  }, [appliedFilter, schools, allEducatorOptions]);

  const handleRemoveFilter = (key: string) => {
    const [field, value] = key.split("::");
    const next = {
      school_ids: [...appliedFilter.school_ids],
      statuses: [...appliedFilter.statuses],
      educatorAssoc: [...appliedFilter.educatorAssoc],
      educatorIds: [...appliedFilter.educatorIds],
    };
    if (field === "school_ids")
      next.school_ids = next.school_ids.filter((v) => v !== value);
    else if (field === "statuses")
      next.statuses = next.statuses.filter((v) => v !== value);
    else if (field === "educatorAssoc")
      next.educatorAssoc = next.educatorAssoc.filter((v) => v !== value);
    else if (field === "educatorIds")
      next.educatorIds = next.educatorIds.filter((v) => v !== value);
    setPendingFilter(next);
    setAppliedFilter(next);
  };

  // Attention tile counts + a helper that applies a filter and reveals its chips.
  const inactiveSchoolsCount = schools.filter(
    (s) => s.status?.toUpperCase() === "INACTIVE",
  ).length;
  const schoolsWithoutEducatorsCount = schools.filter(
    (s) => (schoolTokenMap[s.id]?.educatorCount ?? 0) === 0,
  ).length;
  const schoolsNeedingAttention = schools.filter(
    (s) =>
      s.status?.toUpperCase() === "INACTIVE" ||
      (schoolTokenMap[s.id]?.educatorCount ?? 0) === 0,
  ).length;
  const applyAttentionFilter = (partial: {
    statuses?: string[];
    educatorIds?: string[];
  }) => {
    const next = {
      school_ids: [],
      statuses: [],
      educatorAssoc: [],
      educatorIds: [],
      ...partial,
    };
    setPendingFilter(next);
    setAppliedFilter(next);
    // Reveal the selection in the regular filter area rather than a separate spot.
    setIsFilterOpen(true);
    setSearchTerm("");
  };

  // Compact attention tile shown in the header's empty band (only when needed).
  const attentionTile =
    schoolsNeedingAttention > 0 ? (
      <ProgressCard
        label="Schools Needing Attention"
        value={`${schoolsNeedingAttention} of ${schools.length} schools need attention`}
        progress={schoolsNeedingAttention}
        total={schools.length}
        subText="Schools inactive, or without any associated educators"
        icon={AlertTriangle}
        largeActions
        actions={[
          {
            label: `View Inactive Schools (${inactiveSchoolsCount})`,
            onClick: () => applyAttentionFilter({ statuses: ["INACTIVE"] }),
          },
          {
            label: `View Schools Without Educators (${schoolsWithoutEducatorsCount})`,
            onClick: () =>
              applyAttentionFilter({ educatorIds: [NO_EDUCATORS_VALUE] }),
          },
        ]}
      />
    ) : undefined;

  return (
    <div className="p-6 min-h-screen font-sans text-text-primary">
      <PageHeader
        title={schoolsCopy.title}
        centerContent={attentionTile}
        actionButton={
          <div className="flex flex-col items-end gap-2">
            <Button
              variant="gradient"
              className="px-7 flex items-center gap-2 rounded-full shadow-md"
              onClick={handleAddSchool}
            >
              <Plus className="text-white stroke-[4]" />
              {schoolsCopy.addSchool}
            </Button>
          </div>
        }
        sub_text={""}
      />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100">
          <h2 className="text-base sm:text-lg font-semibold flex-1 min-w-0 truncate">
            {schoolsCopy.listTitle}
            <span className="ml-2 text-sm font-medium text-gray-500">
              ({schools.length})
            </span>
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
              className={`w-10 h-10 sm:w-11 sm:h-11 flex-shrink-0 flex items-center justify-center rounded-full border focus:outline-none focus-visible:outline-none ${
                hasActiveFilters
                  ? "border-[#5f6060] bg-[#5f6060] text-white hover:bg-[#4f5050]"
                  : "border-gray-400 hover:border-primary-500 focus:border-primary-500"
              }`}
              onClick={() => setIsFilterOpen(!isFilterOpen)}
            >
              <Filter size={18} strokeWidth={2.5} />
            </Button>
          </div>
        </div>

        {isFilterOpen && (
          <FilterPanel
            title={schoolsCopy.filterTitle}
            onApply={handleApplyFilter}
            onReset={handleResetFilter}
            onClose={handleCloseFilter}
            resetLabel={schoolsCopy.resetFilter}
            applyLabel={schoolsCopy.applyFilter}
            fields={[
              {
                label: schoolsCopy.filterSchool,
                multiple: true,
                values: pendingFilter.school_ids,
                value: "",
                placeholder: schoolsCopy.filterSchoolPlaceholder,
                searchable: true,
                onChange: () => undefined,
                onValuesChange: (vals) =>
                  setPendingFilter((p) => ({ ...p, school_ids: vals })),
                options: [...schools]
                  .sort((a, b) => a.school_name.localeCompare(b.school_name))
                  .map((s) => ({
                    value: s.id,
                    label: s.school_name,
                  })),
              },
              {
                label: "Associated Educators",
                multiple: true,
                values: pendingFilter.educatorIds,
                value: "",
                placeholder: "Select educators",
                searchable: true,
                onChange: () => undefined,
                onValuesChange: (vals) =>
                  setPendingFilter((p) => ({ ...p, educatorIds: vals })),
                options: [
                  { value: NO_EDUCATORS_VALUE, label: "No associated educators" },
                  ...allEducatorOptions,
                ],
              },
              {
                label: schoolsCopy.filterStatus,
                multiple: true,
                values: pendingFilter.statuses,
                value: "",
                placeholder: schoolsCopy.filterStatusPlaceholder,
                searchable: true,
                onChange: () => undefined,
                onValuesChange: (vals) =>
                  setPendingFilter((p) => ({ ...p, statuses: vals })),
                options: Array.from(
                  new Set(schools.map((s) => s.status).filter(Boolean)),
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

        {activeFilterChips.length > 0 && (
          <FilterChips
            filters={activeFilterChips}
            onRemove={handleRemoveFilter}
            onClearAll={handleResetFilter}
          />
        )}

        <ListTable<School>
          columns={schoolColumns}
          data={filteredSchools}
          targetRowId={targetSchoolId}
          rowClassName={(row) =>
            targetSchoolId && String(row.id) === String(targetSchoolId)
              ? "ring-1 ring-primary-300 bg-primary-50"
              : ""
          }
          actionHeader={schoolsCopy.headerActions}
          prevLabel={schoolsCopy.paginationPrev}
          nextLabel={schoolsCopy.paginationNext}
          onRowClick={handleViewSchool}
          onView={handleViewSchool}
          onEdit={handleEditSchool}
          onDelete={handleDeleteClick}
        />
      </div>

      {/* Bottom Add button so the user needn't scroll back to the top. */}
      <div className="mt-4 flex justify-center">
        <Button
          variant="gradient"
          className="px-7 flex items-center gap-2 rounded-full shadow-md"
          onClick={handleAddSchool}
        >
          <Plus className="text-white stroke-[4]" />
          {schoolsCopy.addSchool}
        </Button>
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
        associatedEducators={associatedEducators}
        allEducatorOptions={allEducatorOptions}
        onAssociatedEducatorsChange={handleAssociatedEducatorsChange}
        onCreateEducator={handleCreateEducatorForSchool}
        availableAvatarSeats={availableAvatarSeats}
        hasAvatar={hasAvatar}
        hasWorkstation={hasWorkstation}
        schoolUsage={schoolUsage}
        productOptions={productOptions}
        onEditFromView={() =>
          selectedSchool && handleEditSchool(selectedSchool)
        }
        autoOpenAddEducator={addEducatorOnOpen}
        onAddEducatorFromView={() =>
          selectedSchool && handleAddEducatorForSchoolModal(selectedSchool)
        }
        onEducatorClick={(educatorId) => {
          setIsModalOpen(false);
          navigate("/educators", { state: { viewEducatorId: educatorId } });
        }}
        educatorClassCounts={educatorClassCounts}
        educatorCountsLoading={educatorCountsLoading}
      />

      <TwoStepDeleteModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={confirmDelete}
        isDeleting={isDeleting}
        itemLabel="school"
        itemName={selectedSchool?.school_name}
        confirmLabel="Delete School"
        step2Message="This permanently deletes the school. This cannot be undone."
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
