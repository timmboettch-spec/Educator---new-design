import { useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  Monitor,
  Users,
  Zap,
} from "lucide-react";
import type { Subscription } from "../../types";

interface ProductCardProps {
  productName: string;
  productIndex: number;
  subscription: Subscription;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function isAISeatsProduct(name: string) {
  return /seat/i.test(name) || /ai simulation seat/i.test(name);
}

function isHardwareProduct(name: string) {
  return /manikin|device|hardware/i.test(name);
}

function isBundleProduct(name: string) {
  return /bundle/i.test(name);
}

function getProductIcon(name: string) {
  if (isHardwareProduct(name))
    return <Cpu size={20} className="text-slate-500" />;
  if (isBundleProduct(name))
    return <Layers size={20} className="text-primary-500" />;
  return <Monitor size={20} className="text-blue-500" />;
}

function getProductAccent(name: string): {
  border: string;
  badge: string;
  badgeText: string;
  tagBg: string;
  tagText: string;
  iconBg: string;
} {
  if (isHardwareProduct(name))
    return {
      border: "border-slate-200",
      badge: "bg-slate-100 text-slate-600",
      badgeText: "Hardware",
      tagBg: "bg-slate-100",
      tagText: "text-slate-600",
      iconBg: "bg-slate-100",
    };
  if (isBundleProduct(name))
    return {
      border: "border-primary-100",
      badge: "bg-primary-100 text-primary-600",
      badgeText: "Simulation Bundle",
      tagBg: "bg-primary-50",
      tagText: "text-primary-600",
      iconBg: "bg-primary-100",
    };
  return {
    border: "border-blue-100",
    badge: "bg-blue-100 text-blue-600",
    badgeText: "AI Seats",
    tagBg: "bg-blue-50",
    tagText: "text-blue-600",
    iconBg: "bg-blue-100",
  };
}

export default function ProductCard({
  productName,
  productIndex,
  subscription,
}: ProductCardProps) {
  const [expanded, setExpanded] = useState(false);

  const accent = getProductAccent(productName);
  const aiRaw = (subscription.ai as boolean[] | undefined)?.[productIndex];
  const aiValue: string = aiRaw === true ? "Yes" : aiRaw === false ? "No" : "—";
  const platformValue = subscription.platform?.[productIndex] ?? "—";

  const showSeats = isAISeatsProduct(productName);
  const showHardware = isHardwareProduct(productName);

  const totalSeats = subscription.ai_seats ?? 0;
  const availableSeats = subscription.seats_available ?? 0;
  const usedSeats = totalSeats - availableSeats;
  const usedPct = totalSeats > 0 ? Math.round((usedSeats / totalSeats) * 100) : 0;

  return (
    <div
      className={`rounded-2xl border ${accent.border} bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] overflow-hidden`}
    >
      {/* Card Header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`h-10 w-10 rounded-xl ${accent.iconBg} flex items-center justify-center flex-shrink-0`}
            >
              {getProductIcon(productName)}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 leading-snug">
                {productName}
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${accent.badge}`}
                >
                  {accent.badgeText}
                </span>
                {aiValue === "Yes" && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    <Zap size={9} />
                    AI Enabled
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Expand toggle */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
            aria-label={expanded ? "Collapse details" : "Expand details"}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {/* Quick info row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <InfoPill
            icon={<Calendar size={11} />}
            label="Start Date"
            value={formatDate(subscription.start as string | undefined)}
          />
          <InfoPill
            icon={<Calendar size={11} />}
            label="End Date"
            value={formatDate(subscription.end)}
          />
          <InfoPill
            icon={<Monitor size={11} />}
            label="Platform"
            value={platformValue}
          />
          <InfoPill
            icon={<Zap size={11} />}
            label="AI"
            value={aiValue}
            highlight={aiValue === "Yes"}
          />
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-5">
          {/* Identifiers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DetailRow label="Redeem Code" value={subscription.redeem_code ?? "—"} mono />
            <DetailRow label="NetSuite ID" value={subscription.netsuite_id ?? "—"} mono />
          </div>

          {/* AI Seats Section */}
          {showSeats && totalSeats > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Seat Allocation
              </p>
              <div className="grid grid-cols-3 gap-3">
                <StatBox
                  value={totalSeats}
                  label="Total Seats"
                  color="bg-blue-50 text-blue-700"
                  labelColor="text-blue-600"
                />
                <StatBox
                  value={usedSeats}
                  label="Used Seats"
                  color="bg-primary-50 text-primary-700"
                  labelColor="text-primary-600"
                />
                <StatBox
                  value={availableSeats}
                  label="Available Seats"
                  color="bg-green-50 text-green-700"
                  labelColor="text-green-600"
                />
              </div>

              {/* Progress bar */}
              <div className="mt-3">
                <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                  <span>{usedPct}% utilized</span>
                  <span>
                    {usedSeats} / {totalSeats} used
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-400 rounded-full transition-all"
                    style={{ width: `${usedPct}%` }}
                  />
                </div>
              </div>

              {/* AI Simulation Groups */}
              {((subscription.ai_simulation_groups as string[] | undefined) ?? []).length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    AI Simulation Groups
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(subscription.ai_simulation_groups as string[]).map((group) => (
                      <span
                        key={group}
                        className={`text-[11px] font-medium px-2.5 py-1 rounded-lg ${accent.tagBg} ${accent.tagText}`}
                      >
                        {group.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Hardware Section */}
          {showHardware && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Hardware Details
              </p>
              <div className="space-y-2">
                {(subscription.devices_registered ?? []).length > 0 ? (
                  (subscription.devices_registered ?? []).map((device, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-4 py-3"
                    >
                      <Cpu size={14} className="text-slate-400 flex-shrink-0" />
                      <span className="text-sm text-slate-700">{device}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">No devices registered.</p>
                )}
              </div>

              {subscription.hw_support_until && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                  <Calendar size={13} className="text-amber-500 flex-shrink-0" />
                  <div>
                    <span className="text-xs text-amber-600 font-medium">
                      Hardware Support Until:{" "}
                    </span>
                    <span className="text-xs text-amber-700 font-bold">
                      {formatDate(subscription.hw_support_until)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bundle section — no extra data besides dates, platform, ai */}
          {isBundleProduct(productName) &&
            !showSeats &&
            !showHardware && (
              <div className="flex items-center gap-2 rounded-xl bg-primary-50 px-4 py-3">
                <Users size={13} className="text-primary-500 flex-shrink-0" />
                <span className="text-xs text-primary-600">
                  Simulation Bundle — access granted for the subscription period.
                </span>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────── */

function InfoPill({
  icon,
  label,
  value,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5">
        {icon}
        {label}
      </div>
      <p
        className={`text-[12px] font-semibold truncate ${
          highlight ? "text-green-600" : "text-slate-700"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">
        {label}
      </p>
      <p
        className={`text-sm font-semibold text-slate-800 break-all ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function StatBox({
  value,
  label,
  color,
  labelColor,
}: {
  value: number;
  label: string;
  color: string;
  labelColor: string;
}) {
  return (
    <div className={`rounded-xl px-4 py-3 ${color}`}>
      <p className="text-xl font-bold">{value}</p>
      <p className={`text-[11px] mt-0.5 ${labelColor}`}>{label}</p>
    </div>
  );
}
