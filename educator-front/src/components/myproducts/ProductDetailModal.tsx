import { useEffect, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import Modal from '../ui/Modal';
import FormField from '../ui/FormField';
import Input from '../ui/Input';
import MultiSelect from '../ui/MultiSelect';
import { Button } from '../ui/Button';
import { superscriptTrademarks } from '../common/Trademark';

export interface ProductDetailRow {
  product: string;
  hardware?: string;
  defaultUnitName: string;
  entitlementKey: string;
  status: string;
  validFrom: string;
  validThrough: string;
  usage: string;
  pct: string;
}

interface Props {
  isOpen: boolean;
  mode: 'view' | 'edit';
  row: ProductDetailRow | null;
  unitName: string;
  educatorIds: string[];
  educatorOptions: { value: string; label: string }[];
  onClose: () => void;
  onEdit: () => void;
  onSave: (unitName: string, educatorIds: string[]) => void;
  /** Persist an educator-association change immediately (works in view mode too). */
  onEducatorsChange?: (educatorIds: string[]) => void;
}

/** A read-only display row used in view mode (label above value). */
function ViewField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs sm:text-sm font-medium text-gray-700">{label}</span>
      <div className="h-11 flex items-center px-4 rounded-xl border-2 border-gray-200 bg-gray-50 text-sm text-gray-700">
        {children}
      </div>
    </div>
  );
}

export default function ProductDetailModal({
  isOpen,
  mode,
  row,
  unitName,
  educatorIds,
  educatorOptions,
  onClose,
  onEdit,
  onSave,
  onEducatorsChange,
}: Props) {
  const [nameInput, setNameInput] = useState(unitName);
  const [selectedEducators, setSelectedEducators] = useState<string[]>(educatorIds);
  // The educator selector is hidden behind an "Add / Edit" button (same pattern
  // as the product selectors elsewhere); opening edits a draft with header
  // Save/Cancel that persists immediately (so it works in view mode too).
  const [showEducatorSelector, setShowEducatorSelector] = useState(false);
  const [draftEducators, setDraftEducators] = useState<string[]>(educatorIds);

  // Reseed the editable fields whenever the modal (re)opens on a row/mode.
  useEffect(() => {
    if (isOpen) {
      setNameInput(unitName);
      setSelectedEducators(educatorIds);
      setDraftEducators(educatorIds);
      setShowEducatorSelector(false);
    }
  }, [isOpen, mode, unitName, educatorIds]);

  if (!isOpen || !row) return null;

  const associatedNames = selectedEducators
    .map((id) => educatorOptions.find((o) => o.value === id)?.label)
    .filter((n): n is string => !!n);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-2xl"
      title={mode === 'view' ? 'View Product' : 'Edit Product'}
      footer={
        <div className="flex gap-4 flex-row">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="w-1/2 h-11 rounded-full text-sm font-medium"
          >
            Back
          </Button>
          {mode === 'view' ? (
            <Button
              type="button"
              onClick={onEdit}
              className="w-1/2 h-11 rounded-full bg-gradient-btn text-white hover:opacity-90 text-sm font-medium"
            >
              Edit Product
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => onSave(nameInput, selectedEducators)}
              className="w-1/2 h-11 rounded-full bg-gradient-btn text-white hover:opacity-90 text-sm font-medium"
            >
              Save Changes
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <ViewField label="Product">{superscriptTrademarks(row.product)}</ViewField>

        {row.hardware && (
          <ViewField label="Associated Product">
            {superscriptTrademarks(row.hardware)}
          </ViewField>
        )}

        {/* Unit Name — editable in edit mode */}
        {mode === 'edit' ? (
          <FormField label="Unit Name">
            <Input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={row.defaultUnitName}
              className="h-11 rounded-xl w-full"
            />
          </FormField>
        ) : (
          <ViewField label="Unit Name">{unitName}</ViewField>
        )}

        <ViewField label="Entitlement Key">
          <span className="tabular-nums">{row.entitlementKey}</span>
        </ViewField>

        <div className="grid grid-cols-2 gap-4">
          <ViewField label="Start Date">{row.validFrom || '—'}</ViewField>
          <ViewField label="End Date">{row.validThrough || '—'}</ViewField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <ViewField label="Status">{row.status}</ViewField>
          <ViewField label="% Used">{row.pct}</ViewField>
        </div>

        <ViewField label="Usage">{row.usage}</ViewField>

        {/* Associated Educators — where this product is used (notes only).
            Add/edit via the collapse + inline selector, in BOTH view and edit. */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm font-medium text-gray-700">
              Associated Educators ({selectedEducators.length})
            </label>
            {!showEducatorSelector ? (
              <button
                type="button"
                onClick={() => {
                  setDraftEducators(selectedEducators);
                  setShowEducatorSelector(true);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-gradient-btn hover:opacity-90 rounded-full px-3 py-1.5 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1"
              >
                <Plus size={14} aria-hidden="true" />
                Add / Edit Associated Educators
              </button>
            ) : (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setDraftEducators(selectedEducators);
                    setShowEducatorSelector(false);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 border border-gray-300 hover:bg-[#e9e9e9] rounded-full px-3 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                >
                  <X size={14} aria-hidden="true" />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEducators(draftEducators);
                    onEducatorsChange?.(draftEducators);
                    setShowEducatorSelector(false);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-gradient-btn hover:opacity-90 rounded-full px-3 py-1.5 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                >
                  <Check size={14} aria-hidden="true" />
                  Save changes
                </button>
              </div>
            )}
          </div>
          {showEducatorSelector && (
            <MultiSelect
              values={draftEducators}
              options={educatorOptions}
              onChange={setDraftEducators}
              searchable
              inline
              placeholder="Search educators to associate…"
            />
          )}
          {associatedNames.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {associatedNames.map((n, i) => (
                <span
                  key={`${n}-${i}`}
                  className="inline-flex items-center bg-[#e9e9e9] text-[#5f6060] border border-gray-300 px-3 py-1 rounded-full text-sm"
                >
                  {n}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              No educators associated with this product yet.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
