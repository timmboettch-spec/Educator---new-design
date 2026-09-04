/**
 * Product Entitlements — My Products.
 *
 * A single flat, fully-sortable table (one orange header bar matching the
 * Schools/Educators tables) listing every licensed unit across all products.
 * Product is its own column, so sorting any column reorders rows across every
 * product. Columns: Product · Unit · Entitlement Key · Status · Start Date ·
 * End Date · Usage · % Used. Filter chips scope to a modality (Online Avatar /
 * Workstation) and/or audience (Secondary / Post-Secondary).
 *
 * Uses REAL subscription data where the payload carries these fields
 * (classified the same way the dashboard's Usage Monitoring does), and falls
 * back to PLACEHOLDER data only when nothing can be classified.
 */

import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsUpDown, ChevronUp, ChevronDown, Filter, Eye, SquarePen, AlertTriangle, Check, X } from 'lucide-react';
import AssociatedProductsPopover from '../modal/AssociatedProductsPopover';
import type { Subscription } from '../../types';
import { superscriptTrademarks } from '../common/Trademark';
import { getEntitlementFlags } from '../../utils/entitlements';
import ProgressCard from '../ui/ProgressCard';
import FilterPanel from '../common/FilterPanel';
import ProductDetailModal, { type ProductDetailRow } from './ProductDetailModal';
import SharedStatusPill from '../common/StatusPill';
import {
  getAllProductNotes,
  saveProductNote,
  type ProductNote,
} from '../../utils/productNotes';

// Column geometry lives in the COLUMNS descriptor (see below), which drives the
// colgroup, header row and body cells from one ordered source of truth.

type LicenseStatus = 'Active' | 'Expiring soon' | 'Expired';
type Modality = 'online' | 'workstation';
type Audience = 'sec' | 'post';

interface LicenseUnit {
  key: string;
  status: LicenseStatus;
  validFrom?: string;
  validThrough?: string;
  // online (seat-based)
  seatsTotal?: number;
  seatsConsumed?: number;
  // workstation (hour-metered)
  hoursUsed?: number;
  hoursLimit?: number;
}

interface Edition {
  title: string;
  kind: Modality;
  audience: Audience;
  units?: LicenseUnit[]; // online: flat list of licensed units
  hardware?: { name: string; units: LicenseUnit[] }[]; // workstation: grouped by hardware product
}

const PLACEHOLDER_EDITIONS: Edition[] = [
  {
    title: 'RealPatient™ Online Avatar Simulation - Secondary Education Edition',
    kind: 'online',
    audience: 'sec',
    units: [
      { key: 'AVT-SEC-1042', status: 'Active', validFrom: '2026-07-01', validThrough: '2028-06-30', seatsTotal: 50, seatsConsumed: 18 },
    ],
  },
  {
    title: 'RealPatient™ Online Avatar Simulation - Post-Secondary Education Edition',
    kind: 'online',
    audience: 'post',
    units: [
      { key: 'AVT-PS-0198', status: 'Active', validFrom: '2026-01-01', validThrough: '2028-12-31', seatsTotal: 200, seatsConsumed: 55 },
      { key: 'AVT-PS-0233', status: 'Expiring soon', validFrom: '2025-07-01', validThrough: '2028-06-30', seatsTotal: 30, seatsConsumed: 18 },
    ],
  },
  {
    title: 'RealPatient™ Workstation - Secondary Education Edition',
    kind: 'workstation',
    audience: 'sec',
    hardware: [
      {
        name: 'Adult Nursing Manikin',
        units: [
          { key: 'WS-SEC-0071', status: 'Active', validFrom: '2025-07-01', validThrough: '2028-06-30', hoursUsed: 412, hoursLimit: 1500 },
          { key: 'WS-SEC-0072', status: 'Active', validFrom: '2025-07-01', validThrough: '2028-06-30', hoursUsed: 233, hoursLimit: 1500 },
        ],
      },
      {
        name: 'Bariatric Nursing Manikin',
        units: [
          { key: 'WS-SEC-0090', status: 'Active', validFrom: '2025-12-01', validThrough: '2028-12-31', hoursUsed: 88, hoursLimit: 1500 },
        ],
      },
    ],
  },
  {
    title: 'RealPatient™ Workstation - Post-Secondary Education Edition',
    kind: 'workstation',
    audience: 'post',
    hardware: [
      {
        name: 'Knee & Ankle Injury Simulator',
        units: [{ key: 'WS-PS-0044', status: 'Active', validFrom: '2026-01-01', validThrough: '2029-12-31', hoursUsed: 168, hoursLimit: 1500 }],
      },
      {
        name: 'PAT Manikin™',
        units: [{ key: 'WS-PS-0051', status: 'Expired', validFrom: '2023-07-01', validThrough: '2026-06-30', hoursUsed: 1500, hoursLimit: 1500 }],
      },
    ],
  },
];

const fmtDate = (s?: string) => {
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const dateMs = (s?: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s ?? '').trim());
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s ?? '');
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

/** Derive a license status from its validity end date (Expiring soon = within 90 days). */
function statusFor(validThrough?: string): LicenseStatus {
  if (!validThrough) return 'Active';
  const t = dateMs(validThrough);
  if (!t) return 'Active';
  const now = Date.now();
  if (t < now) return 'Expired';
  return (t - now) / 86_400_000 <= 90 ? 'Expiring soon' : 'Active';
}

const STATUS_RANK: Record<LicenseStatus, number> = { Active: 0, 'Expiring soon': 1, Expired: 2 };

/** True when a unit is in the final 10% of its available seats/hours. */
function isLowUnit(u: LicenseUnit): boolean {
  if (u.seatsTotal != null && u.seatsTotal > 0) {
    return (u.seatsTotal - (u.seatsConsumed ?? 0)) / u.seatsTotal <= 0.1;
  }
  if (u.hoursLimit != null && u.hoursLimit > 0) {
    return (u.hoursLimit - (u.hoursUsed ?? 0)) / u.hoursLimit <= 0.1;
  }
  return false;
}

// Classification mirrors the dashboard's Usage Monitoring so both surfaces agree.
const audienceOf = (name: string): Audience | undefined => {
  const v = name.toLowerCase();
  if (/high\s?school/.test(v)) return 'sec';
  if (/post[-\s]?secondary/.test(v) || v.includes('bsn') || v.includes('college') || v.includes('university') || v.includes('pa/pt') || v.includes('nursing')) return 'post';
  if (v.includes('secondary')) return 'sec';
  return undefined;
};
const modalityOf = (name: string, aiFlag?: boolean): Modality => {
  if (aiFlag === true) return 'online';
  if (aiFlag === false) return 'workstation';
  const v = name.toLowerCase();
  if (v.includes('workstation') || v.includes('manikin') || v.includes('trainer')) return 'workstation';
  return 'online';
};

/** Build editions from real subscriptions; returns editions with no content when nothing classifies. */
function classifyEditions(subs: Subscription[]): Edition[] {
  const editions: Edition[] = [
    { title: 'RealPatient™ Online Avatar Simulation - Secondary Education Edition', kind: 'online', audience: 'sec', units: [] },
    { title: 'RealPatient™ Online Avatar Simulation - Post-Secondary Education Edition', kind: 'online', audience: 'post', units: [] },
    { title: 'RealPatient™ Workstation - Secondary Education Edition', kind: 'workstation', audience: 'sec', hardware: [] },
    { title: 'RealPatient™ Workstation - Post-Secondary Education Edition', kind: 'workstation', audience: 'post', hardware: [] },
  ];

  subs.forEach((sub) => {
    const names =
      sub.product_name && sub.product_name.length
        ? sub.product_name
        : [String(sub.platform?.[0] ?? 'RealPatient™ Product')];

    names.forEach((rawName, i) => {
      const name = String(rawName ?? '').trim() || 'RealPatient™ Product';
      const aiFlag = Array.isArray(sub.ai) ? sub.ai[i] : undefined;
      const modality = modalityOf(name, aiFlag);
      const audience = audienceOf(name);
      if (!audience) return; // can't place a key we can't classify
      const bucket = editions.find((e) => e.kind === modality && e.audience === audience);
      if (!bucket) return;

      const key = (typeof sub.redeem_code === 'string' && sub.redeem_code.trim()) || '—';

      if (modality === 'online') {
        const seatsTotal = typeof sub.ai_seats === 'number' ? sub.ai_seats : undefined;
        const seatsAvail = typeof sub.seats_available === 'number' ? sub.seats_available : undefined;
        const seatsConsumed = seatsTotal != null && seatsAvail != null ? Math.max(0, seatsTotal - seatsAvail) : undefined;
        const validThrough = sub.end || sub.hw_support_until || '';
        bucket.units!.push({ key, status: statusFor(validThrough), validThrough, seatsTotal, seatsConsumed });
      } else {
        const groupName = typeof sub.hardware === 'string' && sub.hardware.trim() ? sub.hardware.trim() : 'Workstation';
        const validThrough = (sub.hw_support_until || sub.end || '') as string;
        const hoursUsed = typeof sub.used_hours === 'number' ? (sub.used_hours as number) : undefined;
        const hoursLimit = typeof sub.hour_cap === 'number' ? (sub.hour_cap as number) : undefined;
        let grp = bucket.hardware!.find((h) => h.name === groupName);
        if (!grp) {
          grp = { name: groupName, units: [] };
          bucket.hardware!.push(grp);
        }
        grp.units.push({ key, status: statusFor(validThrough), validThrough, hoursUsed, hoursLimit });
      }
    });
  });

  return editions;
}

function hasContent(e: Edition): boolean {
  return (e.units?.length ?? 0) > 0 || (e.hardware ?? []).some((h) => h.units.length > 0);
}

/**
 * Flat list of every licensed unit as { key (entitlement key), label } — used to
 * offer products as association options elsewhere (e.g. the educator modal).
 * Mirrors the table's own classification + placeholder fallback so the keys line
 * up with what's shown here and with the product-notes store.
 */
export interface ProductUnitInfo {
  key: string;
  label: string;
  kind: 'online' | 'workstation';
  /** Avatar-seats-used phrase (online) or hardware-hours-used phrase (workstation). */
  usage: string;
  /**
   * Compact usage phrase for association menus: avatar → REMAINING seats out of
   * total ("18 of 25 seats remaining"); workstation → USED hours out of total
   * ("734 of 1,500 hours used").
   */
  usageSummary: string;
  /** Formatted license end date (e.g. "Jun 30, 2028"), when known. */
  licensedThrough?: string;
  /** Raw license-level figures (for seat/hour math in the products subtable). */
  seatsTotal?: number;
  seatsConsumed?: number;
  hoursLimit?: number;
  hoursUsed?: number;
}

export function listProductUnits(
  subscriptions: Subscription[] = [],
): ProductUnitInfo[] {
  const real = classifyEditions(subscriptions);
  const eds = (real.some(hasContent) ? real : PLACEHOLDER_EDITIONS).filter(hasContent);
  return flattenRows(eds).map((r) => {
    const usage =
      r.kind === 'online'
        ? r.u.seatsTotal != null
          ? `${r.u.seatsConsumed ?? 0} / ${r.u.seatsTotal} avatar seats used`
          : '—'
        : r.u.hoursUsed != null
          ? `${r.u.hoursUsed.toLocaleString()} / ${(r.u.hoursLimit ?? 0).toLocaleString()} hardware hours used`
          : '—';
    const usageSummary =
      r.kind === 'online'
        ? r.u.seatsTotal != null
          ? `${Math.max(0, r.u.seatsTotal - (r.u.seatsConsumed ?? 0)).toLocaleString()} of ${r.u.seatsTotal.toLocaleString()} seats remaining`
          : 'Seat usage unavailable'
        : r.u.hoursLimit != null || r.u.hoursUsed != null
          ? `${(r.u.hoursUsed ?? 0).toLocaleString()} of ${(r.u.hoursLimit ?? 0).toLocaleString()} hours used`
          : 'Hardware usage unavailable';
    return {
      key: r.u.key,
      label: `${r.product}${r.hardware ? ` · ${r.hardware}` : ''} · Licensed Unit ${r.unitNo}`,
      kind: r.kind,
      usage,
      usageSummary,
      licensedThrough: r.u.validThrough ? fmtDate(r.u.validThrough) : undefined,
      seatsTotal: r.u.seatsTotal ?? undefined,
      seatsConsumed: r.u.seatsConsumed ?? undefined,
      hoursLimit: r.u.hoursLimit ?? undefined,
      hoursUsed: r.u.hoursUsed ?? undefined,
    };
  });
}

function StatusPill({ status }: { status: LicenseStatus }) {
  const tone =
    status === 'Active' ? 'success' : status === 'Expiring soon' ? 'warning' : 'danger';
  return <SharedStatusPill label={status} tone={tone} />;
}

// ---- Flat table model -----------------------------------------------------

type SortDir = 'asc' | 'desc';
type SortState = { col: string; dir: SortDir } | null;
interface FlatRow {
  product: string;
  hardware?: string;
  unitNo: number;
  kind: Modality;
  u: LicenseUnit;
}

interface HeaderCol {
  key: string;
  label: string;
  align: 'left' | 'right' | 'center';
  width: string;
  sortable: boolean;
}

// Single ordered source of truth for the table's columns — drives the colgroup,
// the header row and the body cells so their order can never drift apart.
// Order: Product · Associated Product · Unit Name · Associated Educators ·
// Usage · % Used · Start Date · End Date · Status · Actions. "Usage" is seats
// for online rows and hours for workstation rows; "% Used" is for both.
const COLUMNS: HeaderCol[] = [
  { key: 'product', label: 'Product', align: 'left', width: '15%', sortable: true },
  { key: 'hardware', label: 'Associated Product', align: 'left', width: '12%', sortable: true },
  { key: 'unit', label: 'Unit Name', align: 'left', width: '10%', sortable: true },
  { key: 'educators', label: 'Associated Educators', align: 'right', width: '10%', sortable: true },
  { key: 'usage', label: 'Usage', align: 'right', width: '10%', sortable: true },
  { key: 'pct', label: '% Used', align: 'right', width: '6%', sortable: true },
  { key: 'start', label: 'Start Date', align: 'left', width: '9%', sortable: true },
  { key: 'end', label: 'End Date', align: 'left', width: '9%', sortable: true },
  { key: 'status', label: 'Product Status', align: 'left', width: '8%', sortable: true },
  { key: 'actions', label: 'Actions', align: 'center', width: '8%', sortable: false },
];

/** Flatten every edition/hardware group into one row per licensed unit. */
function flattenRows(editions: Edition[]): FlatRow[] {
  const rows: FlatRow[] = [];
  editions.forEach((e) => {
    if (e.kind === 'workstation') {
      (e.hardware ?? []).forEach((hw) => {
        hw.units.forEach((u, i) => rows.push({ product: e.title, hardware: hw.name, unitNo: i + 1, kind: 'workstation', u }));
      });
    } else {
      (e.units ?? []).forEach((u, i) => rows.push({ product: e.title, unitNo: i + 1, kind: 'online', u }));
    }
  });
  return rows;
}

function sortValFor(col: string, r: FlatRow): number | string {
  switch (col) {
    case 'product':
      return r.product.toLowerCase();
    case 'hardware':
      return (r.hardware ?? '').toLowerCase();
    case 'unit':
      return r.unitNo;
    case 'key':
      return r.u.key;
    case 'status':
      return STATUS_RANK[r.u.status];
    case 'start':
      return dateMs(r.u.validFrom);
    case 'end':
      return dateMs(r.u.validThrough);
    case 'usage':
      return r.kind === 'online' ? r.u.seatsConsumed ?? 0 : r.u.hoursUsed ?? 0;
    case 'pct':
      return r.kind === 'online'
        ? r.u.seatsTotal
          ? (r.u.seatsConsumed ?? 0) / r.u.seatsTotal
          : 0
        : r.u.hoursLimit
          ? (r.u.hoursUsed ?? 0) / r.u.hoursLimit
          : 0;
    default:
      return 0;
  }
}

function usageCell(u: LicenseUnit, kind: Modality): ReactNode {
  if (kind === 'online') {
    return u.seatsTotal != null ? (
      <span className="text-sm font-medium tabular-nums text-gray-900">
        {u.seatsTotal - (u.seatsConsumed ?? 0)} / {u.seatsTotal} seats
      </span>
    ) : (
      <span className="text-gray-500">—</span>
    );
  }
  return u.hoursUsed != null ? (
    <span className="text-sm font-medium tabular-nums text-gray-900">
      {u.hoursUsed.toLocaleString()}
      {u.hoursLimit != null ? ` / ${u.hoursLimit.toLocaleString()}` : ''} hrs
    </span>
  ) : (
    <span className="text-gray-500">—</span>
  );
}

function pctCell(u: LicenseUnit, kind: Modality): ReactNode {
  const pct =
    kind === 'online'
      ? u.seatsTotal
        ? Math.round(((u.seatsConsumed ?? 0) / u.seatsTotal) * 100)
        : null
      : u.hoursLimit
        ? Math.round(((u.hoursUsed ?? 0) / u.hoursLimit) * 100)
        : null;
  return pct != null ? (
    <span className="text-sm tabular-nums text-gray-700">{pct}%</span>
  ) : (
    <span className="text-gray-500">—</span>
  );
}

function usageText(u: LicenseUnit, kind: Modality): string {
  if (kind === 'online') {
    return u.seatsTotal != null
      ? `${u.seatsTotal - (u.seatsConsumed ?? 0)} / ${u.seatsTotal} seats`
      : '—';
  }
  return u.hoursUsed != null
    ? `${u.hoursUsed.toLocaleString()}${u.hoursLimit != null ? ` / ${u.hoursLimit.toLocaleString()}` : ''} hrs`
    : '—';
}

function pctText(u: LicenseUnit, kind: Modality): string {
  const pct =
    kind === 'online'
      ? u.seatsTotal
        ? Math.round(((u.seatsConsumed ?? 0) / u.seatsTotal) * 100)
        : null
      : u.hoursLimit
        ? Math.round(((u.hoursUsed ?? 0) / u.hoursLimit) * 100)
        : null;
  return pct != null ? `${pct}%` : '—';
}

function pctNumber(u: LicenseUnit, kind: Modality): number | null {
  const p =
    kind === 'online'
      ? u.seatsTotal
        ? ((u.seatsConsumed ?? 0) / u.seatsTotal) * 100
        : null
      : u.hoursLimit
        ? ((u.hoursUsed ?? 0) / u.hoursLimit) * 100
        : null;
  return p == null ? null : Math.round(p);
}

// % Used range filter options.
const PCT_RANGES: { value: string; label: string; min: number; max: number }[] = [
  { value: '0-10', label: '0–10%', min: 0, max: 10 },
  { value: '11-50', label: '11–50%', min: 11, max: 50 },
  { value: '50-90', label: '50–90%', min: 50, max: 90 },
  { value: '91-100', label: '91–100%', min: 91, max: 100 },
];

// Sentinel in the Associated Educators filter matching products with 0 educators.
const NO_EDUCATORS_VALUE = '__no_educators__';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="text-gray-500">
      {label}: <span className="font-semibold text-gray-900 tabular-nums">{value}</span>
    </span>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
        active ? 'bg-primary-500 text-white' : 'bg-[#e9e9e9] text-[#5f6060] hover:bg-gray-300'
      }`}
    >
      {children}
    </button>
  );
}

export default function ProductEntitlements({
  subscriptions = [],
  initialSearch = '',
  initialAttention = '',
  initialAssoc = '',
  educatorOptions = [],
  attentionSlot,
}: {
  subscriptions?: Subscription[];
  initialSearch?: string;
  initialAttention?: 'expiring' | 'low' | 'active' | 'expired' | '';
  initialAssoc?: 'none' | 'some' | '';
  educatorOptions?: { value: string; label: string }[];
  // When provided, the "needing attention" tile is portaled into this element
  // (the page header) instead of rendered inline. `undefined` = render inline.
  attentionSlot?: HTMLElement | null;
}) {
  // Entitlement gating: only show online editions when entitled to avatar, only
  // workstation editions when entitled to hardware. (Prototype mode shows both.)
  const { hasAvatar, hasWorkstation } = getEntitlementFlags();

  const real = classifyEditions(subscriptions);
  const usingReal = real.some(hasContent);
  const allEditions = (usingReal ? real : PLACEHOLDER_EDITIONS)
    .filter(hasContent)
    .filter((e) => (e.kind === 'online' ? hasAvatar : hasWorkstation));

  const [sort, setSort] = useState<SortState>(null);
  const [search, setSearch] = useState(initialSearch);
  // Attention filter seeded from a dashboard shortcut (expiring / low / active).
  const [attention, setAttention] = useState<
    'expiring' | 'low' | 'active' | 'expired' | ''
  >(initialAttention);
  // Association-presence filter seeded from a dashboard shortcut.
  const [assoc, setAssoc] = useState<'none' | 'some' | ''>(initialAssoc);
  // Admin-local notes (custom unit name + associated educators) per entitlement
  // key, plus the view/edit product modal state.
  const [notes, setNotes] = useState<Record<string, ProductNote>>(() =>
    getAllProductNotes(),
  );
  const [selectedRow, setSelectedRow] = useState<FlatRow | null>(null);
  const [productModalMode, setProductModalMode] = useState<'view' | 'edit'>('view');
  // Inline Unit Name editing in the table (click the cell to edit).
  const [editingUnitKey, setEditingUnitKey] = useState<string | null>(null);
  const [unitDraft, setUnitDraft] = useState('');

  const unitNameFor = (r: FlatRow) =>
    notes[r.u.key]?.unitName || `Licensed Unit ${r.unitNo}`;

  // Merge-and-persist a product note (saveProductNote OVERWRITES, so carry the
  // fields we aren't changing — unit name, educators, allocations).
  const persistNote = (
    key: string,
    partial: { unitName?: string; educatorIds?: string[] },
  ) => {
    const existing = notes[key];
    saveProductNote(key, {
      unitName: partial.unitName ?? existing?.unitName,
      educatorIds: partial.educatorIds ?? existing?.educatorIds ?? [],
      allocations: existing?.allocations,
    });
    setNotes(getAllProductNotes());
  };

  const handleSaveProduct = (unitName: string, educatorIds: string[]) => {
    if (!selectedRow) return;
    persistNote(selectedRow.u.key, { unitName, educatorIds });
    setProductModalMode('view');
  };

  const commitUnitEdit = (r: FlatRow) => {
    persistNote(r.u.key, { unitName: unitDraft.trim() || undefined });
    setEditingUnitKey(null);
  };

  // Body-cell content keyed by column — mirrors the COLUMNS order so the header
  // and body can never drift apart when columns are reordered.
  const renderCell = (col: string, r: FlatRow): ReactNode => {
    switch (col) {
      case 'product':
        return <div className="font-medium text-gray-800 leading-snug">{superscriptTrademarks(r.product)}</div>;
      case 'hardware':
        return r.hardware ? (
          <span className="text-sm text-gray-700">{superscriptTrademarks(r.hardware)}</span>
        ) : (
          <span className="text-gray-500">—</span>
        );
      case 'unit': {
        const editing = editingUnitKey === r.u.key;
        return editing ? (
          <span
            className="inline-flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={unitDraft}
              onChange={(e) => setUnitDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitUnitEdit(r);
                else if (e.key === 'Escape') setEditingUnitKey(null);
              }}
              className="w-28 h-8 px-2 rounded-lg border-2 border-primary-400 text-sm outline-none"
            />
            <button
              type="button"
              aria-label="Confirm unit name"
              title="Confirm"
              onClick={() => commitUnitEdit(r)}
              className="p-1 rounded-md bg-primary-500 text-white hover:bg-primary-600"
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              aria-label="Cancel unit name edit"
              title="Cancel"
              onClick={() => setEditingUnitKey(null)}
              className="p-1 rounded-md text-gray-500 hover:text-black hover:bg-[#e9e9e9]"
            >
              <X size={14} />
            </button>
          </span>
        ) : (
          <button
            type="button"
            title="Click to edit unit name"
            onClick={(e) => {
              e.stopPropagation();
              setUnitDraft(unitNameFor(r));
              setEditingUnitKey(r.u.key);
            }}
            className="font-medium text-gray-800 text-left hover:text-primary-600 hover:underline decoration-dotted underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded"
          >
            {unitNameFor(r)}
          </button>
        );
      }
      case 'educators': {
        const ids = notes[r.u.key]?.educatorIds ?? [];
        return (
          <span
            className="inline-flex"
            onClick={(e) => e.stopPropagation()}
          >
            <AssociatedProductsPopover
              count={ids.length}
              educatorName={`${r.product} · ${unitNameFor(r)}`}
              title="Associated Educators"
              subjectLabel="Product"
              bodyLabel="Educators associated with this product"
              noteText=""
              options={educatorOptions}
              values={ids}
              onChange={(newIds) => persistNote(r.u.key, { educatorIds: newIds })}
              ariaLabel={
                ids.length === 0
                  ? 'No educators associated — associate educators'
                  : `${ids.length} associated educator${ids.length === 1 ? '' : 's'} — view or associate`
              }
            />
          </span>
        );
      }
      case 'usage':
        return usageCell(r.u, r.kind);
      case 'pct':
        return pctCell(r.u, r.kind);
      case 'start':
        return (
          <span className="text-sm text-gray-700 tabular-nums">{r.u.validFrom ? fmtDate(r.u.validFrom) : '—'}</span>
        );
      case 'end':
        return (
          <span className="text-sm text-gray-700 tabular-nums">{r.u.validThrough ? fmtDate(r.u.validThrough) : '—'}</span>
        );
      case 'status':
        return <StatusPill status={r.u.status} />;
      case 'actions':
        return (
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              aria-label="View product"
              title="View product"
              className="p-1.5 rounded-md text-gray-500 hover:text-primary-500 hover:bg-[#e9e9e9] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedRow(r);
                setProductModalMode('view');
              }}
            >
              <Eye size={17} />
            </button>
            <button
              type="button"
              aria-label="Edit product"
              title="Edit product"
              className="p-1.5 rounded-md text-gray-500 hover:text-primary-500 hover:bg-[#e9e9e9] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedRow(r);
                setProductModalMode('edit');
              }}
            >
              <SquarePen size={16} />
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  // Advanced filter panel (product / audience / associated product / status /
  // start & end date ranges).
  const emptyAdv = {
    products: [] as string[],
    audiences: [] as string[],
    hardware: [] as string[],
    statuses: [] as string[],
    educators: [] as string[],
    pctRanges: [] as string[],
    startFrom: '',
    startTo: '',
    endFrom: '',
    endTo: '',
  };
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [pendingAdv, setPendingAdv] = useState(emptyAdv);
  const [appliedAdv, setAppliedAdv] = useState(emptyAdv);
  const hasActiveAdv =
    appliedAdv.products.length > 0 ||
    appliedAdv.audiences.length > 0 ||
    appliedAdv.hardware.length > 0 ||
    appliedAdv.statuses.length > 0 ||
    appliedAdv.educators.length > 0 ||
    appliedAdv.pctRanges.length > 0 ||
    !!appliedAdv.startFrom ||
    !!appliedAdv.startTo ||
    !!appliedAdv.endFrom ||
    !!appliedAdv.endTo;

  // Associated-product options: hardware names + an "online (no hardware)" entry.
  const hardwareNames = new Set<string>();
  let hasOnlineRows = false;
  allEditions.forEach((e) => {
    if (e.kind === 'workstation') (e.hardware ?? []).forEach((h) => hardwareNames.add(h.name));
    else hasOnlineRows = true;
  });
  const hardwareOptions = [
    ...(hasOnlineRows ? [{ value: '__online__', label: 'Online (no hardware)' }] : []),
    ...[...hardwareNames].sort().map((n) => ({ value: n, label: n })),
  ];
  const statusOptions = [
    { value: 'Active', label: 'Active' },
    { value: 'Expiring soon', label: 'Expiring soon' },
    { value: 'Expired', label: 'Expired' },
  ];
  const productOptions = [
    ...(hasAvatar ? [{ value: 'online', label: 'Online Avatar' }] : []),
    ...(hasWorkstation ? [{ value: 'workstation', label: 'Workstation' }] : []),
  ];
  const audienceOptions = [
    { value: 'sec', label: 'Secondary' },
    { value: 'post', label: 'Post-Secondary' },
  ];

  const editions = allEditions.filter(
    (e) =>
      (appliedAdv.products.length === 0 || appliedAdv.products.includes(e.kind)) &&
      (appliedAdv.audiences.length === 0 || appliedAdv.audiences.includes(e.audience)),
  );

  const onSort = (col: string) =>
    setSort((prev) => (prev && prev.col === col && prev.dir === 'asc' ? { col, dir: 'desc' } : { col, dir: 'asc' }));

  // Flatten to rows, apply search + the advanced filter, then sort across ALL products.
  const searchTerm = search.trim().toLowerCase();
  const rows = flattenRows(editions).filter((r) => {
    if (searchTerm) {
      const hay = [r.product, r.hardware ?? '', `licensed unit ${r.unitNo}`, r.u.key, r.u.status]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(searchTerm)) return false;
    }
    const hwKey = r.hardware ?? '__online__';
    if (appliedAdv.hardware.length && !appliedAdv.hardware.includes(hwKey)) return false;
    if (appliedAdv.statuses.length && !appliedAdv.statuses.includes(r.u.status)) return false;
    if (appliedAdv.startFrom && dateMs(r.u.validFrom) < dateMs(appliedAdv.startFrom)) return false;
    if (appliedAdv.startTo && dateMs(r.u.validFrom) > dateMs(appliedAdv.startTo)) return false;
    if (appliedAdv.endFrom && dateMs(r.u.validThrough) < dateMs(appliedAdv.endFrom)) return false;
    if (appliedAdv.endTo && dateMs(r.u.validThrough) > dateMs(appliedAdv.endTo)) return false;
    // Dashboard attention shortcut.
    if (attention === 'active' && r.u.status === 'Expired') return false;
    if (attention === 'expiring' && r.u.status !== 'Expiring soon') return false;
    if (attention === 'expired' && r.u.status !== 'Expired') return false;
    if (attention === 'low' && !isLowUnit(r.u)) return false;
    // Association-presence shortcut.
    const rowEducatorIds = notes[r.u.key]?.educatorIds ?? [];
    if (assoc === 'none' && rowEducatorIds.length > 0) return false;
    if (assoc === 'some' && rowEducatorIds.length === 0) return false;
    // Associated-educator filter (any of the selected, or "no educators").
    if (appliedAdv.educators.length) {
      const wantsNone = appliedAdv.educators.includes(NO_EDUCATORS_VALUE);
      const selectedEd = appliedAdv.educators.filter(
        (id) => id !== NO_EDUCATORS_VALUE,
      );
      const matchNone = wantsNone && rowEducatorIds.length === 0;
      const matchSome = selectedEd.some((id) => rowEducatorIds.includes(id));
      if (!matchNone && !matchSome) return false;
    }
    // % Used range filter (any of the selected ranges).
    if (appliedAdv.pctRanges.length) {
      const p = pctNumber(r.u, r.kind);
      const inAnyRange = appliedAdv.pctRanges.some((v) => {
        const range = PCT_RANGES.find((x) => x.value === v);
        return range != null && p != null && p >= range.min && p <= range.max;
      });
      if (!inAnyRange) return false;
    }
    return true;
  });
  if (sort) {
    rows.sort((a, b) => {
      let cmp: number;
      if (sort.col === 'educators') {
        // Derived from the admin-local notes, not on the row itself.
        cmp =
          (notes[a.u.key]?.educatorIds?.length ?? 0) -
          (notes[b.u.key]?.educatorIds?.length ?? 0);
      } else {
        const va = sortValFor(sort.col, a);
        const vb = sortValFor(sort.col, b);
        cmp =
          typeof va === 'number' && typeof vb === 'number'
            ? va - vb
            : String(va).localeCompare(String(vb));
      }
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }

  // Attention counts run across ALL products (independent of the current
  // search/filter) so the tile summarises the whole set, like the dashboard.
  const allRows = flattenRows(editions);
  const prodNoEducators = allRows.filter(
    (r) => (notes[r.u.key]?.educatorIds?.length ?? 0) === 0,
  ).length;
  const prodExpiring = allRows.filter((r) => r.u.status === 'Expiring soon').length;
  // "Approaching usage limit" maps to the 91–100% band so the tile count matches
  // the regular %-Used filter it applies.
  const prodApproaching = allRows.filter((r) => {
    const p = pctNumber(r.u, r.kind);
    return p != null && p >= 91;
  }).length;
  const prodNeedingAttention = allRows.filter((r) => {
    const p = pctNumber(r.u, r.kind);
    return (
      (notes[r.u.key]?.educatorIds?.length ?? 0) === 0 ||
      r.u.status === 'Expiring soon' ||
      (p != null && p >= 91)
    );
  }).length;

  // A tile button applies a regular advanced-filter selection and opens the
  // filter panel, so the choice shows in the normal filter area (fields + chips)
  // rather than a separate "Showing:" pill.
  const applyProdFilter = (partial: Partial<typeof emptyAdv>) => {
    const next = { ...emptyAdv, ...partial };
    setPendingAdv(next);
    setAppliedAdv(next);
    setAttention('');
    setAssoc('');
    setSearch('');
    setIsFilterOpen(true);
  };

  // Summary reflects the current filter.
  const onlineUnits = editions.filter((e) => e.kind === 'online').flatMap((e) => e.units ?? []);
  const wsUnits = editions.filter((e) => e.kind === 'workstation').flatMap((e) => e.hardware ?? []).flatMap((h) => h.units);
  const allUnits = [...onlineUnits, ...wsUnits];
  const products =
    editions.filter((e) => e.kind === 'online').length +
    editions.filter((e) => e.kind === 'workstation').reduce((a, e) => a + (e.hardware?.length ?? 0), 0);
  const activeLicenses = allUnits.filter((u) => u.status !== 'Expired').length;
  const seatsTotal = onlineUnits.reduce((a, u) => a + (u.seatsTotal ?? 0), 0);
  const seatsConsumed = onlineUnits.reduce((a, u) => a + (u.seatsConsumed ?? 0), 0);
  const hwUsed = wsUnits.reduce((a, u) => a + (u.hoursUsed ?? 0), 0);
  const hwLimit = wsUnits.reduce((a, u) => a + (u.hoursLimit ?? 0), 0);

  // Chips summarizing the applied advanced filters.
  const advChips: { key: string; label: string; displayValue: string }[] = [];
  appliedAdv.products.forEach((v) =>
    advChips.push({ key: `products::${v}`, label: 'Product', displayValue: productOptions.find((o) => o.value === v)?.label ?? v }),
  );
  appliedAdv.audiences.forEach((v) =>
    advChips.push({ key: `audiences::${v}`, label: 'Audience', displayValue: audienceOptions.find((o) => o.value === v)?.label ?? v }),
  );
  appliedAdv.hardware.forEach((v) =>
    advChips.push({ key: `hardware::${v}`, label: 'Associated Product', displayValue: hardwareOptions.find((o) => o.value === v)?.label ?? v }),
  );
  appliedAdv.statuses.forEach((v) => advChips.push({ key: `statuses::${v}`, label: 'Product Status', displayValue: v }));
  appliedAdv.educators.forEach((v) =>
    advChips.push({
      key: `educators::${v}`,
      label: 'Educator',
      displayValue:
        v === NO_EDUCATORS_VALUE
          ? 'No associated educators'
          : (educatorOptions.find((o) => o.value === v)?.label ?? v),
    }),
  );
  appliedAdv.pctRanges.forEach((v) =>
    advChips.push({
      key: `pctRanges::${v}`,
      label: '% Used',
      displayValue: PCT_RANGES.find((r) => r.value === v)?.label ?? v,
    }),
  );
  if (appliedAdv.startFrom) advChips.push({ key: 'startFrom', label: 'Start from', displayValue: fmtDate(appliedAdv.startFrom) });
  if (appliedAdv.startTo) advChips.push({ key: 'startTo', label: 'Start to', displayValue: fmtDate(appliedAdv.startTo) });
  if (appliedAdv.endFrom) advChips.push({ key: 'endFrom', label: 'End from', displayValue: fmtDate(appliedAdv.endFrom) });
  if (appliedAdv.endTo) advChips.push({ key: 'endTo', label: 'End to', displayValue: fmtDate(appliedAdv.endTo) });

  const removeAdvChip = (key: string) => {
    const [field, value] = key.split('::');
    const update = (adv: typeof emptyAdv): typeof emptyAdv => {
      const next = {
        ...adv,
        products: [...adv.products],
        audiences: [...adv.audiences],
        hardware: [...adv.hardware],
        statuses: [...adv.statuses],
        educators: [...adv.educators],
        pctRanges: [...adv.pctRanges],
      };
      if (value !== undefined) {
        if (field === 'products') next.products = adv.products.filter((v) => v !== value);
        else if (field === 'audiences') next.audiences = adv.audiences.filter((v) => v !== value);
        else if (field === 'hardware') next.hardware = adv.hardware.filter((v) => v !== value);
        else if (field === 'statuses') next.statuses = adv.statuses.filter((v) => v !== value);
        else if (field === 'educators') next.educators = adv.educators.filter((v) => v !== value);
        else if (field === 'pctRanges') next.pctRanges = adv.pctRanges.filter((v) => v !== value);
      } else if (field === 'startFrom') next.startFrom = '';
      else if (field === 'startTo') next.startTo = '';
      else if (field === 'endFrom') next.endFrom = '';
      else if (field === 'endTo') next.endTo = '';
      return next;
    };
    setAppliedAdv(update);
    setPendingAdv(update);
  };
  const clearAllAdv = () => {
    setAppliedAdv(emptyAdv);
    setPendingAdv(emptyAdv);
  };

  // Compact "needing attention" tile (shown only when something needs it). It is
  // either portaled into the page header (`attentionSlot`) or rendered inline.
  const attentionTile =
    prodNeedingAttention > 0 ? (
      <ProgressCard
        label="Active Products Needing Attention"
        value={`${prodNeedingAttention} of ${allRows.length} active products need attention`}
        progress={prodNeedingAttention}
        total={allRows.length}
        subText="Active products without associated educators, expiring soon, or in the final 10% of use"
        icon={AlertTriangle}
        largeActions
        actions={[
          {
            label: `View Products Without Educators (${prodNoEducators})`,
            onClick: () => applyProdFilter({ educators: [NO_EDUCATORS_VALUE] }),
          },
          {
            label: `View Products Expiring Soon (${prodExpiring})`,
            onClick: () => applyProdFilter({ statuses: ['Expiring soon'] }),
          },
          {
            label: `View Products Approaching Usage Limit (${prodApproaching})`,
            onClick: () => applyProdFilter({ pctRanges: ['91-100'] }),
          },
        ]}
      />
    ) : null;

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-100 shadow-sm">
      {attentionSlot !== undefined && attentionSlot && attentionTile
        ? createPortal(attentionTile, attentionSlot)
        : null}
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-base sm:text-lg font-semibold">Product Entitlements</h3>
        {attentionSlot === undefined && attentionTile && (
          <div className="lg:flex-1 lg:max-w-xl lg:px-2">{attentionTile}</div>
        )}
        <div className="flex items-center gap-2 flex-shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            aria-label="Search products"
            className="w-40 sm:w-56 h-9 px-4 rounded-full border border-gray-300 text-sm text-gray-700 focus:border-primary-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setIsFilterOpen((o) => !o)}
            aria-label={hasActiveAdv ? 'Filter (active)' : 'Filter'}
            className={`w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full border transition-colors ${
              hasActiveAdv
                ? 'border-[#5f6060] bg-[#5f6060] text-white hover:bg-[#4f5050]'
                : 'border-gray-400 text-gray-600 hover:border-primary-500'
            }`}
          >
            <Filter size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {!usingReal && (
        <p className="text-xs text-red-600 bg-[#e9e9e9] rounded-md px-3 py-2 mb-3">
          Sample data — placeholder for UI review. Real entitlements appear once activation codes are redeemed.
        </p>
      )}

      {attention && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-gray-500">Showing:</span>
          <span className="inline-flex items-center gap-2 bg-[#5f6060] text-white text-xs font-medium rounded-full px-3 py-1">
            {attention === 'expiring'
              ? 'Expiring soon'
              : attention === 'low'
                ? 'Approaching usage limit'
                : attention === 'expired'
                  ? 'Expired products'
                  : 'Active products'}
            <button
              type="button"
              onClick={() => setAttention('')}
              aria-label="Clear filter"
              className="hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded"
            >
              ×
            </button>
          </span>
        </div>
      )}

      {assoc && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-gray-500">Showing:</span>
          <span className="inline-flex items-center gap-2 bg-[#5f6060] text-white text-xs font-medium rounded-full px-3 py-1">
            {assoc === 'none'
              ? 'Products with no associated educators'
              : 'Products with associated educators'}
            <button
              type="button"
              onClick={() => setAssoc('')}
              aria-label="Clear filter"
              className="hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded"
            >
              ×
            </button>
          </span>
        </div>
      )}

      {isFilterOpen && (
        <FilterPanel
          title="Filter Products"
          onApply={() => {
            setAppliedAdv({ ...pendingAdv });
            setIsFilterOpen(false);
          }}
          onReset={() => {
            setPendingAdv(emptyAdv);
            setAppliedAdv(emptyAdv);
          }}
          onClose={() => {
            setPendingAdv({ ...appliedAdv });
            setIsFilterOpen(false);
          }}
          fields={[
            {
              label: 'Product',
              multiple: true,
              values: pendingAdv.products,
              value: '',
              placeholder: 'Select product type',
              onChange: () => undefined,
              onValuesChange: (v) => setPendingAdv((p) => ({ ...p, products: v })),
              options: productOptions,
            },
            {
              label: 'Audience',
              multiple: true,
              values: pendingAdv.audiences,
              value: '',
              placeholder: 'Select audience',
              onChange: () => undefined,
              onValuesChange: (v) => setPendingAdv((p) => ({ ...p, audiences: v })),
              options: audienceOptions,
            },
            {
              label: 'Associated Product',
              multiple: true,
              values: pendingAdv.hardware,
              value: '',
              placeholder: 'Select product',
              searchable: true,
              onChange: () => undefined,
              onValuesChange: (v) => setPendingAdv((p) => ({ ...p, hardware: v })),
              options: hardwareOptions,
            },
            {
              label: 'Associated Educators',
              multiple: true,
              values: pendingAdv.educators,
              value: '',
              placeholder: 'Select educators',
              searchable: true,
              onChange: () => undefined,
              onValuesChange: (v) => setPendingAdv((p) => ({ ...p, educators: v })),
              options: [
                { value: NO_EDUCATORS_VALUE, label: 'No associated educators' },
                ...educatorOptions,
              ],
            },
            {
              label: '% Used',
              multiple: true,
              values: pendingAdv.pctRanges,
              value: '',
              placeholder: 'Select % used ranges',
              onChange: () => undefined,
              onValuesChange: (v) => setPendingAdv((p) => ({ ...p, pctRanges: v })),
              options: PCT_RANGES.map((r) => ({ value: r.value, label: r.label })),
            },
            {
              label: 'Start date — from',
              type: 'date',
              value: pendingAdv.startFrom,
              placeholder: '',
              onChange: (v) => setPendingAdv((p) => ({ ...p, startFrom: v })),
              options: [],
            },
            {
              label: 'Start date — to',
              type: 'date',
              value: pendingAdv.startTo,
              placeholder: '',
              onChange: (v) => setPendingAdv((p) => ({ ...p, startTo: v })),
              options: [],
            },
            {
              label: 'End date — from',
              type: 'date',
              value: pendingAdv.endFrom,
              placeholder: '',
              onChange: (v) => setPendingAdv((p) => ({ ...p, endFrom: v })),
              options: [],
            },
            {
              label: 'End date — to',
              type: 'date',
              value: pendingAdv.endTo,
              placeholder: '',
              onChange: (v) => setPendingAdv((p) => ({ ...p, endTo: v })),
              options: [],
            },
            {
              label: 'Product Status',
              multiple: true,
              values: pendingAdv.statuses,
              value: '',
              placeholder: 'Select status',
              onChange: () => undefined,
              onValuesChange: (v) => setPendingAdv((p) => ({ ...p, statuses: v })),
              options: statusOptions,
            },
          ]}
        />
      )}

      {advChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {advChips.map((c) => (
            <span
              key={c.key}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#e9e9e9] border border-gray-300 rounded-full text-sm text-[#5f6060]"
            >
              <span className="font-medium">{c.label}:</span>
              <span>{c.displayValue}</span>
              <button
                type="button"
                onClick={() => removeAdvChip(c.key)}
                className="ml-0.5 text-gray-500 hover:text-black"
                aria-label={`Remove ${c.label} filter`}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearAllAdv}
            className="text-xs font-medium text-slate-600 hover:text-primary-600 border border-slate-300 hover:border-gray-400 rounded-full px-3 py-1"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Summary (compact, no big tiles) */}
      <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm mb-5 pb-4 border-b border-gray-100">
        <Stat label="Products" value={products} />
        <Stat label="Active licenses" value={`${activeLicenses} / ${allUnits.length}`} />
        {hasAvatar && seatsTotal > 0 && (
          <Stat label="Avatar seats available" value={`${(seatsTotal - seatsConsumed).toLocaleString()} / ${seatsTotal.toLocaleString()}`} />
        )}
        {hasAvatar && seatsConsumed > 0 && <Stat label="Avatar seats consumed" value={seatsConsumed.toLocaleString()} />}
        {hasWorkstation && hwLimit > 0 && <Stat label="Hardware hours" value={`${hwUsed.toLocaleString()} / ${hwLimit.toLocaleString()}`} />}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">No products match the selected filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] table-fixed border-collapse">
            <colgroup>
              {COLUMNS.map((c) => (
                <col key={c.key} style={{ width: c.width }} />
              ))}
            </colgroup>
            {/* Orange header bar — matches the Schools / Educators tables */}
            <thead>
              <tr className="bg-primary-500 text-white">
                {COLUMNS.map((c, i) => (
                  <th
                    key={c.key}
                    aria-sort={
                      !c.sortable
                        ? undefined
                        : sort?.col === c.key
                          ? sort.dir === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                    }
                    className={`py-3.5 px-3 text-sm font-semibold ${
                      c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'
                    } ${i === 0 ? 'rounded-l-xl' : ''} ${i === COLUMNS.length - 1 ? 'rounded-r-xl' : ''}`}
                  >
                    {c.sortable ? (
                      <button
                        type="button"
                        onClick={() => onSort(c.key)}
                        className="inline-flex items-center gap-1 hover:opacity-90"
                        aria-label={`Sort by ${c.label}`}
                      >
                        {c.label}
                        {sort?.col === c.key ? (
                          sort.dir === 'asc' ? (
                            <ChevronUp size={14} aria-hidden="true" />
                          ) : (
                            <ChevronDown size={14} aria-hidden="true" />
                          )
                        ) : (
                          <ChevronsUpDown size={14} className="opacity-80" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.u.key + i}
                  onClick={() => {
                    setSelectedRow(r);
                    setProductModalMode('view');
                  }}
                  className={`border-b border-gray-100 cursor-pointer hover:bg-[#e9e9e9] ${i % 2 === 1 ? 'bg-[#faf9f7]' : ''}`}
                >
                  {COLUMNS.map((c) => (
                    <td
                      key={c.key}
                      className={`py-2.5 px-3 align-top ${
                        c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'
                      }`}
                      onClick={c.key === 'actions' ? (e) => e.stopPropagation() : undefined}
                    >
                      {renderCell(c.key, r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProductDetailModal
        isOpen={!!selectedRow}
        mode={productModalMode}
        row={
          selectedRow
            ? ({
                product: selectedRow.product,
                hardware: selectedRow.hardware,
                defaultUnitName: `Licensed Unit ${selectedRow.unitNo}`,
                entitlementKey: selectedRow.u.key,
                status: selectedRow.u.status,
                validFrom: selectedRow.u.validFrom ? fmtDate(selectedRow.u.validFrom) : '',
                validThrough: selectedRow.u.validThrough ? fmtDate(selectedRow.u.validThrough) : '',
                usage: usageText(selectedRow.u, selectedRow.kind),
                pct: pctText(selectedRow.u, selectedRow.kind),
              } as ProductDetailRow)
            : null
        }
        unitName={selectedRow ? unitNameFor(selectedRow) : ''}
        educatorIds={selectedRow ? notes[selectedRow.u.key]?.educatorIds ?? [] : []}
        educatorOptions={educatorOptions}
        onClose={() => setSelectedRow(null)}
        onEdit={() => setProductModalMode('edit')}
        onSave={handleSaveProduct}
        onEducatorsChange={(ids) =>
          selectedRow && persistNote(selectedRow.u.key, { educatorIds: ids })
        }
      />
    </div>
  );
}
