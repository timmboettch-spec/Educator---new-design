import Modal from "../../components/ui/Modal";
import FormField from "../../components/ui/FormField";
import Input from "../../components/ui/Input";
import {
  EDUCATOR_NAME_MAX_LENGTH,
  sanitizeTextForTyping,
  trimBoundaryWhitespace,
} from "../../utils/inputSecurity";
import { FormikProps } from "formik";
import { Button } from "../ui/Button";
import SelectField from "../ui/Select";
import MultiSelect from "../ui/MultiSelect";
import loginEn from "../../locales/auth/login/en.json";
import loginEs from "../../locales/auth/login/es.json";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Minus, Plus, SquarePen, X } from "lucide-react";
import type { Educator, SchoolSummary } from "../../types";
import type { ClassWithStudents } from "../../types/Class_types";
import {
  isActiveClass,
  isClosedClass,
  getActiveStudentCount,
  getInactiveStudentCount,
  getSimsAttempted,
} from "../../utils/classUtils";
import {
  getAllProductNotes,
  getEducatorProductAllocation,
  setEducatorProductAllocation,
} from "../../utils/productNotes";

// Deterministic placeholder hash — MUST match EducatorProductsSubtable so the
// per-educator per-product usage figures agree between the modal and the
// expanded subtable on the Educators page.
const usageHash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

// Total avatar seats allocated across ALL educators for a product license (used
// to bound the seat stepper's plus button — matches EducatorProductsSubtable).
const totalAllocatedForKey = (key: string): number => {
  const a = getAllProductNotes()[key]?.allocations ?? {};
  return Object.values(a).reduce((sum, n) => sum + (Number(n) || 0), 0);
};

type SupportedLang = "en" | "es";

const LANGUAGE_STORAGE_KEY = "app_language";

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === "undefined") {
    return "en";
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === "es" ? "es" : "en";
};

type EducatorModalProps = {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  modalMode: "create" | "view" | "edit";
  schools: { id: string; school_name: string; status: string }[];
  isSubmitting: boolean;
  tokensInput: string;
  setTokensInput: (value: string) => void;
  selectedEducator?: Educator | null;
  onAddSchool?: (educatorId: string, schoolId: string) => Promise<void>;
  onRemoveSchool?: (educatorId: string, schoolId: string) => Promise<void>;
  onAdditionalSchoolsChange?: (additionalSchoolIds: string[]) => void;
  onSchoolChanges?: (currentSchoolIds: string[]) => void;
  adminAvailableSeats?: number;
  removeSeatsInput?: string;
  setRemoveSeatsInput?: (value: string) => void;
  // Create a brand-new school inline; resolves to the created school or null.
  onCreateSchool?: (name: string) => Promise<{ id: string; school_name: string } | null>;
  // Hide all avatar-seat UI when the org has no Online Avatar entitlement.
  hasAvatar?: boolean;
  // Switch the open modal from view mode into edit mode (view footer button).
  onEditFromView?: () => void;
  // The educator's classes (view mode) + their load status.
  classes?: ClassWithStudents[];
  classesStatus?: "idle" | "loading" | "succeeded" | "failed";
  // Clicking a school chip (view mode) opens that school's View School modal.
  onSchoolClick?: (schoolId: string, schoolName: string) => void;
  // Product association (admin-local notes): all product options, the educator's
  // current associations, and a reconcile callback.
  productOptions?: {
    value: string;
    label: string;
    subLabels?: string[];
    kind?: "online" | "workstation";
    // Avatar seats still available to allocate for this specific product.
    availableSeats?: number;
  }[];
  associatedProductKeys?: string[];
  // CREATE mode: per-avatar-product seat allocations (keyed by product key),
  // synced up so the parent can persist them after the educator is created.
  onCreateAllocationsChange?: (allocations: Record<string, number>) => void;
  // Per-product usage detail for view mode (avatar seats / hardware hours).
  associatedProductDetails?: {
    key: string;
    label: string;
    kind: string;
    usage: string;
    licensedThrough?: string;
    seatsTotal?: number;
    seatsConsumed?: number;
  }[];
  onAssociatedProductsChange?: (keys: string[]) => void;
  // Called after an admin-local product note (allocation) changes, so the parent
  // can refresh the educators table count / subtable.
  onProductNotesChange?: () => void;
  formik: FormikProps<{
    full_name: string;
    email: string;
    status: string;
    tokens: number;
    school_id: string;
  }>;
};

export default function CreateEducatorModal({
  isModalOpen,
  setIsModalOpen,
  modalMode,
  schools,
  isSubmitting,
  formik,
  tokensInput,
  setTokensInput,
  selectedEducator,
  onAdditionalSchoolsChange,
  onSchoolChanges,
  onCreateSchool,
  hasAvatar = true,
  onEditFromView,
  classes,
  classesStatus,
  onSchoolClick,
  productOptions,
  associatedProductKeys,
  associatedProductDetails,
  onAssociatedProductsChange,
  onProductNotesChange,
  onCreateAllocationsChange,
}: EducatorModalProps) {
  const activeClasses = (classes ?? []).filter(isActiveClass);
  const closedClasses = (classes ?? []).filter(isClosedClass);
  const classesLoading = classesStatus === "loading";
  const [activeClassesOpen, setActiveClassesOpen] = useState(false);
  const [closedClassesOpen, setClosedClassesOpen] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  // EDIT mode: association changes are pending in a draft until the check
  // (Save) is pressed; the X (Cancel) reverts to the committed set.
  const [draftProductKeys, setDraftProductKeys] = useState<string[]>(
    associatedProductKeys ?? [],
  );
  // EDIT mode: the product selector (MultiSelect) is hidden behind an
  // "Add / Edit Associated Products" button; opening reveals it with check/X.
  const [showProductSelector, setShowProductSelector] = useState(false);
  // CREATE mode: seats to allocate per selected avatar product, keyed by key.
  const [createAllocations, setCreateAllocations] = useState<
    Record<string, string>
  >({});
  // EDIT mode: inline per-product avatar-seat allocation editing (steppers +
  // confirm/cancel), mirroring EducatorProductsSubtable.
  const [editingAllocKey, setEditingAllocKey] = useState<string | null>(null);
  const [allocDraft, setAllocDraft] = useState(0);
  // Bumped after persisting an allocation so the usage figures recompute.
  const [, setAllocVersion] = useState(0);
  // Re-seed the association draft whenever the committed set changes (open /
  // after a Save / switching educators), and collapse the selector.
  useEffect(() => {
    setDraftProductKeys(associatedProductKeys ?? []);
    setEditingAllocKey(null);
    setShowProductSelector(false);
  }, [associatedProductKeys]);
  // CREATE mode: keep formik.tokens (invite seat total) + the parent in sync
  // with the per-avatar-product seat inputs; only count currently-selected
  // avatar products (so deselecting a product drops its seats).
  useEffect(() => {
    if (modalMode !== "create") return;
    const selectedKeys = new Set(
      (productOptions ?? [])
        .filter(
          (o) => o.kind === "online" && (associatedProductKeys ?? []).includes(o.value),
        )
        .map((o) => o.value),
    );
    const nums: Record<string, number> = {};
    let total = 0;
    for (const [k, v] of Object.entries(createAllocations)) {
      if (!selectedKeys.has(k)) continue;
      const n = Number(v) || 0;
      if (n > 0) {
        nums[k] = n;
        total += n;
      }
    }
    setTokensInput(String(total));
    formik.setFieldValue("tokens", total);
    onCreateAllocationsChange?.(nums);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createAllocations, associatedProductKeys, modalMode]);
  // Products are required on create when the admin actually has products to
  // associate (can't require what isn't there).
  const productsRequired =
    modalMode === "create" && (productOptions?.length ?? 0) > 0;
  const productDetails = associatedProductDetails ?? [];
  const showProducts =
    (productOptions?.length ?? 0) > 0 || (associatedProductKeys?.length ?? 0) > 0;
  // Pending association changes (draft ≠ committed) surface the Save/Cancel row.
  const sortedKeys = (a: string[]) => [...a].sort().join("|");
  const associationsDirty =
    sortedKeys(draftProductKeys) !== sortedKeys(associatedProductKeys ?? []);
  // CREATE mode: the selected AVATAR products each get their own seat input
  // (seats are per specific avatar product, matching the Edit-School inset).
  const selectedAvatarProductsCreate = (productOptions ?? []).filter(
    (o) => o.kind === "online" && (associatedProductKeys ?? []).includes(o.value),
  );
  const setCreateAllocation = (key: string, raw: string) => {
    setCreateAllocations((prev) => ({ ...prev, [key]: raw }));
  };

  // "Educator's Total Product Usage" reflects the KINDS of products associated
  // with this educator: avatar (online) products surface avatar-seat allocation;
  // hardware (workstation) products surface hardware hours. Both when both.
  const hasAvatarProduct = productDetails.some((p) => p.kind === "online");
  const hasHardwareProduct = productDetails.some((p) => p.kind === "workstation");
  const educatorIdForUsage = selectedEducator?.id ?? "";
  // Per-educator per-product usage (deterministic PLACEHOLDERS, same formulas as
  // EducatorProductsSubtable so the modal and the expanded subtable agree).
  // Avatar: allocated = admin-local note; used = placeholder; remaining derived.
  // Workstation: hours used = placeholder.
  const perProductUsage = productDetails.map((p) => {
    const isAvatar = p.kind === "online";
    if (isAvatar) {
      const allocated = getEducatorProductAllocation(educatorIdForUsage, p.key);
      const used =
        allocated > 0
          ? usageHash(educatorIdForUsage + p.key) % (allocated + 1)
          : usageHash(educatorIdForUsage + p.key) % 20;
      return {
        key: p.key,
        isAvatar,
        allocated,
        used,
        remaining: Math.max(0, allocated - used),
        hoursUsed: 0,
      };
    }
    return {
      key: p.key,
      isAvatar,
      allocated: 0,
      used: 0,
      remaining: 0,
      hoursUsed: 100 + (usageHash(educatorIdForUsage + p.key + "h") % 1300),
    };
  });
  const usageByKey = Object.fromEntries(perProductUsage.map((u) => [u.key, u]));
  // Inline avatar-seat allocation editing (EDIT mode) — mirrors the subtable.
  const startAllocEdit = (key: string, current: number) => {
    setAllocDraft(current);
    setEditingAllocKey(key);
  };
  const commitAllocEdit = (key: string) => {
    setEducatorProductAllocation(educatorIdForUsage, key, allocDraft);
    setEditingAllocKey(null);
    setAllocVersion((v) => v + 1);
    onProductNotesChange?.();
  };
  const cancelAllocEdit = () => setEditingAllocKey(null);

  // One product "card" — the clean list item. Read-only in view mode; in edit
  // mode (`editable`) the avatar Allocated value gets an edit pencil that reveals
  // −/+ steppers + confirm/cancel, behaving like the Educators-page subtable.
  const renderProductBox = (
    p: NonNullable<typeof associatedProductDetails>[number],
    editable: boolean,
  ) => {
    const u = usageByKey[p.key];
    const editing = editable && editingAllocKey === p.key;
    const seatsTotal = p.seatsTotal ?? null;
    const otherAllocated = Math.max(
      0,
      totalAllocatedForKey(p.key) - (u?.allocated ?? 0),
    );
    const availableToAllocate =
      seatsTotal != null ? Math.max(0, seatsTotal - otherAllocated) : null;
    const minusDisabled = allocDraft <= (u?.used ?? 0);
    const plusDisabled =
      availableToAllocate != null && allocDraft >= availableToAllocate;
    return (
      <div
        key={p.key}
        className="rounded-lg border border-gray-200 px-3 py-2"
      >
        <p className="text-sm font-medium text-gray-800 break-words">{p.label}</p>
        <p className="text-xs text-gray-500 mt-0.5 tabular-nums">{p.usage}</p>
        {p.licensedThrough && (
          <p className="text-xs text-gray-500 mt-0.5">
            Licensed through {p.licensedThrough}
          </p>
        )}
        {u && (
          <div className="mt-1.5 pt-1.5 border-t border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              This educator&rsquo;s usage
            </p>
            {u.isAvatar ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm tabular-nums text-gray-600">
                {editing ? (
                  <span className="inline-flex items-center gap-2">
                    Allocated:
                    <button
                      type="button"
                      aria-label="Decrease seats"
                      disabled={minusDisabled}
                      onClick={() => setAllocDraft((v) => Math.max(0, v - 1))}
                      className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-300 text-gray-700 hover:bg-[#e9e9e9] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Minus size={14} aria-hidden="true" />
                    </button>
                    <span className="w-6 text-center font-semibold text-gray-800">
                      {allocDraft}
                    </span>
                    <button
                      type="button"
                      aria-label="Increase seats"
                      disabled={plusDisabled}
                      onClick={() => setAllocDraft((v) => v + 1)}
                      className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-300 text-gray-700 hover:bg-[#e9e9e9] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Confirm seat change for ${p.label}`}
                      title="Confirm"
                      onClick={() => commitAllocEdit(p.key)}
                      className="p-1.5 rounded-lg bg-primary-500 text-white hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                    >
                      <Check size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Cancel seat change for ${p.label}`}
                      title="Cancel"
                      onClick={cancelAllocEdit}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-black hover:bg-[#e9e9e9] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    Allocated:{" "}
                    <span className="font-semibold text-gray-800">
                      {u.allocated}
                    </span>
                    {editable && (
                      <button
                        type="button"
                        aria-label={`Edit seat allocation for ${p.label}`}
                        title="Edit seat allocation"
                        onClick={() => startAllocEdit(p.key, u.allocated)}
                        className="p-1 rounded-lg text-gray-500 hover:text-primary-600 hover:bg-[#e9e9e9] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                      >
                        <SquarePen size={14} aria-hidden="true" />
                      </button>
                    )}
                  </span>
                )}
                <span>
                  Used:{" "}
                  <span className="font-semibold text-gray-800">{u.used}</span>
                </span>
                <span>
                  Remaining:{" "}
                  <span className="font-semibold text-primary-500">
                    {editing ? Math.max(0, allocDraft - u.used) : u.remaining}
                  </span>
                </span>
              </div>
            ) : (
              <div className="text-sm tabular-nums text-gray-600">
                Hardware hours used:{" "}
                <span className="font-semibold text-gray-800">
                  {u.hoursUsed.toLocaleString()} hrs
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };
  // Cumulative totals across the educator's products (sum of the per-product
  // figures above, so the total box equals the sum of the nested boxes).
  const totalAllocated = perProductUsage.reduce((s, u) => s + u.allocated, 0);
  const totalSeatsUsed = perProductUsage.reduce((s, u) => s + u.used, 0);
  const totalSeatsRemaining = Math.max(0, totalAllocated - totalSeatsUsed);
  const totalHoursUsed = perProductUsage.reduce((s, u) => s + u.hoursUsed, 0);
  const usageStats: { label: string; value: string; highlight?: boolean }[] = [];
  if (hasAvatarProduct) {
    usageStats.push({
      label: "Avatar seats allocated",
      value: `${totalAllocated}`,
    });
    usageStats.push({
      label: "Avatar seats used",
      value: `${totalSeatsUsed}`,
    });
    usageStats.push({
      label: "Avatar seats remaining",
      value: `${totalSeatsRemaining}`,
      highlight: true,
    });
  }
  if (hasHardwareProduct) {
    usageStats.push({
      label: "Hardware hours used",
      value: `${totalHoursUsed.toLocaleString()} hrs`,
    });
  }
  const productUsageBox =
    selectedEducator && usageStats.length > 0 ? (
      <div className="rounded-xl bg-[#e9e9e9] px-4 py-3">
        <p className="text-xs font-semibold text-black uppercase tracking-wide mb-2">
          Educator&rsquo;s Total Product Usage
        </p>
        {/* Fixed label height reserves two lines so every value sits on the same
            row even when some labels wrap and others don't. */}
        <div className="flex flex-wrap gap-3 text-center text-[13px]">
          {usageStats.map((s) => (
            <div key={s.label} className="flex-1 min-w-[90px] flex flex-col">
              <p className="text-gray-600 leading-snug min-h-[2.25rem]">{s.label}</p>
              <p
                className={`font-semibold tabular-nums ${
                  s.highlight ? "text-primary-500" : "text-gray-900"
                }`}
              >
                {s.value}
              </p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-500 mt-2">
          Cumulative across all associated products. Seats used and hardware hours
          are placeholder figures — no per-educator-per-license usage feed exists
          yet.
        </p>
      </div>
    ) : null;
  const [localSchools, setLocalSchools] = useState<SchoolSummary[]>(() =>
    modalMode === "create" ? [] : (selectedEducator?.schools ?? []),
  );
  const tokenErrorRef = useRef<HTMLDivElement>(null);
  // Names of schools created inline this session (may not be in `schools` yet).
  const createdNamesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (isModalOpen) {
      if (modalMode === "edit" || modalMode === "view") {
        setLocalSchools(selectedEducator?.schools ?? []);
      } else {
        setLocalSchools([]);
        onAdditionalSchoolsChange?.([]);
      }
    }
  }, [isModalOpen, modalMode, selectedEducator]);
  useEffect(() => {
    if (
      formik.errors.tokens &&
      (formik.touched.tokens || formik.submitCount > 0)
    ) {
      tokenErrorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [formik.errors.tokens, formik.touched.tokens, formik.submitCount]);

  if (!isModalOpen) return null;

  const schoolNameOf = (id: string) =>
    schools.find((s) => s.id === id)?.school_name ??
    localSchools.find((s) => s.id === id)?.school_name ??
    createdNamesRef.current[id] ??
    "";

  // One place to reconcile the whole selected-school set (add / remove / clear /
  // select-all) — drives formik (create) or the pending-change ref (edit).
  const reconcileSchools = (ids: string[]) => {
    const next = ids
      .map((id) => ({ id, school_name: schoolNameOf(id) }))
      .filter((s) => s.school_name);
    setLocalSchools(next);
    if (modalMode === "create") {
      formik.setFieldValue("school_id", next[0]?.id ?? "");
      onAdditionalSchoolsChange?.(next.slice(1).map((s) => s.id));
    } else {
      // edit mode: local only — API applied on "Update Educator" submit
      onSchoolChanges?.(next.map((s) => s.id));
    }
  };

  const handleCreateSchool = async (name: string) => {
    const created = await onCreateSchool?.(name);
    if (!created) return null;
    createdNamesRef.current[created.id] = created.school_name;
    return { value: created.id, label: created.school_name };
  };

  const schoolOptions = schools
    .filter((s) => s.status?.toUpperCase() !== "INACTIVE")
    .slice()
    .sort((a, b) => a.school_name.localeCompare(b.school_name))
    .map((s) => ({ value: s.id, label: s.school_name }));

  const language = getStoredLanguage();
  const locale = language === "es" ? loginEs : loginEn;
  const educatorsCopy = {
    modalCreateTitle: locale?.educators?.modalCreateTitle ?? "Create Educator",
    modalEditTitle: locale?.educators?.modalEditTitle ?? "Edit Educator",
    modalViewTitle: locale?.educators?.modalViewTitle ?? "View Educator",
    back: locale?.educators?.back ?? "Back",
    addEducator: locale?.educators?.addEducator ?? "Add Educator",
    updateEducator: locale?.educators?.updateEducator ?? "Update Educator",
    fieldEducatorName: locale?.educators?.fieldEducatorName ?? "Educator Name",
    fieldEducatorEmail:
      locale?.educators?.fieldEducatorEmail ?? "Educator Email",
    fieldSchool: locale?.educators?.fieldSchool ?? "School",
    fieldStatus: locale?.educators?.fieldStatus ?? "Status",
    fieldSeats: locale?.educators?.fieldSeats ?? "Seats",
    fieldAddSeats: locale?.educators?.fieldAddSeats ?? "Add Avatar Seats",
    fieldAllocateAvatarSeats:
      locale?.educators?.fieldAllocateAvatarSeats ?? "Allocate Avatar Seats",
    remainingAvatarSeatsLabel:
      locale?.educators?.remainingAvatarSeatsLabel ?? "Remaining Avatar Seats",
    seatsAvatarNote:
      locale?.educators?.seatsAvatarNote ??
      "Only allocate seats to educators who will be using avatar products — seats are not applicable for workstation products.",
    placeholderEducatorName:
      locale?.educators?.placeholderEducatorName ?? "Enter Educator Name",
    placeholderEducatorEmail:
      locale?.educators?.placeholderEducatorEmail ?? "Enter Educator Email",
    placeholderSelectSchool:
      locale?.educators?.placeholderSelectSchool ?? "Select School",
    placeholderSelectStatus:
      locale?.educators?.placeholderSelectStatus ?? "Select Status",
    placeholderAddSeats:
      locale?.educators?.placeholderAddSeats ?? "Enter Additional Seats to Add",
    placeholderEducatorSeats:
      locale?.educators?.placeholderEducatorSeats ?? "Enter Avatar Seats to Allocate",
    statusPending: locale?.educators?.statusPending ?? "Pending",
    statusActive: locale?.educators?.statusActive ?? "Active",
    statusInactive: locale?.educators?.statusInactive ?? "Inactive",
  };

  return (
    <Modal
      isOpen={isModalOpen}
      onClose={() => setIsModalOpen(false)}
      className="max-w-2xl"
      title={
        modalMode === "create"
          ? educatorsCopy.modalCreateTitle
          : modalMode === "edit"
            ? educatorsCopy.modalEditTitle
            : educatorsCopy.modalViewTitle
      }
      footer={
        <div className="flex gap-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsModalOpen(false)}
            className="w-1/2 h-11 rounded-full text-sm font-medium"
          >
            {educatorsCopy.back}
          </Button>
          {modalMode === "view" ? (
            <Button
              type="button"
              onClick={() => onEditFromView?.()}
              className="w-1/2 h-11 rounded-full bg-gradient-btn text-white hover:opacity-90 text-sm font-medium"
            >
              {educatorsCopy.modalEditTitle}
            </Button>
          ) : (
            <Button
              type="submit"
              form="educator-form"
              loading={isSubmitting}
              className="w-1/2 h-11 rounded-full bg-gradient-btn text-white hover:opacity-90 text-sm font-medium"
            >
              {modalMode === "create"
                ? educatorsCopy.addEducator
                : educatorsCopy.updateEducator}
            </Button>
          )}
        </div>
      }
    >
      <form
        id="educator-form"
        onSubmit={(e) => {
          if (productsRequired && (associatedProductKeys?.length ?? 0) === 0) {
            e.preventDefault();
            setProductError(
              "Associate at least one product with this educator.",
            );
            return;
          }
          setProductError(null);
          formik.handleSubmit(e);
        }}
        className="flex flex-col gap-5"
      >
        {/* Hidden submit button ensures Enter key triggers form submission in all browsers */}
        <button
          type="submit"
          aria-hidden="true"
          className="hidden"
          tabIndex={-1}
        />

        <FormField
          label={educatorsCopy.fieldEducatorName}
          required={modalMode !== "view"}
          error={
            (formik.touched.full_name ||
              formik.submitCount > 0 ||
              formik.values.full_name.length > 50) &&
            formik.errors.full_name
              ? (formik.errors.full_name as string)
              : undefined
          }
        >
          <Input
            name="full_name"
            value={formik.values.full_name}
            onChange={(e) => {
              const sanitized = sanitizeTextForTyping(
                e.target.value,
                EDUCATOR_NAME_MAX_LENGTH,
              );
              formik.setFieldValue("full_name", sanitized);
            }}
            onBlur={(e) => {
              const trimmed = trimBoundaryWhitespace(e.target.value);
              if (trimmed !== formik.values.full_name) {
                formik.setFieldValue("full_name", trimmed, false);
              }
              formik.handleBlur(e);
            }}
            disabled={modalMode === "view"}
            placeholder={educatorsCopy.placeholderEducatorName}
          />
        </FormField>

        <FormField
          label={educatorsCopy.fieldEducatorEmail}
          required={modalMode !== "view"}
          error={
            (formik.touched.email || formik.submitCount > 0) &&
            formik.errors.email
              ? (formik.errors.email as string)
              : undefined
          }
        >
          <Input
            name="email"
            type="email"
            value={formik.values.email}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            disabled={modalMode !== "create"}
            placeholder={educatorsCopy.placeholderEducatorEmail}
          />
        </FormField>

        <FormField
          label={educatorsCopy.fieldSchool}
          required={modalMode === "create"}
          error={
            formik.submitCount > 0 && formik.errors.school_id
              ? (formik.errors.school_id as string)
              : undefined
          }
        >
          {modalMode === "view" ? (
            <div className="flex flex-wrap gap-2 min-h-[2.75rem] px-1 py-1">
              {localSchools.length > 0 ? (
                localSchools.map((s) =>
                  onSchoolClick ? (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSchoolClick(s.id, s.school_name)}
                      className="inline-flex items-center bg-[#e9e9e9] text-[#5f6060] border border-gray-300 px-3 py-1 rounded-full text-sm hover:bg-[#5f6060] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 transition-colors"
                      aria-label={`View school ${s.school_name}`}
                    >
                      {s.school_name}
                    </button>
                  ) : (
                    <span
                      key={s.id}
                      className="inline-flex items-center bg-[#e9e9e9] text-[#5f6060] border border-gray-300 px-3 py-1 rounded-full text-sm"
                    >
                      {s.school_name}
                    </span>
                  ),
                )
              ) : (
                <span className="text-gray-500 text-sm">—</span>
              )}
            </div>
          ) : (
            // create and edit modes: searchable multi-select with inline create
            <MultiSelect
              values={localSchools.map((s) => s.id)}
              onChange={reconcileSchools}
              searchable
              options={schoolOptions}
              placeholder={educatorsCopy.placeholderSelectSchool}
              onCreate={onCreateSchool ? handleCreateSchool : undefined}
              createLabel={(n) => `Create school “${n}”`}
            />
          )}
        </FormField>

        <FormField
          label={educatorsCopy.fieldStatus}
          required={modalMode !== "view"}
        >
          {modalMode === "view" ? (
            <Input
              value={
                formik.values.status === "ACTIVE"
                  ? educatorsCopy.statusActive
                  : formik.values.status === "INACTIVE"
                    ? educatorsCopy.statusInactive
                    : educatorsCopy.statusPending
              }
              disabled
              className="h-11 rounded-xl w-full cursor-not-allowed"
            />
          ) : (
            <SelectField
              options={[
                ...(formik.values.status === "PENDING"
                  ? [{ value: "PENDING", label: educatorsCopy.statusPending }]
                  : []),
                { value: "ACTIVE", label: educatorsCopy.statusActive },
                { value: "INACTIVE", label: educatorsCopy.statusInactive },
              ]}
              value={formik.values.status}
              onChange={(val) => formik.setFieldValue("status", val)}
              placeholder={educatorsCopy.placeholderSelectStatus}
              disabled={
                modalMode === "edit" && formik.values.status === "PENDING"
              }
            />
          )}
        </FormField>

        {/* Associated Products — admin-local note of where products are used.
            Does not affect entitlement. */}
        {showProducts &&
          (modalMode === "view" ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-gray-700">
                  Active Associated Products ({productDetails.length})
                </label>
                {onEditFromView && (
                  <button
                    type="button"
                    onClick={onEditFromView}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-gradient-btn hover:opacity-90 rounded-full px-3 py-1.5 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1"
                  >
                    <Plus size={14} aria-hidden="true" />
                    Add Products
                  </button>
                )}
              </div>
              {productDetails.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {productDetails.map((p) => renderProductBox(p, false))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  No active products associated with this educator yet.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-gray-700">
                  Active Associated Products ({productDetails.length})
                  {productsRequired && <span className="text-red-500"> *</span>}
                </label>
                {/* Selector is hidden behind the Add/Edit button (same as the
                    other modals). Save/Cancel live in THIS header row so the
                    portaled dropdown never covers them. */}
                {!showProductSelector ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDraftProductKeys(associatedProductKeys ?? []);
                      setShowProductSelector(true);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-gradient-btn hover:opacity-90 rounded-full px-3 py-1.5 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1"
                  >
                    <Plus size={14} aria-hidden="true" />
                    Add / Edit Associated Products
                  </button>
                ) : (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setDraftProductKeys(associatedProductKeys ?? []);
                        setShowProductSelector(false);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 border border-gray-300 hover:bg-[#e9e9e9] rounded-full px-3 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                    >
                      <X size={14} aria-hidden="true" />
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (associationsDirty)
                          onAssociatedProductsChange?.(draftProductKeys);
                        setShowProductSelector(false);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-gradient-btn hover:opacity-90 rounded-full px-3 py-1.5 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                    >
                      <Check size={14} aria-hidden="true" />
                      Save changes
                    </button>
                  </div>
                )}
              </div>
              {showProductSelector && (
                <>
                  <MultiSelect
                    values={draftProductKeys}
                    options={productOptions ?? []}
                    onChange={(keys) => {
                      setProductError(null);
                      setDraftProductKeys(keys);
                    }}
                    searchable
                    inline
                    placeholder="Search products to associate…"
                  />
                  {productError && (
                    <p className="text-[10px] text-red-500 -mt-1">{productError}</p>
                  )}
                </>
              )}
              <p className="text-sm text-primary-700 bg-[#e9e9e9] rounded-md px-3 py-2">
                Associating a product informs the educator the products they have
                access to use and allows for tracking of products used.
              </p>
              {/* Clean list of the SAVED associations, with per-avatar-product
                  used / allocated / remaining seats and inline seat editing. */}
              {modalMode === "edit" && productDetails.length > 0 && (
                <div className="flex flex-col gap-2 mt-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Saved products &amp; seat allocation
                  </p>
                  <p className="text-sm text-primary-700 bg-[#e9e9e9] rounded-md px-3 py-2">
                    {educatorsCopy.seatsAvatarNote}
                  </p>
                  {productDetails.map((p) => renderProductBox(p, true))}
                </div>
              )}
            </div>
          ))}

        {/* Educator's Product Usage — view mode (avatar seats and/or hardware
            hours, depending on the kinds of associated products). */}
        {modalMode === "view" && productUsageBox}

        {/* Classes — active (with active-student & sims-attempted counts) and
            closed (with sims-attempted counts). View mode only. */}
        {modalMode === "view" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setActiveClassesOpen((o) => !o)}
                aria-expanded={activeClassesOpen}
                className="flex items-center justify-between gap-2 text-sm font-semibold text-gray-700 hover:text-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded"
              >
                <span>Active Classes ({activeClasses.length})</span>
                <ChevronDown
                  size={18}
                  aria-hidden="true"
                  className={`shrink-0 transition-transform ${activeClassesOpen ? "" : "-rotate-90"}`}
                />
              </button>
              {activeClassesOpen &&
                (classesLoading ? (
                  <p className="text-sm text-gray-500">Loading classes…</p>
                ) : activeClasses.length > 0 ? (
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                    {activeClasses.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <span className="text-sm font-medium text-gray-800 truncate">
                          {c.class_name}
                        </span>
                        <span className="flex items-center gap-2 text-xs text-gray-600 whitespace-nowrap tabular-nums">
                          <span>{getActiveStudentCount(c)} active students</span>
                          <span className="text-gray-300">·</span>
                          <span>{getSimsAttempted(c)} sims attempted</span>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No active classes.</p>
                ))}
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setClosedClassesOpen((o) => !o)}
                aria-expanded={closedClassesOpen}
                className="flex items-center justify-between gap-2 text-sm font-semibold text-gray-700 hover:text-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded"
              >
                <span>Closed Classes ({closedClasses.length})</span>
                <ChevronDown
                  size={18}
                  aria-hidden="true"
                  className={`shrink-0 transition-transform ${closedClassesOpen ? "" : "-rotate-90"}`}
                />
              </button>
              {closedClassesOpen &&
                (classesLoading ? (
                  <p className="text-sm text-gray-500">Loading classes…</p>
                ) : closedClasses.length > 0 ? (
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                    {closedClasses.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <span className="text-sm font-medium text-gray-800 truncate">
                          {c.class_name}
                        </span>
                        <span className="flex items-center gap-2 text-xs text-gray-600 whitespace-nowrap tabular-nums">
                          <span>{getInactiveStudentCount(c)} inactive students</span>
                          <span className="text-gray-300">·</span>
                          <span>{getSimsAttempted(c)} sims attempted</span>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No closed classes.</p>
                ))}
            </div>
          </div>
        )}

        {/* Educator's Product Usage — edit mode, above the Add/Remove seat fields. */}
        {modalMode === "edit" && productUsageBox}
        {/* CREATE-mode seat allocation — one input per SELECTED avatar product
            (seats are per specific avatar product). In EDIT mode seats are
            allocated in the "Saved products & seat allocation" list above; there
            is no general add/remove seat field. */}
        {hasAvatar &&
          modalMode === "create" &&
          selectedAvatarProductsCreate.length > 0 && (
            <FormField label={educatorsCopy.fieldAllocateAvatarSeats}>
              {/* Note first (matches the other modals), then per-product rows:
                  half-width input + that product's available seats. */}
              <p className="text-sm text-primary-700 bg-[#e9e9e9] rounded-md px-3 py-2 mb-3">
                {educatorsCopy.seatsAvatarNote}
              </p>
              <div ref={tokenErrorRef} className="flex flex-col gap-3">
                {selectedAvatarProductsCreate.map((prod) => (
                  <div key={prod.value} className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-gray-700">
                      {prod.label}
                    </span>
                    <div className="flex items-center gap-3">
                      <Input
                        value={createAllocations[prod.value] ?? ""}
                        disabled={
                          formik.values.status.toUpperCase() === "INACTIVE"
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "" || /^\d+$/.test(raw))
                            setCreateAllocation(prod.value, raw);
                        }}
                        placeholder="Seats to allocate"
                        className="w-1/2"
                      />
                      <span className="w-1/2 text-sm text-gray-500">
                        Avatar seats available:{" "}
                        <span className="font-semibold text-primary-500">
                          {prod.availableSeats ?? 0}
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </FormField>
          )}
      </form>
    </Modal>
  );
}
