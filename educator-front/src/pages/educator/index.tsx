import { useFormik } from "formik";
import {
  AlertTriangle,
  ArrowLeftRight,
  ChevronDown,
  Eye,
  Filter,
  Plus,
  Send,
  SquarePen,
  Trash2,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import * as Yup from "yup";
import { getCurrentUserRequest } from "../../redux/users/GetUserRedux";
import FilterPanel from "../../components/common/FilterPanel";
import { FilterChips } from "../../components/simulationcatalog/FilterChips";
import ListTable, { type Column } from "../../components/common/ListTable";
import SortableHeader from "../../components/common/SortableHeader";
import { toast } from "../../components/common/Toast";
import { PageHeader } from "../../components/common/PageHeader";
import { SearchBar } from "../../components/common/SearchBar";
import ProgressCard from "../../components/ui/ProgressCard";
import { InviteEducatorRequest } from "../../redux/educator/CreateEducatorRedux";
import { DeleteEducatorRequest } from "../../redux/educator/DeleteEducatorRedux";
import { AddEducatorSchoolRequest } from "../../redux/educator/AddEducatorSchoolRedux";
import { RemoveEducatorSchoolRequest } from "../../redux/educator/RemoveEducatorSchoolRedux";
import { ResendInviteRequest } from "../../redux/educator/ResendInviteRedux";
import {
  clearGetEducatorState,
  GetEducatorByUserRequest,
  selectGetEducatorsData,
  selectGetEducatorStatus,
  selectGetEducatorResponse,
} from "../../redux/educator/GetEducatorRedux";
import { UpdateEducatorRequest } from "../../redux/educator/UpdateEducatorRedux";
import {
  GetSchoolRequest,
  selectSchools,
} from "../../redux/schools/GetSchoolsRedux";
import { PostSchoolRequest } from "../../redux/schools/PostSchoolsRedux";
import { selectNotifications } from "../../redux/notifications/NotificationsRedux";
import { Button } from "../../components/ui/Button";
import { getParsedUser, updateStoredUser } from "../../utils/storage";
import { getEntitlementFlags } from "../../utils/entitlements";
import StatusPill from "../../components/common/StatusPill";
import type { AppDispatch } from "../../store";
import type {
  Educator,
  EducatorFilterState,
  EducatorFormValues,
  Subscription,
} from "../../types";
import { EDUCATOR_VALIDATION } from "../../utils/messages/educator";
import {
  EDUCATOR_NAME_MAX_LENGTH,
  hasBlockedCodingKeyword,
  hasCodeLikeSyntaxPattern,
  hasDisallowedClassNameChars,
  hasSqlInjectionLikePattern,
  hasUnsafeMarkupOrScriptPattern,
  sanitizeEducatorNameForSubmission,
  sanitizeTextForTyping,
} from "../../utils/inputSecurity";
import CreateEducatorModal from "../../components/modal/CreateEducatorModal";
import { listProductUnits } from "../../components/myproducts/ProductEntitlements";
import AssociatedProductsPopover from "../../components/modal/AssociatedProductsPopover";
import EducatorProductsSubtable from "../../components/educator/EducatorProductsSubtable";
import {
  getAllProductNotes,
  getEducatorProductAllocation,
  getProductKeysForEducator,
  setEducatorProductAllocation,
  setEducatorProductAssociations,
} from "../../utils/productNotes";
import TwoStepDeleteModal from "../../components/modal/TwoStepDeleteModal";
import ConfirmationModal from "../../components/modal/ConfirmationModal";
import TransferClassModal from "../../components/modal/TransferClassModal";
import { RemoveSeats } from "../../redux/educator/RemoveReallocateSeatsRedux";
import {
  GetEducatorClassesRequest,
  clearEducatorClasses,
  selectEducatorClassesForTransfer,
  selectEducatorClassesStatus,
} from "../../redux/class/GetEducatorClassesRedux";
import { getDashboardOverview } from "../../redux/dashboard/admin/DashboardOverviewRedux";

import {
  DEFAULT_SORT_STATE,
  nextSortState,
  sortEducators,
  type EducatorSortState,
} from "../../utils/educatorSort";
import loginEn from "../../locales/auth/login/en.json";
import loginEs from "../../locales/auth/login/es.json";

type SupportedLang = "en" | "es";

const LANGUAGE_STORAGE_KEY = "app_language";

// Reads admin seat totals from the auth cookie; District Admin uses subscription data, others use token fields
const computeAdminSeatData = () => {
  const cached = getParsedUser();
  if (!cached) return { purchased: 0, consumed: 0, remaining: 0 };
  const roleValue = cached.role;
  const roleName =
    typeof roleValue === "string"
      ? roleValue
      : (roleValue as Record<string, string>)?.role_name || "";
  let purchased = 0, consumed = 0, remaining = 0;
  if (roleName === "District Admin") {
    const subs = (cached.subscriptions as Record<string, number>[]) || [];
    purchased = subs.reduce((t, s) => t + (s?.ai_seats || 0), 0);
    remaining = subs.reduce((t, s) => t + (s?.seats_available || 0), 0);
    consumed = purchased - remaining;
  } else {
    consumed = Number(cached.total_tokens) || Number(cached.allocated_tokens) || 0;
    remaining = Number(cached.tokens) || 0;
    purchased = consumed + remaining;
  }
  return { purchased, consumed, remaining };
};

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === "undefined") {
    return "en";
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === "es" ? "es" : "en";
};

const DEFAULT_FILTER: EducatorFilterState = {
  educator_ids: [],
  school_ids: [],
  statuses: [],
  productAssoc: [],
};

// Sentinel option in the School filter that matches educators with no school.
const NO_SCHOOLS_VALUE = "__no_schools__";
// Sentinel in the Associated Products filter matching educators with 0 products.
const NO_PRODUCTS_VALUE = "__no_products__";
// Sentinel matching educators associated with an avatar product but with NO
// avatar seats allocated across any of their avatar products.
const AVATAR_NO_SEATS_VALUE = "__avatar_no_seats__";

// Deterministic placeholder product associations for UI review (no backend yet).
// ~1 in 4 educators get 0 so the "no products" orange chip callout still shows.
const hashStr = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};
const placeholderProductKeys = (educatorId: string, allKeys: string[]): string[] => {
  if (!educatorId || allKeys.length === 0) return [];
  const h = hashStr(educatorId);
  const count = h % 4; // 0..3
  const keys: string[] = [];
  for (let i = 0; i < count; i++) keys.push(allKeys[(h + i * 7) % allKeys.length]);
  return Array.from(new Set(keys));
};
// Real localStorage associations take precedence; else fall back to placeholders.
const effectiveProductKeys = (
  educatorId: string,
  realKeys: string[],
  allKeys: string[],
): string[] => (realKeys.length ? realKeys : placeholderProductKeys(educatorId, allKeys));

function HoverTooltip({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
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
            style={{ position: "fixed", top: coords.top, left: coords.left }}
            className="z-[9999] bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg pointer-events-none"
          >
            {label}
          </div>,
          document.body,
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
    null,
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
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  return (
    <div ref={triggerRef} className="flex flex-wrap gap-1 items-center">
      <span className="truncate max-w-[100px]" title={schools[0].school_name}>
        {schools[0].school_name}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="bg-primary-100 text-primary-600 text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap hover:bg-primary-200 transition-colors cursor-pointer"
        title={`${schools.length} schools assigned`}
      >
        +{schools.length - 1}
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{ position: "fixed", top: coords.top, left: coords.left }}
            className="z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg min-w-[180px] max-h-52 overflow-y-auto py-1"
          >
            <p className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              All Schools
            </p>
            {schools.map((s) => (
              <div
                key={s.id}
                className="px-3 py-1.5 text-sm text-gray-700 hover:bg-[#e9e9e9] rounded-lg"
              >
                {s.school_name}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

export default function Educators() {
  const dispatch = useDispatch<AppDispatch>();
  const location = useLocation();
  const navigate = useNavigate();
  const locationState =
    (location.state as {
      educatorId?: string;
      status?: string;
      viewEducatorId?: string;
    } | null) ?? null;
  const { items: educators } = useSelector(selectGetEducatorsData);
  const educatorStatus = useSelector(selectGetEducatorStatus);
  const educatorResponse = useSelector(selectGetEducatorResponse);
  const schools = useSelector(selectSchools) || [];
  const notifications = useSelector(selectNotifications);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "view" | "edit">(
    "create",
  );
  const [selectedEducator, setSelectedEducator] = useState<Educator | null>(
    null,
  );
  const createAdditionalSchoolIdsRef = useRef<string[]>([]);
  const editSchoolsModifiedRef = useRef(false);
  const editPendingSchoolIdsRef = useRef<string[] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tokensInput, setTokensInput] = useState("");
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
  const [removeSeatsInput, setRemoveSeatsInput] = useState("");
  const educatorClassesForTransfer = useSelector(
    selectEducatorClassesForTransfer,
  );
  const educatorClassesStatus = useSelector(selectEducatorClassesStatus);
  // Product association (admin-local notes): options from the admin's own
  // subscriptions, and the currently-open educator's associated product keys.
  const [assocProductKeys, setAssocProductKeys] = useState<string[]>([]);
  // CREATE mode: per-avatar-product seat allocations from the modal, persisted
  // after the new educator is resolved by email.
  const [createAllocations, setCreateAllocations] = useState<
    Record<string, number>
  >({});
  // Bumped whenever product associations change so the table count recomputes.
  const [notesVersion, setNotesVersion] = useState(0);
  // Row whose per-product subtable is expanded (click the row / name chevron).
  const [expandedEducatorId, setExpandedEducatorId] = useState<string | null>(
    null,
  );
  const productUnits = useMemo(() => {
    const cached = getParsedUser() as unknown as {
      subscriptions?: Subscription[];
    } | null;
    return listProductUnits(cached?.subscriptions ?? []);
  }, []);
  // Only ACTIVE (non-expired) products count as associations — expired products
  // fall off the educator's list everywhere (count, subtable, popover, modals).
  const activeProductKeySet = useMemo(() => {
    const now = Date.now();
    return new Set(
      productUnits
        .filter((u) => {
          if (!u.licensedThrough) return true;
          const d = new Date(u.licensedThrough);
          return Number.isNaN(d.getTime()) || d.getTime() >= now;
        })
        .map((u) => u.key),
    );
  }, [productUnits]);
  const activeProductUnits = useMemo(
    () => productUnits.filter((u) => activeProductKeySet.has(u.key)),
    [productUnits, activeProductKeySet],
  );
  const productOptions = useMemo(
    () =>
      activeProductUnits.map((u) => ({
        value: u.key,
        label: u.label,
        kind: u.kind,
        // Per-product avatar seats still available to allocate (license remaining).
        availableSeats:
          u.kind === "online"
            ? Math.max(0, (u.seatsTotal ?? 0) - (u.seatsConsumed ?? 0))
            : undefined,
        // Product name (label) + usage (avatar: remaining seats / workstation:
        // used hours) + expiry, shown on each option in the association menu.
        subLabels: [
          u.usageSummary,
          u.licensedThrough ? `Expires ${u.licensedThrough}` : "",
        ].filter(Boolean),
      })),
    [activeProductUnits],
  );
  const associatedProductDetails = useMemo(
    () =>
      productUnits.filter(
        (u) => assocProductKeys.includes(u.key) && activeProductKeySet.has(u.key),
      ),
    [productUnits, assocProductKeys, activeProductKeySet],
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [pendingFilter, setPendingFilter] =
    useState<EducatorFilterState>(DEFAULT_FILTER);
  const [appliedFilter, setAppliedFilter] =
    useState<EducatorFilterState>(DEFAULT_FILTER);
  const [showTargetHighlight, setShowTargetHighlight] = useState(true);
  const [sortState, setSortState] =
    useState<EducatorSortState>(DEFAULT_SORT_STATE);
  const language = getStoredLanguage();
  const locale = language === "es" ? loginEs : loginEn;
  const educatorsCopy = {
    title: locale?.educators?.title ?? "Educators",
    listTitle: locale?.educators?.listTitle ?? "All Educator List",
    addEducator: locale?.educators?.addEducator ?? "Add Educator",
    searchPlaceholder: locale?.educators?.searchPlaceholder ?? "Search...",
    filterTitle: locale?.educators?.filterTitle ?? "Filter Educators",
    filterEducator: locale?.educators?.filterEducator ?? "Educator",
    filterEducatorPlaceholder:
      locale?.educators?.filterEducatorPlaceholder ?? "Type educator name",
    filterSchool: locale?.educators?.filterSchool ?? "School",
    filterSchoolPlaceholder:
      locale?.educators?.filterSchoolPlaceholder ?? "Select School",
    filterStatus: locale?.educators?.filterStatus ?? "Educator Status",
    filterStatusPlaceholder:
      locale?.educators?.filterStatusPlaceholder ?? "Select Status",
    resetFilter: locale?.educators?.resetFilter ?? "Reset Filter",
    applyFilter: locale?.educators?.applyFilter ?? "Apply Filter",
    clear: locale?.educators?.clear ?? "Clear",
    clearAll: locale?.educators?.clearAll ?? "Clear All",
    headerEducatorName:
      locale?.educators?.headerEducatorName ?? "Educator Name",
    headerEducatorEmail:
      locale?.educators?.headerEducatorEmail ?? "Educator Email",
    headerSchoolName: locale?.educators?.headerSchoolName ?? "School Name",
    headerAllocatedSeats:
      locale?.educators?.headerAllocatedSeats ?? "Allocated Seats",
    headerUsedSeats: locale?.educators?.headerUsedSeats ?? "Avatar Seats Used",
    headerRemainingSeats:
      locale?.educators?.headerRemainingSeats ?? "Avatar Seats Remaining",
    headerHardwareHours:
      locale?.educators?.headerHardwareHours ?? "Hardware Hours Used",
    headerStatus: locale?.educators?.headerStatus ?? "Status",
    statusPending: locale?.educators?.statusPending ?? "Pending",
    statusActive: locale?.educators?.statusActive ?? "Active",
    statusInactive: locale?.educators?.statusInactive ?? "Inactive",
    emptyMessage: locale?.educators?.emptyMessage ?? "No educators found.",
    paginationPrev: locale?.dashboard?.prev ?? "Prev",
    paginationNext: locale?.dashboard?.next ?? "Next",
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
      if (n.type === "EDUCATOR_REGISTERED") {
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
    if (normalized === "pending") return educatorsCopy.statusPending;
    if (normalized === "active") return educatorsCopy.statusActive;
    if (normalized === "inactive") return educatorsCopy.statusInactive;
    return status;
  };

  const allEducators = Array.isArray(educators)
    ? (educators as Educator[])
    : [];

  // Associated-product count per educator: real localStorage associations where
  // present, else deterministic placeholder (for UI review). Recomputes when
  // associations change (notesVersion) or the educator/product lists change.
  // Effective associated-product KEYS per educator (real localStorage notes where
  // present, else deterministic placeholder for UI review).
  const productKeysByEducator = useMemo(() => {
    const all = getAllProductNotes();
    const realKeys: Record<string, string[]> = {};
    Object.entries(all).forEach(([entKey, note]) =>
      note.educatorIds.forEach((id) => {
        (realKeys[id] ??= []).push(entKey);
      }),
    );
    const allKeys = productUnits.map((u) => u.key);
    const map: Record<string, string[]> = {};
    allEducators.forEach((e) => {
      const id = e.id ?? "";
      const keys = realKeys[id]?.length
        ? realKeys[id]
        : placeholderProductKeys(id, allKeys);
      // Expired products fall off — only active associations are surfaced.
      map[id] = keys.filter((k) => activeProductKeySet.has(k));
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesVersion, allEducators, productUnits, activeProductKeySet]);
  const productCountByEducator = useMemo(() => {
    const map: Record<string, number> = {};
    Object.entries(productKeysByEducator).forEach(([id, keys]) => {
      map[id] = keys.length;
    });
    return map;
  }, [productKeysByEducator]);
  // Avatar (online) product keys — used to flag educators associated with an
  // avatar product that have no seats allocated on any of them.
  const avatarProductKeySet = useMemo(
    () => new Set(productUnits.filter((u) => u.kind === "online").map((u) => u.key)),
    [productUnits],
  );
  // IDs of educators associated with ≥1 avatar product but with 0 allocated
  // avatar seats across all of them (a watch-out — they can't launch avatar sims).
  const avatarNoSeatsEducatorIds = useMemo(() => {
    const ids = new Set<string>();
    allEducators.forEach((e) => {
      const id = e.id ?? "";
      const avatarKeys = (productKeysByEducator[id] ?? []).filter((k) =>
        avatarProductKeySet.has(k),
      );
      if (avatarKeys.length === 0) return;
      const allocated = avatarKeys.reduce(
        (sum, k) => sum + getEducatorProductAllocation(id, k),
        0,
      );
      if (allocated === 0) ids.add(id);
    });
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEducators, productKeysByEducator, avatarProductKeySet, notesVersion]);

  const educatorStatusOptions = [
    { value: "ACTIVE", label: educatorsCopy.statusActive },
    { value: "PENDING", label: educatorsCopy.statusPending },
    { value: "INACTIVE", label: educatorsCopy.statusInactive },
  ];

  const hasActiveFilters = useMemo(() => {
    return (
      appliedFilter.educator_ids.length > 0 ||
      appliedFilter.school_ids.length > 0 ||
      appliedFilter.statuses.length > 0 ||
      (appliedFilter.productAssoc?.length ?? 0) > 0
    );
  }, [appliedFilter]);

  const activeFilterChips = useMemo(() => {
    const chips: Array<{
      key: string;
      label: string;
      value: string;
      displayValue: string;
    }> = [];

    appliedFilter.educator_ids.forEach((id) => {
      const educator = allEducators.find((e) => e.id === id);
      chips.push({
        key: `educator_ids::${id}`,
        label: educatorsCopy.filterEducator,
        value: id,
        displayValue: educator?.full_name || id,
      });
    });

    appliedFilter.school_ids.forEach((id) => {
      const school = schools.find((s) => s.id === id);
      chips.push({
        key: `school_ids::${id}`,
        label: educatorsCopy.filterSchool,
        value: id,
        displayValue:
          id === NO_SCHOOLS_VALUE
            ? "No associated schools"
            : school?.school_name || id,
      });
    });

    appliedFilter.statuses.forEach((st) => {
      const statusOption = educatorStatusOptions.find((opt) => opt.value === st);
      chips.push({
        key: `statuses::${st}`,
        label: educatorsCopy.filterStatus,
        value: st,
        displayValue: statusOption?.label || st,
      });
    });

    (appliedFilter.productAssoc ?? []).forEach((v) => {
      chips.push({
        key: `productAssoc::${v}`,
        label: "Products",
        value: v,
        displayValue:
          v === NO_PRODUCTS_VALUE
            ? "No associated products"
            : v === AVATAR_NO_SEATS_VALUE
              ? "Avatar product, no seats allocated"
              : productOptions.find((o) => o.value === v)?.label ?? v,
      });
    });

    return chips;
  }, [appliedFilter, allEducators, schools, educatorsCopy, educatorStatusOptions, productOptions]);

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
        (e.status || "").toLowerCase().includes(term);

      const matchesEducator =
        appliedFilter.educator_ids.length === 0 ||
        appliedFilter.educator_ids.includes(e.id ?? "");

      const wantsNoSchools = appliedFilter.school_ids.includes(NO_SCHOOLS_VALUE);
      const hasNoSchool = !e.school_id && (e.schools?.length ?? 0) === 0;
      const matchesSchool =
        appliedFilter.school_ids.length === 0 ||
        (wantsNoSchools && hasNoSchool) ||
        appliedFilter.school_ids.includes(e.school_id ?? "") ||
        (e.schools?.some((s) => appliedFilter.school_ids.includes(s.id)) ?? false);

      const matchesStatus =
        appliedFilter.statuses.length === 0 ||
        appliedFilter.statuses.includes((e.status || "").toUpperCase());

      const productAssocSel = appliedFilter.productAssoc ?? [];
      const wantsNoProducts = productAssocSel.includes(NO_PRODUCTS_VALUE);
      const wantsAvatarNoSeats = productAssocSel.includes(AVATAR_NO_SEATS_VALUE);
      const selectedProductKeys = productAssocSel.filter(
        (v) => v !== NO_PRODUCTS_VALUE && v !== AVATAR_NO_SEATS_VALUE,
      );
      const eduProductKeys = productKeysByEducator[e.id ?? ""] ?? [];
      const matchesProductAssoc =
        productAssocSel.length === 0 ||
        (wantsNoProducts && eduProductKeys.length === 0) ||
        (wantsAvatarNoSeats && avatarNoSeatsEducatorIds.has(e.id ?? "")) ||
        selectedProductKeys.some((k) => eduProductKeys.includes(k));

      return (
        matchesSearch &&
        matchesEducator &&
        matchesSchool &&
        matchesStatus &&
        matchesProductAssoc
      );
    });

    // Derived columns (not on the Educator object) sort in-component.
    if (
      sortState.field === "associatedProducts" ||
      sortState.field === "hardwareHours"
    ) {
      const valueFor = (e: Educator) =>
        sortState.field === "associatedProducts"
          ? productCountByEducator[e.id ?? ""] ?? 0
          : 120 + ((e.tokensUsed ?? 0) % 1300);
      return [...filtered].sort((a, b) => {
        const d = valueFor(a) - valueFor(b);
        return sortState.direction === "asc" ? d : -d;
      });
    }

    return sortEducators(filtered, sortState.field, sortState.direction);
  }, [allEducators, searchTerm, appliedFilter, sortState, productCountByEducator, productKeysByEducator, avatarNoSeatsEducatorIds]);

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
    setSearchTerm("");
    setShowTargetHighlight(true);
    const nextFilter: EducatorFilterState = {
      educator_ids: [id],
      school_ids: [],
      statuses: [],
    };
    setPendingFilter(nextFilter);
    setAppliedFilter(nextFilter);
    
    // Clear the location state so on page refresh, the filter isn't reapplied
    navigate(location.pathname, { replace: true, state: {} });
  }, [locationState?.educatorId, navigate, location.pathname]);

  // Apply a status filter passed via navigation (e.g. "View Pending Educators").
  const hasAppliedStatusFilter = useRef(false);
  useEffect(() => {
    const status = locationState?.status;
    if (!status || !status.trim()) {
      hasAppliedStatusFilter.current = false;
      return;
    }
    if (hasAppliedStatusFilter.current) return;
    hasAppliedStatusFilter.current = true;
    setSearchTerm("");
    const nextFilter: EducatorFilterState = {
      educator_ids: [],
      school_ids: [],
      statuses: [status.toUpperCase()],
    };
    setPendingFilter(nextFilter);
    setAppliedFilter(nextFilter);
    navigate(location.pathname, { replace: true, state: {} });
  }, [locationState?.status, navigate, location.pathname]);

  // Entitlement visibility: hide avatar-seat columns when no avatar product,
  // hardware-hours column when no workstation product.
  const { hasAvatar } = useMemo(() => getEntitlementFlags(), []);

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
      width: "1.3fr",
      align: "left",
      render: (row) => {
        const isExpanded = expandedEducatorId === (row.id ?? "");
        return (
          <span className="flex items-start gap-1.5 min-w-0">
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={`mt-0.5 shrink-0 text-gray-500 transition-transform ${
                isExpanded ? "" : "-rotate-90"
              }`}
            />
            <span className="block break-words whitespace-normal">
              {row.full_name ?? ""}
            </span>
          </span>
        );
      },
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
      width: "1.6fr",
      align: "left",
      render: (row) => (
        <span className="block break-words whitespace-normal w-full pr-3">
          {row.email ?? ""}
        </span>
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
      width: "1.6fr",
      align: "left",
      render: (row) => {
        const allSchools =
          row.schools && row.schools.length > 0
            ? row.schools
            : row.school_name
              ? [{ id: row.school_id || "", school_name: row.school_name }]
              : [];
        if (!allSchools.length) return <span className="text-gray-500">—</span>;
        if (allSchools.length === 1)
          return (
            <span
              title={allSchools[0].school_name}
              className="block break-words whitespace-normal max-w-full"
            >
              {allSchools[0].school_name}
            </span>
          );
        return <SchoolsPopup schools={allSchools} />;
      },
    },
    {
      // Always-on: number of products associated with this educator (admin-local
      // notes). Orange chip border when zero, to flag educators with no products.
      // Seat usage stays visible in the view/edit educator modals.
      header: (
        <SortableHeader
          label="Associated Products"
          field="associatedProducts"
          sortField={sortState.field}
          sortDirection={sortState.direction}
          onSort={handleSort}
        />
      ),
      align: "center",
      width: "0.9fr",
      render: (row) => {
        const count = productCountByEducator[row.id] ?? 0;
        const eduId = row.id ?? "";
        return (
          <AssociatedProductsPopover
            count={count}
            educatorName={row.full_name ?? "this educator"}
            options={productOptions}
            values={productKeysByEducator[eduId] ?? []}
            onChange={(keys) => {
              setEducatorProductAssociations(
                eduId,
                keys,
                productOptions.map((o) => o.value),
              );
              setNotesVersion((v) => v + 1);
            }}
            ariaLabel={
              count === 0
                ? "No products associated — view or associate products"
                : `${count} associated product${count === 1 ? "" : "s"} — view or associate products`
            }
          />
        );
      },
    },
    // Avatar Seats Remaining and Hardware Hours Used columns were removed from
    // this top-level table — those figures now live per-license in the educator's
    // Associated Products subtable, not aggregated at the educator level.
    {
      header: (
        <SortableHeader
          label="Educator Status"
          field="status"
          sortField={sortState.field}
          sortDirection={sortState.direction}
          onSort={handleSort}
        />
      ),
      align: "center",
      width: "0.9fr",
      render: (row) => {
        const label = formatStatus(row.status);
        const tone =
          label === educatorsCopy.statusActive
            ? "success"
            : label === educatorsCopy.statusPending
              ? "warning"
              : "danger";
        return <StatusPill label={label} tone={tone} />;
      },
    },
  ];

  const formik = useFormik<EducatorFormValues>({
    initialValues: {
      full_name: "",
      email: "",
      status: "PENDING",
      tokens: 0,
      school_id: "",
    },
    validationSchema: Yup.object({
      full_name: Yup.string()
        .transform((value) =>
          sanitizeTextForTyping(value ?? "", EDUCATOR_NAME_MAX_LENGTH),
        )
        .required(EDUCATOR_VALIDATION.NAME_REQUIRED)
        .min(3, "Educator name must be at least 3 characters")
        .max(EDUCATOR_NAME_MAX_LENGTH, EDUCATOR_VALIDATION.NAME_MAX_LENGTH)
        .test(
          "safe-markup-pattern",
          "Educator name cannot include HTML or script-like content",
          (value) => !value || !hasUnsafeMarkupOrScriptPattern(value),
        )
        .test(
          "allowed-characters",
          "Educator name cannot include < or > characters",
          (value) => !value || !hasDisallowedClassNameChars(value),
        )
        .test(
          "sql-injection-pattern",
          "Educator name looks like a query. Please enter a normal name.",
          (value) => !value || !hasSqlInjectionLikePattern(value),
        )
        .test(
          "blocked-coding-keyword",
          "Educator name cannot include coding or scripting keywords.",
          (value) => !value || !hasBlockedCodingKeyword(value),
        )
        .test(
          "code-like-syntax",
          "Educator name cannot include code-like syntax.",
          (value) => !value || !hasCodeLikeSyntaxPattern(value),
        ),
      email: Yup.string()
        .email("Please enter a valid email address")
        .required(EDUCATOR_VALIDATION.EMAIL_REQUIRED),
      school_id:
        modalMode === "create"
          ? Yup.string().required(EDUCATOR_VALIDATION.SCHOOL_REQUIRED)
          : Yup.string().notRequired(),
      status: Yup.string().required(EDUCATOR_VALIDATION.EDUCATOR_STATUS),
      tokens: Yup.number()
        .typeError("Tokens must be a number")
        .max(500, EDUCATOR_VALIDATION.TOKENS_MAX_EXCEEDED)
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
          "full_name",
          "Educator name contains unsafe content. Please enter plain text only.",
        );
        return;
      }

      // Validate remove-seats input before allowing submit
      if (modalMode === "edit" && removeSeatsInput.trim() !== "") {
        const removeAmount = Number(removeSeatsInput);
        if (isNaN(removeAmount) || removeAmount <= 0) {
          toast.error("Remove seats must be greater than 0");
          return;
        }
        if (tokensInput.trim() !== "" && Number(tokensInput) > 0) {
          formik.setFieldError("tokens", "Cannot add and remove seats at the same time");
          formik.setFieldTouched("tokens", true, true);
          return;
        }
        const maxRemove = selectedEducator?.remainingTokens ?? 0;
        if (removeAmount > maxRemove) {
          toast.error(`Cannot remove more than ${maxRemove} available seats`);
          return;
        }
      }

      // Prevent adding more seats than the admin currently has available
      if (
        modalMode === "edit" &&
        tokensInput.trim() !== "" &&
        Number(tokensInput) > adminSeatData.remaining
      ) {
        formik.setFieldError(
          "tokens",
          `Cannot add more than ${adminSeatData.remaining} currently available seats`,
        );
        formik.setFieldTouched("tokens", true, true);
        return;
      }

      if (
        modalMode === "edit" &&
        !formik.dirty &&
        editPendingSchoolIdsRef.current === null &&
        removeSeatsInput.trim() === ""
      ) {
        toast.error("No changes made");
        return;
      }
      setIsSubmitting(true);

      const isInactive =
        modalMode === "create" && values.status.toUpperCase() === "INACTIVE";

      const payload: EducatorFormValues = {
        ...values,
        full_name: sanitizedName,
        email: values.email,
        status:
          modalMode === "create"
            ? isInactive
              ? "INACTIVE"
              : "PENDING"
            : values.status.toUpperCase(),
        tokens:
          modalMode === "create"
            ? Number(values.tokens)
            : tokensInput.trim() !== ""
              ? Number(values.tokens)
              : 0,
      };

      try {
        if (modalMode === "create") {
          const result = await dispatch(
            InviteEducatorRequest(payload),
          ).unwrap();
          toast.success(
            isInactive
              ? "Educator created successfully"
              : result?.message || "Educator invited successfully",
          );
          const extraSchoolIds = createAdditionalSchoolIdsRef.current.slice();
          createAdditionalSchoolIdsRef.current = [];

          setIsModalOpen(false);
          formik.resetForm({
            values: {
              full_name: "",
              email: "",
              status: "PENDING",
              school_id: "",
              tokens: 0,
            },
          });
          await dispatch(clearGetEducatorState());

          try {
            const freshRes = await dispatch(
              GetEducatorByUserRequest(),
            ).unwrap();
            const freshItems: Educator[] =
              (freshRes as { data?: { items?: Educator[] } })?.data?.items ?? [];
            const newEducator = freshItems.find(
              (e) => e.email === values.email,
            );
            // Persist the product associations selected during create (notes
            // store, keyed by the resolved educator id).
            if (newEducator?.id && assocProductKeys.length > 0) {
              setEducatorProductAssociations(
                newEducator.id,
                assocProductKeys,
                productOptions.map((o) => o.value),
              );
              // Persist the per-avatar-product seat allocations set on create.
              for (const [key, seats] of Object.entries(createAllocations)) {
                setEducatorProductAllocation(newEducator.id, key, seats);
              }
              setNotesVersion((v) => v + 1);
            }
            if (newEducator?.id && extraSchoolIds.length > 0) {
              for (const schoolId of extraSchoolIds) {
                try {
                  await dispatch(
                    AddEducatorSchoolRequest({
                      educatorId: newEducator.id,
                      school_id: schoolId,
                    }),
                  ).unwrap();
                } catch {
                  // non-fatal — additional school assignment failed silently
                }
              }
              await dispatch(GetEducatorByUserRequest()).unwrap();
            }
            const userRes = await dispatch(getCurrentUserRequest()).unwrap();
            if (userRes?.data) {
              updateStoredUser({
                subscriptions: (userRes.data as { subscriptions?: unknown[] })
                  .subscriptions,
              });
            }
          } catch {
            // ignore refresh errors
          }
        } else if (modalMode === "edit" && selectedEducator) {
          const pendingSchoolIds = editPendingSchoolIdsRef.current;
          if (pendingSchoolIds !== null) {
            const originalSchoolIds = (selectedEducator.schools ?? []).map(
              (s) => s.id,
            );
            const toAdd = pendingSchoolIds.filter(
              (id) => !originalSchoolIds.includes(id),
            );
            const toRemove = originalSchoolIds.filter(
              (id) => !pendingSchoolIds.includes(id),
            );
            for (const schoolId of toAdd) {
              await dispatch(
                AddEducatorSchoolRequest({
                  educatorId: selectedEducator.id,
                  school_id: schoolId,
                }),
              ).unwrap();
            }
            for (const schoolId of toRemove) {
              await dispatch(
                RemoveEducatorSchoolRequest({
                  educatorId: selectedEducator.id,
                  schoolId,
                }),
              ).unwrap();
            }
            editPendingSchoolIdsRef.current = null;
          }

          const result = await dispatch(
            UpdateEducatorRequest({ id: selectedEducator.id, data: payload }),
          ).unwrap();

          // Remove seats returns them to the admin pool; dispatched after the educator update succeeds
          if (removeSeatsInput.trim() !== "") {
            await dispatch(
              RemoveSeats({
                educatorId: selectedEducator.id,
                amount: Number(removeSeatsInput),
              }),
            ).unwrap();
            toast.success(
              `Educator updated and ${removeSeatsInput} seat(s) removed successfully`,
            );
          } else {
            toast.success(result?.message || "Educator updated successfully");
          }

          setIsModalOpen(false);
          setRemoveSeatsInput("");
          formik.resetForm({
            values: {
              full_name: "",
              email: "",
              status: "ACTIVE",
              school_id: "",
              tokens: 0,
            },
          });
          await dispatch(clearGetEducatorState());

          try {
            await dispatch(GetEducatorByUserRequest()).unwrap();
            const userRes = await dispatch(getCurrentUserRequest()).unwrap();
            if (userRes?.data) {
              // Refresh stored user so seat counts reflect the deduction
              updateStoredUser({
                subscriptions: (userRes.data as { subscriptions?: unknown[] })
                  .subscriptions,
              });
              // Recompute from updated cookie so the header summary stays in sync
              setAdminSeatData(computeAdminSeatData());
            }
          } catch {
            return;
          }
        }
      } catch (err: unknown) {
        const msg =
          (err as { message?: string })?.message || "Something went wrong";

        if (
          (modalMode === "create" || modalMode === "edit") &&
          msg.toLowerCase().includes("insufficient")
        ) {
          formik.setFieldError("tokens", msg);
          formik.setFieldTouched("tokens", true, true);
        }
        toast.error(msg);
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  const handleAddEducator = () => {
    setModalMode("create");
    setSelectedEducator(null);
    createAdditionalSchoolIdsRef.current = [];
    formik.resetForm({
      values: {
        full_name: "",
        email: "",
        status: "ACTIVE",
        school_id: "",
        tokens: 0,
      },
    });
    setTokensInput("");
    setRemoveSeatsInput("");
    setAssocProductKeys([]);
    setCreateAllocations({});
    setAdminSeatData(computeAdminSeatData());
    setIsSubmitting(false);
    setIsModalOpen(true);
  };

  const openModal = (educator: Educator, mode: "view" | "edit") => {
    setModalMode(mode);
    setSelectedEducator(educator);
    setAssocProductKeys(
      effectiveProductKeys(
        educator.id,
        getProductKeysForEducator(educator.id),
        productUnits.map((u) => u.key),
      ).filter((k) => activeProductKeySet.has(k)),
    );
    // The View Educator modal shows the educator's classes; fetch them fresh.
    if (mode === "view") {
      dispatch(clearEducatorClasses());
      void dispatch(GetEducatorClassesRequest(educator.id));
    }
    editSchoolsModifiedRef.current = false;
    editPendingSchoolIdsRef.current = null;
    formik.resetForm({
      values: {
        full_name: educator.full_name ?? "",
        email: educator.email ?? "",
        status: (educator.status || "ACTIVE").toUpperCase(),
        school_id: educator.school_id ?? "",
        tokens: educator.tokens || 0,
      },
    });
    setTokensInput("");
    setRemoveSeatsInput("");
    setAdminSeatData(computeAdminSeatData());
    setIsSubmitting(false);
    setIsModalOpen(true);
  };

  // Deep-link from the View School modal: open the View Educator modal for the
  // clicked educator once the educator list is loaded, then clear nav state so
  // a refresh doesn't reopen it.
  const hasOpenedViewFromNav = useRef(false);
  useEffect(() => {
    const id = locationState?.viewEducatorId;
    if (!id || !id.trim()) {
      hasOpenedViewFromNav.current = false;
      return;
    }
    if (hasOpenedViewFromNav.current) return;
    const educator = allEducators.find((e) => String(e.id) === String(id));
    if (!educator) return; // wait for the list to load
    hasOpenedViewFromNav.current = true;
    openModal(educator, "view");
    navigate(location.pathname, { replace: true, state: {} });
  }, [locationState?.viewEducatorId, allEducators, navigate, location.pathname]);

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
      toast.success("Educator deleted successfully");
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message;
      toast.error(msg || "Delete failed");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddSchoolToEducator = async (
    educatorId: string,
    schoolId: string,
  ): Promise<void> => {
    try {
      await dispatch(
        AddEducatorSchoolRequest({ educatorId, school_id: schoolId }),
      ).unwrap();
      await dispatch(GetEducatorByUserRequest()).unwrap();
      editSchoolsModifiedRef.current = true;
      toast.success("School added to educator");
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message;
      toast.error(msg || "Failed to add school");
      throw err;
    }
  };

  const handleRemoveSchoolFromEducator = async (
    educatorId: string,
    schoolId: string,
  ): Promise<void> => {
    try {
      await dispatch(
        RemoveEducatorSchoolRequest({ educatorId, schoolId }),
      ).unwrap();
      await dispatch(GetEducatorByUserRequest()).unwrap();
      editSchoolsModifiedRef.current = true;
      toast.success("School removed from educator");
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message;
      toast.error(msg || "Failed to remove school");
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
      toast.success("Invitation resent successfully");
      setIsResendModalOpen(false);
      setResendTargetEducator(null);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message;
      toast.error(msg || "Failed to resend invitation");
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
    // Chip keys are composite: `<field>::<value>`.
    const [field, value] = key.split("::");
    const nextFilter: EducatorFilterState = {
      educator_ids: [...appliedFilter.educator_ids],
      school_ids: [...appliedFilter.school_ids],
      statuses: [...appliedFilter.statuses],
      productAssoc: [...(appliedFilter.productAssoc ?? [])],
    };
    if (field === "educator_ids") {
      nextFilter.educator_ids = nextFilter.educator_ids.filter((v) => v !== value);
      // Clear target highlighting when removing an educator filter
      setShowTargetHighlight(false);
    } else if (field === "school_ids") {
      nextFilter.school_ids = nextFilter.school_ids.filter((v) => v !== value);
    } else if (field === "statuses") {
      nextFilter.statuses = nextFilter.statuses.filter((v) => v !== value);
    } else if (field === "productAssoc") {
      nextFilter.productAssoc = (nextFilter.productAssoc ?? []).filter(
        (v) => v !== value,
      );
    }
    setPendingFilter(nextFilter);
    setAppliedFilter(nextFilter);
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

  // Attention counts run across ALL educators (independent of search/filter) so
  // the tile summarises the whole roster, mirroring the dashboard tiles.
  const educatorsNoSchoolCount = allEducators.filter(
    (e) => !e.school_id && (e.schools?.length ?? 0) === 0,
  ).length;
  const educatorsNoProductsCount = allEducators.filter(
    (e) => (productCountByEducator[e.id ?? ""] ?? 0) === 0,
  ).length;
  const educatorsPendingCount = allEducators.filter(
    (e) => (e.status || "").toUpperCase() === "PENDING",
  ).length;
  const educatorsAvatarNoSeatsCount = avatarNoSeatsEducatorIds.size;
  const educatorsNeedingAttention = allEducators.filter(
    (e) =>
      (!e.school_id && (e.schools?.length ?? 0) === 0) ||
      (productCountByEducator[e.id ?? ""] ?? 0) === 0 ||
      (e.status || "").toUpperCase() === "PENDING" ||
      avatarNoSeatsEducatorIds.has(e.id ?? ""),
  ).length;

  // Apply one attention dimension; clear the rest and drop any search term.
  const applyEducatorAttention = (partial: Partial<EducatorFilterState>) => {
    const next: EducatorFilterState = { ...DEFAULT_FILTER, ...partial };
    setPendingFilter(next);
    setAppliedFilter(next);
    setShowTargetHighlight(false);
    // Reveal the selection in the regular filter area rather than a separate spot.
    setIsFilterOpen(true);
    setSearchTerm("");
  };

  // Compact attention tile shown in the header's empty band (only when needed).
  const educatorAttentionTile =
    educatorsNeedingAttention > 0 ? (
      <ProgressCard
        label="Educators Needing Attention"
        value={`${educatorsNeedingAttention} of ${allEducators.length} educators need attention`}
        progress={educatorsNeedingAttention}
        total={allEducators.length}
        subText="Educators not associated to a school or any products, with a pending invite, or holding an avatar product with no seats allocated"
        icon={AlertTriangle}
        largeActions
        actions={[
          {
            label: `View Educators Without a School (${educatorsNoSchoolCount})`,
            onClick: () =>
              applyEducatorAttention({ school_ids: [NO_SCHOOLS_VALUE] }),
          },
          {
            label: `View Educators Without Products (${educatorsNoProductsCount})`,
            onClick: () =>
              applyEducatorAttention({ productAssoc: [NO_PRODUCTS_VALUE] }),
          },
          {
            label: `View Educators Pending Invites (${educatorsPendingCount})`,
            onClick: () => applyEducatorAttention({ statuses: ["PENDING"] }),
          },
          {
            label: `View Educators Missing Seat Allocations (${educatorsAvatarNoSeatsCount})`,
            onClick: () =>
              applyEducatorAttention({ productAssoc: [AVATAR_NO_SEATS_VALUE] }),
          },
        ]}
      />
    ) : undefined;

  // Create a brand-new school inline from the Create/Edit Educator modal.
  const handleCreateSchoolInline = async (
    name: string,
  ): Promise<{ id: string; school_name: string } | null> => {
    const currentUser = getParsedUser();
    const userId = typeof currentUser?.id === "string" ? currentUser.id : "";
    try {
      const res = await dispatch(
        PostSchoolRequest({ school_name: name, status: "ACTIVE", user_id: userId }),
      ).unwrap();
      const newId = res?.data?.id;
      if (!newId) return null;
      // Refresh the schools list so the new school is available everywhere.
      await dispatch(GetSchoolRequest()).unwrap().catch(() => undefined);
      toast.success(`School "${name}" created`);
      return { id: newId, school_name: name };
    } catch {
      toast.error("Could not create the school. Please try again.");
      return null;
    }
  };

  return (
    <div className="p-6 min-h-screen font-sans text-text-primary">
      <PageHeader
        title={educatorsCopy.title}
        actionButton={
          <div className="flex flex-col items-end gap-2">
            <Button
              variant="gradient"
              className="h-10 px-5 flex items-center gap-2 rounded-full shadow-md"
              onClick={handleAddEducator}
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              {educatorsCopy.addEducator}
            </Button>
          </div>
        }
        sub_text={""}
        centerContent={educatorAttentionTile}
      />
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100">
          <h2 className="text-base sm:text-lg font-semibold flex-1 min-w-0 truncate">
            {educatorsCopy.listTitle}
            <span className="ml-2 text-sm font-medium text-gray-500">
              ({allEducators.length})
            </span>
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
                  ? "border-[#5f6060] bg-[#5f6060] text-white hover:bg-[#4f5050]"
                  : "border-gray-400 hover:border-primary-500"
              }`}
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              aria-label={hasActiveFilters ? "Filter (active)" : "Filter"}
            >
              <Filter size={18} strokeWidth={2.5} />
            </Button>
          </div>
        </div>
        {isFilterOpen && (
          <FilterPanel
            title={educatorsCopy.filterTitle}
            onApply={handleApplyFilter}
            onReset={handleResetFilter}
            onClose={handleCloseFilter}
            resetLabel={educatorsCopy.resetFilter}
            applyLabel={educatorsCopy.applyFilter}
            fields={[
              {
                label: educatorsCopy.filterEducator,
                multiple: true,
                values: pendingFilter.educator_ids,
                value: "",
                placeholder: educatorsCopy.filterEducatorPlaceholder,
                searchable: true,
                onChange: () => undefined,
                onValuesChange: (vals) =>
                  setPendingFilter((p) => ({ ...p, educator_ids: vals })),
                options: [...allEducators]
                  .sort((a, b) =>
                    (a.full_name || "").localeCompare(b.full_name || ""),
                  )
                  .map((e) => ({
                    value: e.id ?? "",
                    label: e.full_name || "",
                  })),
              },
              {
                label: educatorsCopy.filterSchool,
                multiple: true,
                values: pendingFilter.school_ids,
                value: "",
                placeholder: educatorsCopy.filterSchoolPlaceholder,
                searchable: true,
                onChange: () => undefined,
                onValuesChange: (vals) =>
                  setPendingFilter((p) => ({ ...p, school_ids: vals })),
                options: [
                  { value: NO_SCHOOLS_VALUE, label: "No associated schools" },
                  ...schools
                    .filter((s) => s.status?.toUpperCase() === "ACTIVE")
                    .sort((a, b) => a.school_name.localeCompare(b.school_name))
                    .map((s) => ({
                      value: s.id,
                      label: s.school_name,
                    })),
                ],
              },
              {
                label: educatorsCopy.filterStatus,
                multiple: true,
                values: pendingFilter.statuses,
                value: "",
                placeholder: educatorsCopy.filterStatusPlaceholder,
                searchable: true,
                onChange: () => undefined,
                onValuesChange: (vals) =>
                  setPendingFilter((p) => ({ ...p, statuses: vals })),
                options: educatorStatusOptions,
              },
              {
                label: "Associated Products",
                multiple: true,
                values: pendingFilter.productAssoc ?? [],
                value: "",
                placeholder: "Select products",
                searchable: true,
                onChange: () => undefined,
                onValuesChange: (vals) =>
                  setPendingFilter((p) => ({ ...p, productAssoc: vals })),
                options: [
                  { value: NO_PRODUCTS_VALUE, label: "No associated products" },
                  {
                    value: AVATAR_NO_SEATS_VALUE,
                    label: "Avatar product, no seats allocated",
                  },
                  ...productOptions,
                ],
              },
            ]}
          />
        )}
        {activeFilterChips.length > 0 && (
          <FilterChips
            filters={activeFilterChips}
            onRemove={handleRemoveFilter}
            onClearAll={handleClearAllFilters}
            labels={{
              clearAll:
                activeFilterChips.length === 1
                  ? educatorsCopy.clear
                  : educatorsCopy.clearAll,
            }}
          />
        )}

        <ListTable
          columns={columns}
          data={filteredEducators}
          onRowClick={(row) =>
            setExpandedEducatorId((cur) =>
              cur === (row.id ?? "") ? null : (row.id ?? ""),
            )
          }
          renderSubRow={(row) => {
            if (expandedEducatorId !== (row.id ?? "")) return null;
            const eduId = row.id ?? "";
            return (
              <>
                <EducatorProductsSubtable
                  educatorId={eduId}
                  products={productUnits.filter((u) =>
                    (productKeysByEducator[eduId] ?? []).includes(u.key),
                  )}
                  onAllocationChange={() => setNotesVersion((v) => v + 1)}
                  onDissociate={(productKey) => {
                    const nextKeys = (
                      productKeysByEducator[eduId] ?? []
                    ).filter((k) => k !== productKey);
                    setEducatorProductAssociations(
                      eduId,
                      nextKeys,
                      productUnits.map((u) => u.key),
                    );
                    setNotesVersion((v) => v + 1);
                  }}
                />
                {/* Associate more products for this educator — opens the same
                    popover as the Associated Products count. */}
                <div className="mx-3 mb-4 -mt-2 flex justify-center">
                  <AssociatedProductsPopover
                    variant="button"
                    count={productCountByEducator[eduId] ?? 0}
                    educatorName={row.full_name ?? "this educator"}
                    options={productOptions}
                    values={productKeysByEducator[eduId] ?? []}
                    onChange={(keys) => {
                      setEducatorProductAssociations(
                        eduId,
                        keys,
                        productOptions.map((o) => o.value),
                      );
                      setNotesVersion((v) => v + 1);
                    }}
                    ariaLabel="Add a product association for this educator"
                  />
                </div>
              </>
            );
          }}
          targetRowId={targetEducatorId}
          rowClassName={(row) =>
            targetEducatorId && String(row.id) === String(targetEducatorId)
              ? "bg-[#e9e9e9]"
              : ""
          }
          actionHeader={locale?.schools?.headerActions ?? "Actions"}
          actionColWidth="minmax(170px, 210px)"
          prevLabel={educatorsCopy.paginationPrev}
          nextLabel={educatorsCopy.paginationNext}
          loading={
            educatorResponse === null &&
            (educatorStatus === "idle" || educatorStatus === "loading")
          }
          emptyMessage={educatorsCopy.emptyMessage}
          renderActions={(row) => {
            const isActive = (row.status || "").toUpperCase() === "ACTIVE";
            const isPending = (row.status || "").toUpperCase() === "PENDING";
            const iconBtn =
              "p-1.5 rounded-md text-gray-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-40 disabled:cursor-not-allowed";
            return (
              <div className="flex items-center justify-center gap-1.5">
                <button
                  type="button"
                  aria-label="View educator"
                  title="View educator"
                  className={`${iconBtn} hover:text-primary-500 hover:bg-[#e9e9e9]`}
                  onClick={() => openModal(row, "view")}
                >
                  <Eye size={17} />
                </button>
                <button
                  type="button"
                  aria-label="Edit educator"
                  title="Edit educator"
                  className={`${iconBtn} hover:text-primary-500 hover:bg-[#e9e9e9]`}
                  onClick={() => openModal(row, "edit")}
                >
                  <SquarePen size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Transfer classes"
                  title="Transfer classes"
                  disabled={!isActive}
                  className={`${iconBtn} hover:text-primary-500 hover:bg-[#e9e9e9]`}
                  onClick={() => void handleTransferClick(row)}
                >
                  <ArrowLeftRight size={16} />
                </button>
                {isPending && (
                  <button
                    type="button"
                    aria-label="Resend invitation"
                    title="Resend invitation"
                    disabled={isResending && resendTargetEducator?.id === row.id}
                    className={`${iconBtn} hover:text-primary-500 hover:bg-[#e9e9e9]`}
                    onClick={() => handleResendClick(row)}
                  >
                    <Send size={16} />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Delete educator"
                  title="Delete educator"
                  className={`${iconBtn} hover:text-red-500 hover:bg-red-50 focus-visible:ring-red-300`}
                  onClick={() => handleDeleteClick(row)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          }}
        />
      </div>

      {/* Bottom Add button so the user needn't scroll back to the top. */}
      <div className="mt-4 flex justify-center">
        <Button
          variant="gradient"
          className="h-10 px-5 flex items-center gap-2 rounded-full shadow-md"
          onClick={handleAddEducator}
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          {educatorsCopy.addEducator}
        </Button>
      </div>

      {/*Create Educator Modal*/}
      <CreateEducatorModal
        key={selectedEducator?.id ?? "create-new"}
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
        onCreateSchool={handleCreateSchoolInline}
        hasAvatar={hasAvatar}
        onEditFromView={() =>
          selectedEducator && openModal(selectedEducator, "edit")
        }
        classes={educatorClassesForTransfer}
        classesStatus={educatorClassesStatus}
        onSchoolClick={(schoolId) => {
          setIsModalOpen(false);
          navigate("/schools", { state: { viewSchoolId: schoolId } });
        }}
        productOptions={productOptions}
        associatedProductKeys={assocProductKeys}
        associatedProductDetails={associatedProductDetails}
        onAssociatedProductsChange={(keys) => {
          // Always reflect the selection (so options are selectable in CREATE
          // mode, before an educator id exists).
          setAssocProductKeys(keys);
          // Persist immediately for an existing educator; on create the parent
          // persists after resolving the new educator's id post-invite.
          if (selectedEducator) {
            setEducatorProductAssociations(
              selectedEducator.id,
              keys,
              productOptions.map((o) => o.value),
            );
            setNotesVersion((v) => v + 1);
          }
        }}
        onProductNotesChange={() => setNotesVersion((v) => v + 1)}
        onCreateAllocationsChange={setCreateAllocations}
      />
      <TwoStepDeleteModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        isDeleting={isDeleting}
        itemLabel="educator"
        itemName={selectedEducator?.full_name}
        confirmLabel="Delete Educator"
        step2Message="This permanently deletes the educator and removes access to all of their reports. This cannot be undone."
      />
      <ConfirmationModal
        isOpen={isResendModalOpen}
        title="Resend Invitation"
        message={`Resend the invitation email to ${resendTargetEducator?.full_name || resendTargetEducator?.email || "this educator"}?`}
        confirmText="Resend"
        cancelText="Cancel"
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
          isLoadingClasses={educatorClassesStatus === "loading"}
          allActiveEducators={allEducators.filter(
            (e) => (e.status || "").toUpperCase() === "ACTIVE",
          )}
        />
      )}

    </div>
  );
}
