import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal';
import FormField from '../../components/ui/FormField';
import Input from '../../components/ui/Input';
import { Button } from '../ui/Button';
import SelectField from '../ui/Select';
import MultiSelect from '../ui/MultiSelect';
import {
  SCHOOL_NAME_MAX_LENGTH,
  sanitizeTextForTyping,
  trimBoundaryWhitespace,
} from '../../utils/inputSecurity';
import { AlertCircle, Check, Plus, X } from 'lucide-react';
import { School } from '../../redux/schools/GetSchoolsRedux';
import type { SchoolFormValues } from '../../types';
import { FormikProps } from 'formik';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';

type SupportedLang = 'en' | 'es';

const LANGUAGE_STORAGE_KEY = 'app_language';

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

type CreateSchoolModalProps = {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  modalMode: 'create' | 'view' | 'edit' | 'delete';
  selectedSchool: School | null;
  isDeleting: boolean;
  isSubmitting: boolean;
  confirmDelete: () => void;
  formik: FormikProps<SchoolFormValues>;
  // Educators associated with this school (view + edit).
  associatedEducators?: { id: string; name: string; email?: string }[];
  // All educators, as options for the "add existing" picker (edit).
  allEducatorOptions?: { value: string; label: string }[];
  // Reconcile the associated-educator set — parent diffs and dispatches.
  onAssociatedEducatorsChange?: (ids: string[]) => void;
  // Create a brand-new educator for this school (edit). `productKeys` are the
  // products to associate with the new educator (admin-local notes).
  onCreateEducator?: (payload: {
    name: string;
    email: string;
    status: string;
    seats: number;
    productKeys: string[];
    // Per-avatar-product seat allocations (keyed by product/entitlement key).
    allocations: Record<string, number>;
  }) => Promise<void>;
  // Product options for associating products to a newly-added educator (edit).
  // `kind` distinguishes avatar (online) from workstation products so seats are
  // allocated per specific avatar product.
  productOptions?: {
    value: string;
    label: string;
    subLabels?: string[];
    kind?: 'online' | 'workstation';
    // Avatar seats still available to allocate for this specific product.
    availableSeats?: number;
  }[];
  // Admin's remaining avatar seats pool (shown by the Allocate field).
  availableAvatarSeats?: number;
  // Hide all avatar-seat UI when the org has no Online Avatar entitlement.
  hasAvatar?: boolean;
  // Hide hardware-hours UI when the org has no workstation entitlement.
  hasWorkstation?: boolean;
  // School-level usage shown in the view modal (avatar seats + hardware hours).
  schoolUsage?: { avatarSeatsUsed: number; hardwareHoursUsed: number } | null;
  // Switch the open modal from view mode into edit mode (view footer button).
  onEditFromView?: () => void;
  // When true, auto-expand the inline "Add a new educator" form on open.
  autoOpenAddEducator?: boolean;
  // View-mode "Add Educator" button — parent switches to edit + auto-opens form.
  onAddEducatorFromView?: () => void;
  // Clicking an associated educator (view mode) opens their View Educator modal.
  onEducatorClick?: (educatorId: string) => void;
  // Per-educator active-class / active-student counts (view mode).
  educatorClassCounts?: Record<
    string,
    { activeClasses: number; activeStudents: number }
  >;
  educatorCountsLoading?: boolean;
};

export default function CreateSchoolModal({
  isModalOpen,
  setIsModalOpen,
  modalMode,
  selectedSchool,
  isSubmitting,
  formik,
  confirmDelete,
  isDeleting,
  associatedEducators,
  allEducatorOptions,
  onAssociatedEducatorsChange,
  onCreateEducator,
  hasAvatar = true,
  hasWorkstation = true,
  schoolUsage,
  productOptions,
  onEditFromView,
  autoOpenAddEducator,
  onAddEducatorFromView,
  onEducatorClick,
  educatorClassCounts,
  educatorCountsLoading,
}: CreateSchoolModalProps) {
  const [newEducatorName, setNewEducatorName] = useState('');
  const [newEducatorEmail, setNewEducatorEmail] = useState('');
  const [newEducatorStatus, setNewEducatorStatus] = useState('ACTIVE');
  // Seats to allocate per specific avatar product, keyed by product key.
  const [newEducatorAllocations, setNewEducatorAllocations] = useState<
    Record<string, string>
  >({});
  const [newEducatorProducts, setNewEducatorProducts] = useState<string[]>([]);
  // The product selector (MultiSelect) is hidden behind an "Add / Edit
  // Associated Products" button; opening reveals it with check/X.
  const [showProductSelector, setShowProductSelector] = useState(false);
  // Snapshot of the selection when the selector opened, so Cancel can revert.
  const [productSnapshot, setProductSnapshot] = useState<string[]>([]);
  const [creatingEducator, setCreatingEducator] = useState(false);
  // The "Add a new educator" form only appears once a search finds no match.
  const [showAddEducator, setShowAddEducator] = useState(false);

  // Auto-open the "Add a new educator" form when requested (clicking a school's
  // 0-educators chip, or the View-School "Add Educator" button). Reset per open /
  // school / mode change so it doesn't linger.
  useEffect(() => {
    setShowAddEducator(!!autoOpenAddEducator);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenAddEducator, selectedSchool?.id, modalMode]);

  if (!isModalOpen) return null;

  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const schoolsCopy = {
    modalCreateTitle: locale?.schools?.modalCreateTitle ?? 'Create School',
    modalEditTitle: locale?.schools?.modalEditTitle ?? 'Edit School',
    modalViewTitle: locale?.schools?.modalViewTitle ?? 'View School',
    modalDeleteTitle: locale?.schools?.modalDeleteTitle ?? 'Delete School',
    fieldSchoolName: locale?.schools?.fieldSchoolName ?? 'School Name',
    fieldStatus: locale?.schools?.fieldStatus ?? 'Status',
    placeholderSchoolName: locale?.schools?.placeholderSchoolName ?? 'Enter School Name',
    statusActive: locale?.schools?.statusActive ?? 'Active',
    statusInactive: locale?.schools?.statusInactive ?? 'Inactive',
    back: locale?.schools?.back ?? 'Back',
    addSchool: locale?.schools?.addSchool ?? 'Add School',
    updateSchool: locale?.schools?.updateSchool ?? 'Update School',
    deleteSchool: locale?.schools?.deleteSchool ?? 'Delete School',
    deleteConfirm:
      locale?.schools?.deleteConfirm ??
      'Are you sure you want to delete this School? This action cannot be undone.',
  };

  // Same email rule as the Create Educator modal (Yup .email()).
  const newEducatorEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    newEducatorEmail.trim(),
  );

  // Selected products that are avatar (online) — each gets its own seat input.
  const selectedAvatarProducts = (productOptions ?? []).filter(
    (o) => o.kind === 'online' && newEducatorProducts.includes(o.value),
  );

  const renderEducatorCounts = (educatorId: string) => {
    const counts = educatorClassCounts?.[educatorId];
    if (!counts && educatorCountsLoading) {
      return <p className="text-sm text-gray-500">Loading…</p>;
    }
    const activeClasses = counts?.activeClasses ?? 0;
    const activeStudents = counts?.activeStudents ?? 0;
    return (
      <>
        <p className="text-sm text-gray-700 tabular-nums whitespace-nowrap">
          <span className="font-semibold">{activeClasses}</span> active{' '}
          {activeClasses === 1 ? 'class' : 'classes'}
        </p>
        <p className="text-sm text-gray-700 tabular-nums whitespace-nowrap">
          <span className="font-semibold">{activeStudents}</span> active{' '}
          {activeStudents === 1 ? 'student' : 'students'}
        </p>
      </>
    );
  };

  if (modalMode === 'delete') {
    return (
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="">
        <div className="flex flex-col items-center text-center px-6 py-6">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 mb-4">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="text-base font-semibold text-gray-800 mb-2">{schoolsCopy.modalDeleteTitle}</h2>
          <p className="text-sm font-medium text-gray-700 mb-1">{selectedSchool?.school_name}</p>
          <p className="text-sm text-gray-500 mb-6 max-w-sm">{schoolsCopy.deleteConfirm}</p>
          <div className="flex gap-4 w-full">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
              className="w-1/2 h-11 rounded-full text-sm font-medium"
            >
              {schoolsCopy.back}
            </Button>
            <Button
              type="button"
              onClick={confirmDelete}
              loading={isDeleting}
              className="w-1/2 h-11 rounded-full bg-gradient-btn text-white hover:opacity-90 text-sm font-medium"
            >
              {schoolsCopy.deleteSchool}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isModalOpen}
      onClose={() => setIsModalOpen(false)}
      className="max-w-2xl"
      title={
        modalMode === 'create'
          ? schoolsCopy.modalCreateTitle
          : modalMode === 'edit'
            ? schoolsCopy.modalEditTitle
            : schoolsCopy.modalViewTitle
      }
      footer={
        <div className="flex gap-4 flex-row">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsModalOpen(false)}
            className="w-1/2 h-11 rounded-full text-sm font-medium"
          >
            {schoolsCopy.back}
          </Button>
          {modalMode === 'view' ? (
            <Button
              type="button"
              onClick={() => onEditFromView?.()}
              className="w-1/2 h-11 rounded-full bg-gradient-btn text-white hover:opacity-90 text-sm font-medium"
            >
              {schoolsCopy.modalEditTitle}
            </Button>
          ) : (
            <Button
              type="submit"
              form="school-form"
              loading={isSubmitting}
              className="w-1/2 h-11 rounded-full bg-gradient-btn text-white hover:opacity-90 text-sm font-medium"
            >
              {modalMode === 'create' ? schoolsCopy.addSchool : schoolsCopy.updateSchool}
            </Button>
          )}
        </div>
      }
    >
      <form id="school-form" onSubmit={formik.handleSubmit} className="flex flex-col gap-5">
        {/* Hidden submit button ensures Enter key triggers form submission in all browsers */}
        <button type="submit" aria-hidden="true" className="hidden" tabIndex={-1} />
        <FormField
          label={schoolsCopy.fieldSchoolName}
          required
          error={formik.touched.school_name || formik.values.school_name.length > 50
            ? formik.errors.school_name
            : undefined}
        >
          <Input
            name="school_name"
            value={formik.values.school_name}
            onChange={(e) => {
              const sanitized = sanitizeTextForTyping(
                e.target.value,
                SCHOOL_NAME_MAX_LENGTH,
              );
              formik.setFieldValue('school_name', sanitized);
            }}
            onBlur={(e) => {
              const trimmed = trimBoundaryWhitespace(e.target.value);
              if (trimmed !== formik.values.school_name) {
                formik.setFieldValue('school_name', trimmed, false);
              }
              formik.handleBlur(e);
            }}
            disabled={modalMode === 'view'}
            placeholder={schoolsCopy.placeholderSchoolName}
            className={`h-11 rounded-xl w-full${modalMode === 'view' ? 'text-gray-500' : 'bg-white '}`}
          />
        </FormField>

        <FormField
          label={schoolsCopy.fieldStatus}
          required={modalMode !== 'view'}
          error={formik.touched.status ? formik.errors.status : undefined}
        >
          {modalMode === 'view' ? (
            <Input
              value={formik.values.status?.toUpperCase() === 'ACTIVE' ? schoolsCopy.statusActive : schoolsCopy.statusInactive}
              disabled
              className="h-11 rounded-xl w-full text-gray-500 cursor-not-allowed"
            />
          ) : (
            <SelectField
              options={[
                { value: 'ACTIVE', label: schoolsCopy.statusActive },
                { value: 'INACTIVE', label: schoolsCopy.statusInactive },
              ]}
              value={formik.values.status}
              onChange={(val) => formik.setFieldValue('status', val)}
              placeholder={schoolsCopy.statusActive}
            />
          )}
        </FormField>
      </form>

      {/* School-level usage (view) — avatar seats used + hardware hours used. */}
      {modalMode === 'view' && schoolUsage && (hasAvatar || hasWorkstation) && (
        <div className="rounded-xl bg-[#e9e9e9] px-4 py-3 mt-5">
          <p className="text-xs font-semibold text-black uppercase tracking-wide mb-2">
            School&rsquo;s Cumulative Product Usage
          </p>
          <div
            className={`grid ${
              hasAvatar && hasWorkstation ? 'grid-cols-2' : 'grid-cols-1'
            } gap-2 text-center text-[13px]`}
          >
            {hasAvatar && (
              <div>
                <p className="text-gray-600">Avatar seats used</p>
                <p className="font-semibold text-gray-900 tabular-nums">
                  {schoolUsage.avatarSeatsUsed.toLocaleString()}
                </p>
              </div>
            )}
            {hasWorkstation && (
              <div>
                <p className="text-gray-600">Hardware hours used</p>
                <p className="font-semibold text-gray-900 tabular-nums">
                  {schoolUsage.hardwareHoursUsed.toLocaleString()} hrs
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Associated educators — read-only list (view) */}
      {modalMode === 'view' && (
        <div className="flex flex-col gap-2 mt-5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm font-medium text-gray-700">
              Associated Educators ({associatedEducators?.length ?? 0})
            </label>
            {onAddEducatorFromView && (
              <button
                type="button"
                onClick={onAddEducatorFromView}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-gradient-btn hover:opacity-90 rounded-full px-3 py-1.5 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1"
              >
                <Plus size={14} aria-hidden="true" />
                Add Educator
              </button>
            )}
          </div>
          {associatedEducators && associatedEducators.length > 0 ? (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
              {associatedEducators.map((ed) =>
                onEducatorClick ? (
                  <button
                    key={ed.id}
                    type="button"
                    onClick={() => onEducatorClick(ed.id)}
                    className="w-full text-left px-4 py-3 hover:bg-[#e9e9e9] focus:outline-none focus-visible:bg-[#e9e9e9] transition-colors"
                    aria-label={`View educator ${ed.name}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-gray-800 truncate">{ed.name}</p>
                        {ed.email && <p className="text-sm text-gray-500 truncate">{ed.email}</p>}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {renderEducatorCounts(ed.id)}
                      </div>
                    </div>
                  </button>
                ) : (
                  <div key={ed.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-gray-800 truncate">{ed.name}</p>
                        {ed.email && <p className="text-sm text-gray-500 truncate">{ed.email}</p>}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {renderEducatorCounts(ed.id)}
                      </div>
                    </div>
                  </div>
                ),
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No educators associated with this school yet.</p>
          )}
        </div>
      )}

      {/* Associated educators — manage (edit): add existing or create new */}
      {modalMode === 'edit' && (
        <div className="flex flex-col gap-3 mt-5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm font-medium text-gray-700">
              Associated Educators ({associatedEducators?.length ?? 0})
            </label>
            {!showAddEducator && (
              <button
                type="button"
                onClick={() => setShowAddEducator(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-gradient-btn hover:opacity-90 rounded-full px-3 py-1.5 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1"
              >
                <Plus size={14} aria-hidden="true" />
                Add Educator
              </button>
            )}
          </div>
          <MultiSelect
            values={(associatedEducators ?? []).map((e) => e.id)}
            options={allEducatorOptions ?? []}
            onChange={(ids) => onAssociatedEducatorsChange?.(ids)}
            searchable
            placeholder="Search educators to add…"
            onCreate={async (name) => {
              // Don't create from a name alone — reveal the full form pre-filled.
              setNewEducatorName(name);
              setShowAddEducator(true);
              return null;
            }}
            createLabel={(n) => `Add new educator “${n}”`}
            chipClassName="text-sm px-3 py-1"
          />

          {showAddEducator && (
          <div className="rounded-xl border-2 border-primary-400 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-primary-500 uppercase tracking-wide">
                Add a new educator
              </p>
              <button
                type="button"
                onClick={() => setShowAddEducator(false)}
                className="text-xs text-gray-500 hover:text-black"
              >
                Cancel
              </button>
            </div>
            <label
              htmlFor="new-edu-name"
              className="text-sm font-medium text-gray-700"
            >
              Educator Name <span className="text-red-500">*</span>
            </label>
            <Input
              id="new-edu-name"
              value={newEducatorName}
              onChange={(e) => setNewEducatorName(e.target.value)}
              placeholder="Educator Name"
              className="h-10 rounded-xl w-full"
            />
            <label
              htmlFor="new-edu-email"
              className="text-sm font-medium text-gray-700 mt-1"
            >
              Educator Email <span className="text-red-500">*</span>
            </label>
            <Input
              id="new-edu-email"
              type="email"
              value={newEducatorEmail}
              onChange={(e) => setNewEducatorEmail(e.target.value)}
              placeholder="Educator Email"
              className="h-10 rounded-xl w-full"
            />
            {newEducatorEmail.trim() !== '' && !newEducatorEmailValid && (
              <p className="text-xs text-red-500">
                Please enter a valid email address
              </p>
            )}

            <label className="text-sm font-medium text-gray-700 mt-1">
              Status <span className="text-red-500">*</span>
            </label>
            <SelectField
              options={[
                { value: 'ACTIVE', label: schoolsCopy.statusActive },
                { value: 'INACTIVE', label: schoolsCopy.statusInactive },
              ]}
              value={newEducatorStatus}
              onChange={(val) => setNewEducatorStatus(val)}
              placeholder={schoolsCopy.statusActive}
            />

            {(productOptions?.length ?? 0) > 0 && (
              <>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <label className="text-sm font-medium text-gray-700">
                    Active Associated Products ({newEducatorProducts.length}){' '}
                    <span className="text-red-500">*</span>
                  </label>
                  {/* Save/Cancel live in this header row (not below the input) so
                      they stay visible above the portaled selector dropdown. */}
                  {!showProductSelector ? (
                    <button
                      type="button"
                      onClick={() => {
                        setProductSnapshot(newEducatorProducts);
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
                          setNewEducatorProducts(productSnapshot);
                          setShowProductSelector(false);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 border border-gray-300 hover:bg-[#e9e9e9] rounded-full px-3 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                      >
                        <X size={14} aria-hidden="true" />
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowProductSelector(false)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-gradient-btn hover:opacity-90 rounded-full px-3 py-1.5 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                      >
                        <Check size={14} aria-hidden="true" />
                        Save changes
                      </button>
                    </div>
                  )}
                </div>
                {showProductSelector && (
                  <MultiSelect
                    values={newEducatorProducts}
                    options={productOptions ?? []}
                    onChange={setNewEducatorProducts}
                    searchable
                    inline
                    placeholder="Search products to associate…"
                  />
                )}
                <p className="text-sm text-primary-700 bg-[#e9e9e9] rounded-md px-3 py-2">
                  Associating a product informs the educator the products they
                  have access to use and allows for tracking of products used.
                </p>
              </>
            )}

            {/* Avatar seats — one input per SELECTED avatar product (seats are
                allocated on an avatar-product-by-avatar-product basis; workstation
                products get no seat input). */}
            {hasAvatar && selectedAvatarProducts.length > 0 && (
              <>
                <label className="text-sm font-medium text-gray-700 mt-1">
                  Allocate Avatar Seats
                </label>
                <p className="text-sm text-primary-700 bg-[#e9e9e9] rounded-md px-3 py-2">
                  Only allocate seats to educators who will be using avatar
                  products — seats are not applicable for workstation products.
                </p>
                {selectedAvatarProducts.map((prod) => (
                  <div key={prod.value} className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-gray-700">
                      {prod.label}
                    </span>
                    {/* Left half: the seat input; right half: this product's
                        available avatar seats. */}
                    <div className="flex items-center gap-3">
                      <Input
                        value={newEducatorAllocations[prod.value] ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '' || /^\d+$/.test(raw))
                            setNewEducatorAllocations((prev) => ({
                              ...prev,
                              [prod.value]: raw,
                            }));
                        }}
                        placeholder="Seats to allocate"
                        className="h-10 rounded-xl w-1/2"
                      />
                      <span className="w-1/2 text-sm text-gray-500">
                        Avatar seats available:{' '}
                        <span className="font-semibold text-primary-500">
                          {prod.availableSeats ?? 0}
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </>
            )}

            <Button
              type="button"
              variant="gradient"
              disabled={
                creatingEducator ||
                !newEducatorName.trim() ||
                !newEducatorEmailValid ||
                ((productOptions?.length ?? 0) > 0 &&
                  newEducatorProducts.length === 0)
              }
              onClick={async () => {
                setCreatingEducator(true);
                try {
                  const allocations: Record<string, number> = {};
                  for (const prod of selectedAvatarProducts) {
                    const n = Number(newEducatorAllocations[prod.value]) || 0;
                    if (n > 0) allocations[prod.value] = n;
                  }
                  const totalSeats = Object.values(allocations).reduce(
                    (a, n) => a + n,
                    0,
                  );
                  await onCreateEducator?.({
                    name: newEducatorName.trim(),
                    email: newEducatorEmail.trim(),
                    status: newEducatorStatus,
                    seats: totalSeats,
                    productKeys: newEducatorProducts,
                    allocations,
                  });
                  setNewEducatorName('');
                  setNewEducatorEmail('');
                  setNewEducatorStatus('ACTIVE');
                  setNewEducatorAllocations({});
                  setNewEducatorProducts([]);
                  setShowProductSelector(false);
                  setShowAddEducator(false);
                } finally {
                  setCreatingEducator(false);
                }
              }}
              className="h-10 rounded-full text-sm self-start px-5"
            >
              {creatingEducator ? 'Adding…' : 'Add Educator'}
            </Button>
          </div>
          )}
        </div>
      )}
    </Modal>
  );
}
