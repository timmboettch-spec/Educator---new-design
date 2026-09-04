"use client";

import { motion } from "framer-motion";
import { Clock, CheckCircle, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";

import loginEn from "../../../locales/auth/login/en.json";
import loginEs from "../../../locales/auth/login/es.json";
import { TYPE_COLOR_MAP } from "../constants";
import { formatWallClock } from "../utils";

import type { CommonActionEntry } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Language / translation helper (mirrors SummaryEntryItem)
// ─────────────────────────────────────────────────────────────────────────────
function useAppLanguage(): "en" | "es" {
  const [language, setLanguage] = useState<"en" | "es">(() => {
    if (typeof window === "undefined") return "en";
    const stored = window.localStorage.getItem("app_language");
    return stored === "es" ? "es" : "en";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      const stored = window.localStorage.getItem("app_language");
      setLanguage(stored === "es" ? "es" : "en");
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);
  return language;
}

interface CommonActionItemProps {
  action: CommonActionEntry;
  index: number;
}

export default function CommonActionItem({
  action,
  index,
}: CommonActionItemProps) {
  const language = useAppLanguage();
  const tL =
    language === "es" ? loginEs.studentReport : loginEn.studentReport;
  const colors = TYPE_COLOR_MAP[action.type] ?? TYPE_COLOR_MAP.infection;

  // Map the short action.type ("infection" / "privacy" / "environmental")
  // to the full localised subcategory label used by HS-online.
  const actionTypeLabel = (() => {
    switch (action.type) {
      case "infection":
        return tL.actionTypes.infectionPrevention;
      case "privacy":
        return tL.actionTypes.privacyModesty;
      case "environmental":
        return tL.actionTypes.environmentalSafety;
      default:
        return action.type;
    }
  })();

  // Use real timestamps when no simulation is configured
  const caEndMs = action.timestampMs ?? null;

  // caStartMs is the start time (end - duration)
  const caStartMs =
    caEndMs && action.duration ? caEndMs - action.duration * 1000 : caEndMs;

  const caStartLabel = formatWallClock(caStartMs);
  const caEndLabel = caEndMs ? formatWallClock(caEndMs) : null;

  return (
    <motion.div
      key={`common-${action.timestampMs}-${index}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      className="flex flex-col gap-3 break-inside-avoid"
    >
      {/* Run Time Clock Badge */}
      <div className="flex items-center gap-4">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 ${colors.bg} rounded-md border ${colors.border}`}
        >
          <Clock className={`w-4 h-4 ${colors.text}`} />
          <span className={`text-sm font-semibold ${colors.text}`}>
            {action.elapsedTime ?? "00:00"}
          </span>
        </div>
      </div>

      <div className="w-full">
        <div className={`p-6 ${colors.bg} border ${colors.border} rounded-xl`}>
          {/* Embedded label + wall-clock timestamps */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
            <span
              className={`text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-[0.05em] ${colors.badge}`}
            >
              {tL.filterOptions.commonActions}
            </span>
            {caStartLabel && (
              <span className="text-[10px] text-black-400 font-medium">
                Started: {caStartLabel}
                {caEndLabel && <> | Ended: {caEndLabel}</>}
              </span>
            )}
          </div>

          {/* Title */}
          <div className="flex flex-col gap-1">
            <p className="text-[19px] font-bold text-[#111827] leading-tight">
              {action.label}
            </p>
            {action.type && (
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                {actionTypeLabel}
              </span>
            )}
          </div>

          {/* Prompt */}
          {action.question && (
            <div className="mt-4 bg-primary-50/50 p-4 rounded-xl border border-primary-100 shadow-sm transition-all hover:bg-[#e9e9e9]">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-[10px] font-black text-primary-600 uppercase tracking-widest">
                  Clinical Prompt
                </p>
              </div>
              <p className="text-[15px] text-gray-700 font-medium leading-relaxed break-words">
                {action.question}
              </p>
            </div>
          )}

          {/* Submitted Response */}
          {action.answer && (
            <div className="mt-3 bg-emerald-50/30 p-4 rounded-xl border border-emerald-100 shadow-sm transition-all hover:bg-emerald-50/50">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                  Student Response
                </p>
              </div>
              <p className="text-[16px] text-gray-900 font-medium leading-relaxed break-words">
                {action.answer}
              </p>
            </div>
          )}

          {/* Notes/Observations */}
          {(action.notes ?? action.observations) && (
            <div className="mt-3 bg-blue-50/30 p-3 rounded-lg border border-blue-100 italic">
              <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">
                Observations/Notes:
              </p>
              <p className="text-[15px] text-blue-900 break-words">
                {action.notes ?? action.observations}
              </p>
            </div>
          )}

          {/* Correctness Status */}
          {action.correct !== undefined && (
            <div className="mt-4 flex items-center gap-2">
              {action.correct ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-widest shadow-sm">
                  <CheckCircle className="w-3.5 h-3.5" /> Correct
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-rose-50 text-rose-700 border border-rose-200 uppercase tracking-widest shadow-sm">
                  <AlertCircle className="w-3.5 h-3.5" /> Incorrect
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
