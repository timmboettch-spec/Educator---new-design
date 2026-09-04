import { useMemo, useState } from "react";
import { Check, Minus, Plus, SquarePen, Trash2, X } from "lucide-react";
import TwoStepDeleteModal from "../modal/TwoStepDeleteModal";
import type { ProductUnitInfo } from "../myproducts/ProductEntitlements";
import StatusPill, { type StatusTone } from "../common/StatusPill";
import SortableHeader from "../common/SortableHeader";
import {
  getAllProductNotes,
  getEducatorProductAllocation,
  setEducatorProductAllocation,
} from "../../utils/productNotes";

/**
 * Per-educator products subtable — expands under an educator row. One row per
 * associated product license, with an indented sub-line under the product name
 * showing purchased / remaining seats (avatar products). Avatar Seats Allocated
 * is read-only until the row's Edit action is used, which reveals −/+ steppers
 * (minus disabled once allocation is down to the educator's used seats; plus
 * disabled when the license has no unallocated seats left). The Actions column
 * edits or removes (dissociates) the product.
 *
 * Usage figures (seats used / hours used) are deterministic PLACEHOLDERS. Seat
 * allocation is a real admin-local value (`product_notes_v1` allocations).
 */

const hash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const parseDate = (s?: string): Date | null => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const statusFor = (
  licensedThrough?: string,
): { label: string; tone: StatusTone; rank: number } => {
  const d = parseDate(licensedThrough);
  if (!d) return { label: "Active", tone: "success", rank: 0 };
  const now = Date.now();
  if (d.getTime() < now) return { label: "Expired", tone: "danger", rank: 2 };
  const days = (d.getTime() - now) / 86_400_000;
  if (days <= 60) return { label: "Expiring soon", tone: "warning", rank: 1 };
  return { label: "Active", tone: "success", rank: 0 };
};

// Total avatar seats allocated across ALL educators for a product license.
const totalAllocatedForKey = (key: string): number => {
  const a = getAllProductNotes()[key]?.allocations ?? {};
  return Object.values(a).reduce((sum, n) => sum + (Number(n) || 0), 0);
};

type SortField =
  | "name"
  | "seatsUsed"
  | "allocated"
  | "hoursUsed"
  | "expiration"
  | "status";

export default function EducatorProductsSubtable({
  educatorId,
  products,
  onAllocationChange,
  onDissociate,
}: {
  educatorId: string;
  products: ProductUnitInfo[];
  onAllocationChange: () => void;
  onDissociate: (productKey: string) => void;
}) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
  // The row being edited + a DRAFT allocation (changes are pending until the
  // check is pressed; the X cancels/reverts).
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState(0);
  // Product pending a 2-step dissociation confirmation.
  const [pendingDissociate, setPendingDissociate] = useState<{
    key: string;
    label: string;
  } | null>(null);

  const handleSort = (field: string) => {
    if (sortField === field) {
      const nextDir = sortDir === "asc" ? "desc" : sortDir === "desc" ? null : "asc";
      setSortDir(nextDir);
      if (nextDir === null) setSortField(null);
    } else {
      setSortField(field as SortField);
      setSortDir("asc");
    }
  };

  const rows = useMemo(() => {
    const derived = products.map((p) => {
      const isAvatar = p.kind === "online";
      const allocated = getEducatorProductAllocation(educatorId, p.key);
      const seatsUsed = isAvatar
        ? allocated > 0
          ? hash(educatorId + p.key) % (allocated + 1)
          : hash(educatorId + p.key) % 20
        : null;
      const hoursUsed = !isAvatar
        ? 100 + (hash(educatorId + p.key + "h") % 1300)
        : null;
      const st = statusFor(p.licensedThrough);
      const expDate = parseDate(p.licensedThrough);
      // License seat pool for the plus/minus limits (avatar only).
      const seatsTotal = p.seatsTotal ?? null;
      const licenseRemaining =
        seatsTotal != null ? Math.max(0, seatsTotal - (p.seatsConsumed ?? 0)) : null;
      const otherAllocated = Math.max(
        0,
        totalAllocatedForKey(p.key) - allocated,
      );
      const availableToAllocate =
        seatsTotal != null ? Math.max(0, seatsTotal - otherAllocated) : null;
      // License hour pool (workstation only) — mirrors the avatar seat pool.
      const hoursTotal = !isAvatar ? p.hoursLimit ?? null : null;
      const hoursLicenseRemaining =
        hoursTotal != null ? Math.max(0, hoursTotal - (p.hoursUsed ?? 0)) : null;
      return {
        p,
        isAvatar,
        allocated,
        seatsUsed,
        hoursUsed,
        st,
        expDate,
        seatsTotal,
        licenseRemaining,
        availableToAllocate,
        hoursTotal,
        hoursLicenseRemaining,
      };
    });
    if (!sortField || !sortDir) return derived;
    const val = (r: (typeof derived)[number]): string | number => {
      switch (sortField) {
        case "name":
          return r.p.label.toLowerCase();
        case "seatsUsed":
          return r.seatsUsed ?? -1;
        case "allocated":
          return r.isAvatar ? r.allocated : -1;
        case "hoursUsed":
          return r.hoursUsed ?? -1;
        case "expiration":
          return r.expDate ? r.expDate.getTime() : -1;
        case "status":
          return r.st.rank;
        default:
          return 0;
      }
    };
    return [...derived].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [products, educatorId, sortField, sortDir]);

  const startEdit = (key: string, current: number) => {
    setEditingKey(key);
    setDraftValue(current);
  };
  const commitEdit = (key: string) => {
    setEducatorProductAllocation(educatorId, key, draftValue);
    onAllocationChange();
    setEditingKey(null);
  };
  const cancelEdit = () => setEditingKey(null);

  const HEAD = "px-4 py-2.5 font-semibold text-sm whitespace-nowrap";
  const CELL = "px-4 py-3 text-sm";
  const cols: { key: SortField; label: string; center?: boolean }[] = [
    { key: "name", label: "Product Name" },
    { key: "seatsUsed", label: "Avatar Seats Used", center: true },
    { key: "allocated", label: "Avatar Seats Allocated", center: true },
    { key: "hoursUsed", label: "Hardware Hours Used", center: true },
    { key: "expiration", label: "Expiration Date", center: true },
    { key: "status", label: "Product Status", center: true },
  ];

  return (
    <div className="mx-3 my-4 rounded-xl border border-gray-200 bg-white shadow-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-[#5a6475] text-white text-left">
            <tr>
              {cols.map((c, i) => (
                <th
                  key={c.key}
                  className={`${HEAD} ${c.center ? "text-center" : ""} ${
                    i === 0 ? "rounded-tl-xl" : ""
                  }`}
                >
                  <SortableHeader
                    label={c.label}
                    field={c.key}
                    sortField={sortField}
                    sortDirection={sortDir}
                    onSort={handleSort}
                    className={c.center ? "justify-center w-full" : ""}
                  />
                </th>
              ))}
              <th className={`${HEAD} text-center rounded-tr-xl`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No products associated with this educator yet — click the
                  Associated Products number to associate products.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const { p, isAvatar, allocated, seatsUsed, hoursUsed, st } = r;
                const editing = editingKey === p.key;
                const minusDisabled = draftValue <= (seatsUsed ?? 0);
                const plusDisabled =
                  r.availableToAllocate != null &&
                  draftValue >= r.availableToAllocate;
                return (
                  <tr
                    key={p.key}
                    className="border-t border-gray-100 hover:bg-gray-50 align-top"
                  >
                    <td className={`${CELL} text-gray-800 font-medium`}>
                      <div>{p.label}</div>
                      {isAvatar && r.seatsTotal != null && (
                        <div className="pl-4 mt-0.5 text-xs text-gray-500 tabular-nums">
                          {r.seatsTotal.toLocaleString()} seats purchased ·{" "}
                          {(r.licenseRemaining ?? 0).toLocaleString()} remaining
                        </div>
                      )}
                      {!isAvatar && r.hoursTotal != null && (
                        <div className="pl-4 mt-0.5 text-xs text-gray-500 tabular-nums">
                          {r.hoursTotal.toLocaleString()} hours licensed ·{" "}
                          {(r.hoursLicenseRemaining ?? 0).toLocaleString()} remaining
                        </div>
                      )}
                    </td>
                    <td className={`${CELL} text-center tabular-nums text-gray-700`}>
                      {isAvatar ? seatsUsed : <span className="text-gray-400">—</span>}
                    </td>
                    <td className={`${CELL} text-center`}>
                      {isAvatar ? (
                        editing ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              aria-label="Decrease seats"
                              disabled={minusDisabled}
                              onClick={() =>
                                setDraftValue((v) => Math.max(0, v - 1))
                              }
                              className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-300 text-gray-700 hover:bg-[#e9e9e9] disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Minus size={14} aria-hidden="true" />
                            </button>
                            {/* Manual entry (clamped to the license's allocatable max). */}
                            <input
                              aria-label="Seats allocated"
                              value={draftValue}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^\d]/g, "");
                                const n = raw === "" ? 0 : parseInt(raw, 10);
                                const max = r.availableToAllocate ?? n;
                                setDraftValue(Math.min(n, max));
                              }}
                              className="w-12 h-8 text-center tabular-nums font-semibold text-gray-800 border-2 border-primary-400 rounded-lg outline-none"
                            />
                            <button
                              type="button"
                              aria-label="Increase seats"
                              disabled={plusDisabled}
                              onClick={() => setDraftValue((v) => v + 1)}
                              className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-300 text-gray-700 hover:bg-[#e9e9e9] disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Plus size={14} aria-hidden="true" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            title="Click to edit seat allocation"
                            onClick={() => startEdit(p.key, allocated)}
                            className={`text-sm tabular-nums transition-colors rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
                              allocated === 0
                                ? "font-semibold text-primary-700 border border-primary-500 px-2 py-0.5 hover:bg-[#e9e9e9]"
                                : "text-gray-700 hover:text-primary-600 hover:underline decoration-dotted underline-offset-2 px-1"
                            }`}
                          >
                            {allocated}
                          </button>
                        )
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className={`${CELL} text-center tabular-nums text-gray-700`}>
                      {!isAvatar ? (
                        `${hoursUsed?.toLocaleString()} hrs`
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className={`${CELL} text-center text-gray-600 whitespace-nowrap`}>
                      {p.licensedThrough ?? "—"}
                    </td>
                    <td className={`${CELL} text-center`}>
                      <StatusPill label={st.label} tone={st.tone} />
                    </td>
                    <td className={`${CELL} text-center`}>
                      <div className="inline-flex items-center gap-2">
                        {editing ? (
                          <>
                            <button
                              type="button"
                              aria-label={`Confirm seat change for ${p.label}`}
                              title="Confirm"
                              onClick={() => commitEdit(p.key)}
                              className="p-1.5 rounded-lg bg-primary-500 text-white hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                            >
                              <Check size={16} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Cancel seat change for ${p.label}`}
                              title="Cancel"
                              onClick={cancelEdit}
                              className="p-1.5 rounded-lg text-gray-500 hover:text-black hover:bg-[#e9e9e9] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                            >
                              <X size={16} aria-hidden="true" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              aria-label={`Edit seats for ${p.label}`}
                              title="Edit seat allocation"
                              disabled={!isAvatar}
                              onClick={() => startEdit(p.key, allocated)}
                              className="p-1.5 rounded-lg text-gray-500 hover:text-primary-600 hover:bg-[#e9e9e9] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <SquarePen size={16} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove ${p.label} association`}
                              title="Remove product association"
                              onClick={() =>
                                setPendingDissociate({ key: p.key, label: p.label })
                              }
                              className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-[#e9e9e9] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                            >
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-red-600 bg-[#e9e9e9] px-4 py-2">
        Avatar Seats Used and Hardware Hours Used are placeholder figures — no
        per-educator-per-license usage feed exists yet. Avatar Seats Allocated is
        editable (via the Edit action) and saved locally.
      </p>
      <TwoStepDeleteModal
        isOpen={!!pendingDissociate}
        onClose={() => setPendingDissociate(null)}
        onConfirm={() => {
          if (pendingDissociate) onDissociate(pendingDissociate.key);
          setPendingDissociate(null);
        }}
        itemLabel="product association"
        itemName={pendingDissociate?.label}
        confirmLabel="Remove Association"
        step1Message={`Remove the product association${
          pendingDissociate ? ` for "${pendingDissociate.label}"` : ""
        }? You'll be asked to confirm once more.`}
        step2Message="This removes the product association for this educator (and any seats allocated on it). This cannot be undone."
      />
    </div>
  );
}
