import { useState } from "react";
import { Cpu, ChevronDown, ChevronUp } from "lucide-react";
import SeatConsumptionByClass from "./SeatConsumptionByClass";
import { getParsedUser } from "../../utils/storage";
import type { Subscription } from "../../types";

interface Props {
  subscriptions?: Subscription[];
  viewerName?: string;
  viewerEmail?: string;
  viewerSchool?: string;
  copy?: {
    header?: string;
    statusActive?: string;
    statusNotAssigned?: string;
    seatLabel?: string;
    itemSingular?: string;
    itemPlural?: string;
    productLabel?: string;
    viewMore?: string;
    viewLess?: string;
    moreSuffix?: string;
    manageSeats?: string;
  };
}

interface UsageRow {
  id: string;
  name: string;
  term: string;
  students: number;
}

function parseLeadingQuantity(value: string): { quantity: number; cleanName: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+)\s+(.+)$/);
  if (!match) {
    return { quantity: 1, cleanName: trimmed };
  }
  return {
    quantity: Number(match[1]) || 1,
    cleanName: match[2].trim(),
  };
}

function parseDeviceEntry(deviceEntry: unknown): { quantity: number; productLabel: string } {
  if (typeof deviceEntry !== "string") {
    return { quantity: 1, productLabel: "" };
  }
  const parsed = parseLeadingQuantity(deviceEntry);
  return { quantity: parsed.quantity, productLabel: parsed.cleanName };
}

function getHardwareQuantityForProduct(sub: Subscription, productName: string): number {
  const devices = Array.isArray(sub.devices_registered) ? sub.devices_registered : [];
  const normalizedProduct = productName.toLowerCase().trim();

  let matched = 0;
  devices.forEach((entry) => {
    const parsed = parseDeviceEntry(entry);
    const normalizedLabel = parsed.productLabel.toLowerCase();
    if (
      normalizedLabel &&
      (normalizedLabel.includes(normalizedProduct) || normalizedProduct.includes(normalizedLabel))
    ) {
      matched += parsed.quantity;
    }
  });

  if (matched > 0) {
    return matched;
  }

  return parseLeadingQuantity(productName).quantity;
}

function getAssignedUsageRows(sub: Subscription, productName: string, productIndex: number): UsageRow[] {
  const src = sub as unknown as Record<string, unknown>;
  const rows = src.hardware_assignment_rows ?? src.assignment_rows ?? src.product_assignment_rows;
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row, rowIndex) => {
      if (!row || typeof row !== "object") {
        return null;
      }
      const r = row as Record<string, unknown>;
      const rowProductName = typeof r.product_name === "string" ? r.product_name : null;
      const rowProductIndex = typeof r.product_index === "number" ? r.product_index : null;
      if (rowProductName && rowProductName !== productName) {
        return null;
      }
      if (rowProductIndex != null && rowProductIndex !== productIndex) {
        return null;
      }

      const name =
        (typeof r.school_name === "string" && r.school_name) ||
        (typeof r.class_name === "string" && r.class_name) ||
        (typeof r.name === "string" && r.name) ||
        "";
      if (!name) {
        return null;
      }

      const term =
        (typeof r.term === "string" && r.term) ||
        (typeof r.educator_name === "string" && r.educator_name) ||
        (typeof r.school_name === "string" && r.school_name) ||
        "-";
      const students =
        (typeof r.educator_count === "number" && Number.isFinite(r.educator_count) && r.educator_count) ||
        (typeof r.count === "number" && Number.isFinite(r.count) && r.count) ||
        0;

      return {
        id: `${productIndex}-${rowIndex}`,
        name,
        term,
        students,
      };
    })
    .filter((row): row is UsageRow => row !== null);
}

function isSubActive(sub: Subscription): boolean {
  if (!sub.end) return true;
  return new Date(sub.end) > new Date();
}

function getHardwareFromSubscriptions(subscriptions: Subscription[]) {
  const products: Array<{
    id: string;
    productName: string;
    netsuiteId: string;
    redeemCode: string;
    devices: string[];
    supportUntil?: string;
    aiEnabled?: string;
    usageRows: UsageRow[];
  }> = [];

  subscriptions.forEach((sub, subIndex) => {
    // Only include hardware from active subscriptions.
    if (!isSubActive(sub)) {
      return;
    }

    const names = sub.product_name ?? [];
    names.forEach((name, index) => {
      const platform = sub.platform?.[index] ?? "";
      if (/manikin|device|hardware/i.test(name) || /device/i.test(platform)) {
        const usageRows = getAssignedUsageRows(sub, name, index);
        const parsedName = parseLeadingQuantity(name);
        const quantity = getHardwareQuantityForProduct(sub, parsedName.cleanName || name);

        for (let unit = 0; unit < quantity; unit += 1) {
          products.push({
            id: `${subIndex}-${index}-${unit}`,
            productName: parsedName.cleanName || name,
            netsuiteId: (sub.netsuite_id as string | undefined) ?? "N/A",
            redeemCode: (sub.redeem_code as string | undefined) ?? "N/A",
            devices: (sub.devices_registered as string[] | undefined) ?? [],
            supportUntil: sub.hw_support_until as string | undefined,
            aiEnabled: (sub.ai as boolean[] | undefined)?.[index] !== undefined
              ? String((sub.ai as boolean[] | undefined)?.[index])
              : undefined,
            usageRows,
          });
        }
      }
    });
  });

  return products;
}

const HARDWARE_VISIBLE_DEFAULT = 3;

export default function Hardware({
  subscriptions = [],
  viewerName: _viewerName,
  viewerEmail: _viewerEmail,
  viewerSchool: _viewerSchool,
  copy,
}: Props) {
  const user = getParsedUser();
  const role = (
    typeof user?.role === "string"
      ? user.role
      : ((user?.role as Record<string, unknown>)?.role_name as string)
  )?.toLowerCase();
  const isAdmin = role !== "educator";
  const hardwareProducts = getHardwareFromSubscriptions(subscriptions);
  const [showAll, setShowAll] = useState(false);
  const localizedCopy = {
    header: copy?.header ?? 'Hardware',
    statusActive: copy?.statusActive ?? 'Active',
    statusNotAssigned: copy?.statusNotAssigned ?? 'Not Assigned',
    seatLabel: copy?.seatLabel ?? 'Classes',
    itemSingular: copy?.itemSingular ?? 'item',
    itemPlural: copy?.itemPlural ?? 'items',
    productLabel: copy?.productLabel ?? 'PRODUCT',
    viewMore: copy?.viewMore ?? 'View More',
    viewLess: copy?.viewLess ?? 'View Less',
    moreSuffix: copy?.moreSuffix ?? 'more',
    manageSeats: copy?.manageSeats ?? 'Manage Seats',
  };

  if (hardwareProducts.length === 0) {
    return null;
  }

  const visibleProducts = showAll ? hardwareProducts : hardwareProducts.slice(0, HARDWARE_VISIBLE_DEFAULT);
  const hasMore = hardwareProducts.length > HARDWARE_VISIBLE_DEFAULT;

  return (
    <>
      {/* Needs Attention Header */}
      <div className="flex items-center gap-2 mt-8 mb-4">
        <Cpu size={18} className="text-primary-500" />
        <h2 className="text-lg font-bold text-slate-900">{localizedCopy.header}</h2>
        <span className="bg-primary-100 text-primary-600 text-[10px] font-medium px-2 py-0.5 rounded-full">
          {hardwareProducts.length}{' '}
          {hardwareProducts.length === 1
            ? localizedCopy.itemSingular
            : localizedCopy.itemPlural}
        </span>
      </div>

      {visibleProducts.map((hardware) => {
        const usageRows = hardware.usageRows;
        const isAssigned = usageRows.length > 0;

        return (
          <div
            key={hardware.id}
            className="rounded-2xl border border-primary-100 bg-white p-5 shadow-sm mb-3"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex gap-3 min-w-0 flex-1">
                <div className="h-12 w-12 flex-shrink-0 rounded bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                  IMG
                </div>

                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900 truncate">
                    {hardware.productName}
                  </h3>

                  <p className="mt-1 text-[11px] text-slate-500 truncate">
                    {localizedCopy.productLabel} {hardware.netsuiteId}
                  </p>
                </div>
              </div>

              <span
                className={`flex-shrink-0 px-2 py-1 rounded-full text-[10px] whitespace-nowrap ${
                  isAssigned
                    ? "bg-green-100 text-green-600"
                    : "bg-primary-100 text-primary-600"
                }`}
              >
                {isAssigned ? localizedCopy.statusActive : localizedCopy.statusNotAssigned}
              </span>
            </div>

            <SeatConsumptionByClass
              isAdmin={isAdmin}
              usageRows={usageRows}
              seatLabel={localizedCopy.seatLabel}
              manageSeatsLabel={localizedCopy.manageSeats}
            />
          </div>
        );
      })}

      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll((prev) => !prev)}
          className="mt-2 w-full flex items-center justify-center gap-1.5 text-[13px] font-medium text-primary-600 transition-colors py-2 rounded-xl border border-primary-100 bg-white"
        >
          {showAll ? (
            <><ChevronUp size={14} /> {localizedCopy.viewLess}</>
          ) : (
            <>
              <ChevronDown size={14} /> {localizedCopy.viewMore} ({hardwareProducts.length - HARDWARE_VISIBLE_DEFAULT} {localizedCopy.moreSuffix})
            </>
          )}
        </button>
      )}
    </>
  );
}
