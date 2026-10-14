'use client';

import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '../../../lib/utils';
import loginEn from '../../../locales/auth/login/en.json';
import loginEs from '../../../locales/auth/login/es.json';

import { getCategoryMeta, getDefaultCategoryStyle } from '../constants';
import MedicationTranscriptCard from '../MedicationTranscriptCard';
import {
  formatWallClock,
  formatDurationLabel,
  formatElapsedLabel,
  formatActionType,
  cleanDetails,
  getVitalValue,
} from '../utils';

import type { SummaryEntry } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Language / translation helper (mirrors MedicationTranscriptCard)
// ─────────────────────────────────────────────────────────────────────────────
function useAppLanguage(): 'en' | 'es' {
  const [language, setLanguage] = useState<'en' | 'es'>(() => {
    if (typeof window === 'undefined') return 'en';
    const stored = window.localStorage.getItem('app_language');
    return stored === 'es' ? 'es' : 'en';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      const stored = window.localStorage.getItem('app_language');
      setLanguage(stored === 'es' ? 'es' : 'en');
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);
  return language;
}

interface SummaryEntryItemProps {
  entry: SummaryEntry;
  index: number;
}

/**
 * Get status badge for order/medication/action entries
 */
function getStatusBadge(
  entry: SummaryEntry,
  isOrder: boolean,
  isMedication: boolean,
  isAction: boolean
): React.ReactNode {
  if (!(isOrder || isMedication || isAction) || !entry.details) {
    return null;
  }

  const d = entry.details;

  if (
    d.includes('Status: Not Given') ||
    d.startsWith('[Not Given]') ||
    d.startsWith('[Hold]')
  ) {
    return (
      <span className="inline-flex items-center text-[11px] font-black text-amber-800 tracking-wider uppercase">
        Not Given
      </span>
    );
  }

  if (
    d.includes('Status: Refused') ||
    d.startsWith('[Refused]') ||
    d.startsWith('[Refuse]')
  ) {
    return (
      <span className="inline-flex items-center text-[11px] font-black text-rose-800 tracking-wider uppercase">
        Refused
      </span>
    );
  }

  if (d.includes('Status: Missed') || d.startsWith('[Missed]')) {
    return (
      <span className="inline-flex items-center text-[11px] font-black text-orange-800 tracking-wider uppercase">
        Missed
      </span>
    );
  }

  if (d.includes('Status: Inappropriate') || d.startsWith('[Inappropriate]')) {
    return (
      <span className="inline-flex items-center text-[11px] font-black text-rose-800 tracking-wider uppercase">
        Inappropriate
      </span>
    );
  }

  if (isMedication && (d.includes('Status: Held') || d.startsWith('[Held]'))) {
    return (
      <span className="inline-flex items-center text-[11px] font-black text-amber-800 tracking-wider uppercase">
        Held
      </span>
    );
  }

  if (
    isMedication &&
    (d.includes('Status: Administered') || d.startsWith('[Administered]'))
  ) {
    return (
      <span className="inline-flex items-center text-[11px] font-black text-emerald-800 tracking-wider uppercase">
        Administered
      </span>
    );
  }

  return null;
}

export default function SummaryEntryItem({
  entry,
  index,
}: SummaryEntryItemProps) {
  const language = useAppLanguage();
  const tL = language === 'es' ? loginEs.studentReport : loginEn.studentReport;
  const category = entry.category?.toLowerCase();
  const isVital = category === 'vitals';
  const isAction =
    category === 'actions' || category === 'action' || category === 'clinical';
  const isOrder = category === 'orders';
  const isMedication = category === 'medications';
  const isTeamComm = entry.title === 'Team Communication';

  // ── Common-action entry detection ──────────────────────────────────────────
  // Some backends persist common-action entries as regular summary items with
  // the *subcategory* (e.g. "Prevención de Infecciones" / "Privacidad y
  // Pudor" / "Seguridad Ambiental") in `entry.category` and a short type in
  // `entry.type`. HS-online renders these with a "Common Actions" badge and
  // the subcategory as the small type label. Match that here.
  const typeKey = entry.type?.toLowerCase().trim() ?? '';
  const catKey = entry.category?.toLowerCase().trim() ?? '';
  const COMMON_ACTION_TYPE_KEYS = new Set([
    'infection',
    'infección',
    'infeccion',
    'privacy',
    'privacidad',
    'environmental',
    'ambiental',
  ]);
  const COMMON_ACTION_CATEGORY_KEYS = new Set([
    'infection prevention',
    'prevencion de infecciones',
    'prevención de infecciones',
    'privacy & modesty',
    'privacy and modesty',
    'privacidad y pudor',
    'environmental safety',
    'seguridad ambiental',
  ]);
  const isCommonAction =
    COMMON_ACTION_TYPE_KEYS.has(typeKey) ||
    COMMON_ACTION_CATEGORY_KEYS.has(catKey) ||
    // Broader substring safety net (data variants across backends):
    // e.g. "Infecciones", "Prevención", "privacidad", "ambiental"
    /infecc|prevenc|privac|ambien|environment|infection|privacy/.test(catKey) ||
    /infecc|prevenc|privac|ambien|environment|infection|privacy/.test(typeKey);

  const displayCategoryBadge = isCommonAction
    ? tL.filterOptions.commonActions
    : (entry.category ?? 'summary');

  const commonActionTypeLabel = (() => {
    if (
      typeKey === 'infection' ||
      typeKey === 'infección' ||
      typeKey === 'infeccion' ||
      /infecc|infection/.test(typeKey) ||
      /infecc|infection|prevenc/.test(catKey)
    )
      return tL.actionTypes.infectionPrevention;
    if (
      typeKey === 'privacy' ||
      typeKey === 'privacidad' ||
      /privac/.test(typeKey) ||
      /privac/.test(catKey)
    )
      return tL.actionTypes.privacyModesty;
    if (
      typeKey === 'environmental' ||
      typeKey === 'ambiental' ||
      /environment|ambien/.test(typeKey) ||
      /environment|ambien/.test(catKey)
    )
      return tL.actionTypes.environmentalSafety;
    // Fallback: use the raw category (e.g. "Prevención de Infecciones")
    return entry.category ?? formatActionType(entry.type ?? '');
  })();

  // Check if this is a vital-type action with vitals field
  const entryData = entry as SummaryEntry & {
    vitals?: Record<string, unknown[]>;
  };
  const hasVitalsData =
    entryData.vitals && typeof entryData.vitals === 'object';
  const vitalsList = hasVitalsData ? entryData.vitals : null;

  // Get vital value for display
  const vitalValue = isVital ? getVitalValue(entry.title, entry.details) : null;

  // Get category styling
  const categoryMetaMap = getCategoryMeta();
  const meta = isTeamComm
    ? categoryMetaMap.team_communication
    : categoryMetaMap[category] || getDefaultCategoryStyle(entry.category);

  const categoryColors = {
    bg: meta.bg,
    border: meta.border,
    text: meta.color,
    badge: meta.badge,
    label: meta.label,
    icon: meta.icon,
  };

  const statusBadge = getStatusBadge(entry, isOrder, isMedication, isAction);

  // Clinical prompt fallback for Vital Signs entries
  const isVitalSignsEntry =
    isVital ||
    hasVitalsData ||
    category === 'vitals' ||
    entry.type === 'vital-signs' ||
    entry.title?.toLowerCase().includes('vital sign');

  const clinicalPromptText =
    entry.question ||
    (isVitalSignsEntry
      ? language === 'es'
        ? 'Haga clic para revelar las mediciones de los signos vitales, los resultados se mostrarán después de aproximadamente 10 segundos.'
        : 'Click to reveal vital sign measurements, results will be shown after approximately 10 seconds.'
      : null);

  return (
    <motion.div
      key={entry.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      className="flex flex-col gap-2 break-inside-avoid"
    >
      <div className="w-full">
        <div className="p-4 bg-white rounded-xl">
          {/* Embedded source label + wall-clock timestamps */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
            {/* Run-Time Clock — Left-most element in #5f6060 */}
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5f6060] leading-none">
              <Clock className="w-3.5 h-3.5 shrink-0 text-[#5f6060]" />
              <span className="leading-none">
                {entry.elapsedTime ?? '00:00'}
              </span>
            </div>

            {/* Category Badge — No square brackets */}
            <span
              className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-[0.05em] leading-none ${categoryColors.badge}`}
            >
              {categoryColors.icon}
              {displayCategoryBadge}
            </span>
            {/* Standard Summary Start/End Labels */}
            {!entry.sbarQualitativeResult &&
              (entryStartLabel || entryEndLabel) && (
                <span className="text-[10px] text-black-400 font-medium">
                  {entryStartLabel && <>Started: {entryStartLabel}</>}
                  {entryEndLabel && <> | Ended: {entryEndLabel}</>}
                  {entry.duration && (
                    <> | Duration: {formatDurationLabel(entry.duration)}</>
                  )}
                </span>
              )}
            {/* SBAR Unified Event Start/End Labels */}
            {entry.sbarQualitativeResult &&
              (entry.sbarStartMs ?? entry.sbarSubmitMs) && (
                <span className="text-[10px] text-black-400 font-medium">
                  {entry.sbarStartMs && (
                    <>Started: {formatWallClock(entry.sbarStartMs)}</>
                  )}
                  {entry.sbarSubmitMs && (
                    <> | Ended: {formatWallClock(entry.sbarSubmitMs)}</>
                  )}
                  {entry.sbarStartMs && entry.sbarSubmitMs && (
                    <>
                      {' '}
                      | Duration:{' '}
                      {formatElapsedLabel(
                        (entry.sbarSubmitMs - entry.sbarStartMs) / 1000
                      )}
                    </>
                  )}
                </span>
              )}
          </div>

          <div className="flex flex-col gap-3">
            {entry.sbarQualitativeResult ? (
              /* SBAR/Team Communication Entry */
              <div className="flex flex-col gap-4 text-[15px] font-medium leading-relaxed mt-2">
                <h3 className="text-[20px] font-bold text-[#111827] leading-snug">
                  {entry.title}
                </h3>
                {/* Prompt */}
                <div className="ml-4 p-2 bg-[#e9e9e9] border border-[#5f6060] rounded-lg">
                  <p className="text-xs font-bold text-[#5f6060] uppercase tracking-wider mb-2">
                    PROMPT:
                  </p>
                  <p className="text-[#5f6060]">{entry.sbarPrompt}</p>
                </div>
                {/* Submission */}
                <div className="ml-4 p-2 bg-[#e9e9e9] border border-[#5f6060] rounded-lg">
                  <p className="text-xs font-bold text-[#5f6060] uppercase tracking-wider mb-2">
                    STUDENT SBAR SUBMISSION:
                  </p>
                  <p className="text-[#5f6060] whitespace-pre-wrap">
                    {entry.sbarSubmission}
                  </p>
                </div>
                {/* Result */}
                <div className="flex items-center gap-3 ml-4">
                  <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">
                    Result:
                  </p>
                  <span
                    className={cn(
                      'px-3 py-1 rounded-full text-[13px] font-bold shadow-sm border uppercase',
                      entry.sbarQualitativeResult.toLowerCase() ===
                        'satisfactory'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    )}
                  >
                    {entry.sbarQualitativeResult}
                  </span>
                </div>
              </div>
            ) : (
              /* Standard Entry */
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-[18px] font-bold text-[#111827] leading-snug flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <span>{translateEntryTitle(entry.title)}</span>
                    {(() => {
                      const typeLabel = (() => {
                        if (
                          category === 'demographics' ||
                          category === 'history' ||
                          entry.type?.toLowerCase() === 'documentation'
                        ) {
                          return (
                            tL.detailsValues?.documentation || 'Documentation'
                          );
                        }
                        if (
                          entry.type?.toLowerCase().startsWith('vital') ||
                          (entry.title &&
                            /obtain\s+vital\s+signs/i.test(entry.title)) ||
                          entry.vitals
                        ) {
                          return 'Vital Signs';
                        }
                        if (entry.type) {
                          return isCommonAction
                            ? commonActionTypeLabel
                            : formatActionType(entry.type);
                        }
                        if (entry.question || entry.answer) {
                          if (
                            entry.type === 'ordering' ||
                            (Array.isArray(entry.answer) &&
                              entry.answer.length > 1)
                          ) {
                            return 'Sequential Question';
                          }
                          return 'Multiple Choice Question';
                        }
                        return null;
                      })();

                      if (!typeLabel) {
                        return null;
                      }
                      return (
                        <span className="text-sm font-normal text-gray-400 shrink-0">
                          ({typeLabel})
                        </span>
                      );
                    })()}
                  </h3>
                  {statusBadge}
                </div>
              </div>
            )}

            {/* Question/Prompt */}
            {!entry.sbarQualitativeResult && clinicalPromptText && (
              <div className="mt-2 ml-4 p-2 bg-[#e9e9e9] border border-[#5f6060] rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[10px] font-black text-[#5f6060] uppercase tracking-widest">
                    Clinical Prompt
                  </p>
                </div>
                <p className="text-[15px] text-[#5f6060] font-medium leading-relaxed break-words">
                  {clinicalPromptText}
                </p>
              </div>
            )}

            {/* Submitted Response */}
            {entry.answer && (
              <div className="mt-2 ml-4 p-2 bg-[#e9e9e9] border border-[#5f6060] rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[10px] font-black text-[#5f6060] uppercase tracking-widest">
                    Student Response
                  </p>
                </div>
                <div className="text-[16px] text-[#5f6060] font-medium leading-relaxed break-words">
                  {(() => {
                    if (entry.type !== 'ordering') {
                      const displayAnswer = Array.isArray(entry.answer)
                        ? entry.answer.join(', ')
                        : String(entry.answer ?? '');
                      return <p>{displayAnswer}</p>;
                    }

                    let items: string[] = [];
                    if (entry.details?.includes(' ||| ')) {
                      const match = entry.details.match(
                        /Submitted:\s*(.*?)(?=\n|$|\|\s*Started:)/i
                      );
                      if (match?.[1]) {
                        items = match[1].split(' ||| ');
                      } else {
                        const raw = entry.details
                          .split(/\|\s*Started:/i)[0]
                          .trim();
                        items = raw.split(' ||| ');
                      }
                    } else {
                      if (Array.isArray(entry.answer)) {
                        items = entry.answer as string[];
                      } else {
                        const answerStr = String(entry.answer ?? '');
                        items = answerStr.includes(' ||| ')
                          ? answerStr.split(' ||| ')
                          : [answerStr];
                      }
                    }

                    return (
                      <ol className="list-decimal pl-5 space-y-1">
                        {items.map((item: string, i: number) => (
                          <li key={i}>{item.trim()}</li>
                        ))}
                      </ol>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Notes/Observations — ml-4, no border */}
            {(entry.notes ?? entry.observations) && (
              <div className="mt-2 ml-4 p-2 italic">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                    {tL.labels.clinicalObservations}
                  </p>
                </div>
                <p className="text-[15px] text-blue-900 leading-relaxed">
                  {entry.notes ?? entry.observations}
                </p>
              </div>
            )}

            {/* Vital Value Display — ml-4 */}
            {isVital && vitalValue ? (
              <div className="w-fit ml-4">
                <span className="text-[20px] font-black text-[#111827] py-1">
                  {vitalValue}
                </span>
              </div>
            ) : (entry.category === 'demographics' ||
                entry.category === 'history') &&
              entry.details ? (
              <div className="w-full ml-4">
                <p className="text-[15px] font-semibold text-gray-800 italic leading-relaxed">
                  {entry.details}
                </p>
              </div>
            ) : null}
          </div>

          {/* Medication Card */}
          {!isVital &&
            isMedication &&
            entry.details &&
            !entry.sbarQualitativeResult && (
              <MedicationTranscriptCard entry={entry} />
            )}

          {/* General Details */}
          {!isVital &&
            entry.category !== 'demographics' &&
            entry.category !== 'history' &&
            entry.type !== 'ordering' &&
            !isMedication &&
            entry.details &&
            !hasVitalsData &&
            !entry.sbarQualitativeResult &&
            cleanDetails(entry.details, !!entry.answer) &&
            (() => {
              const detailsText = cleanDetails(entry.details, !!entry.answer);
              if (!entry.answer) {
                return true;
              }
              const norm1 = detailsText
                .replace(/\|\|\|/g, ',')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
                .join(',');
              const norm2 = entry.answer
                .replace(/\|\|\|/g, ',')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
                .join(',');
              return norm1 !== norm2 && detailsText !== entry.answer;
            })() && (
              <div className="text-[15px] text-gray-600 mt-2 font-medium leading-relaxed">
                {(() => {
                  const detailsText = cleanDetails(
                    entry.details,
                    !!entry.answer
                  );
                  if (detailsText.startsWith('Submitted: ')) {
                    const listContent = detailsText.substring(
                      'Submitted: '.length
                    );
                    const isPipeDelimited = listContent.includes(' ||| ');
                    const items = isPipeDelimited
                      ? listContent.split(' ||| ')
                      : listContent.split(',');
                    return (
                      <div>
                        <p className="font-semibold mb-2">Submitted:</p>
                        <ol className="list-decimal pl-5 space-y-1">
                          {items.map((item: string, i: number) => (
                            <li key={i}>{item.trim()}</li>
                          ))}
                        </ol>
                      </div>
                    );
                  }
                  return detailsText;
                })()}
              </div>
            )}

          {/* Vitals Data List */}
          {hasVitalsData && vitalsList && (
            <div className="mt-4 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-lg px-4 py-4">
              {cleanDetails(entry.details, !!entry.answer) && (
                <p className="text-[15px] text-gray-600 font-medium leading-relaxed mb-4 pb-3 border-b border-gray-200">
                  {cleanDetails(entry.details, !!entry.answer)}
                </p>
              )}
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                Vital Signs Obtained:
              </p>
              <div className="space-y-2">
                {(() => {
                  // Map vital IDs to display names
                  const vitalNameMap: Record<string, string> = {
                    hr: 'HR',
                    bp: 'BP',
                    rr: 'RR',
                    spo2: 'SpO2',
                    temp: 'Temp',
                  };

                  // Handle array of vital entries (each with title/details)
                  if (Array.isArray(vitalsList)) {
                    // Group by vital type for display
                    const grouped: Record<string, string[]> = {};
                    (
                      vitalsList as Array<{ title?: string; details?: string }>
                    ).forEach((vital) => {
                      const vitalTitle =
                        vital.title?.replace(' recorded', '') ?? 'Unknown';
                      const vitalValue =
                        vital.details?.replace(/^Value:\s*/i, '').trim() ?? '';
                      if (!grouped[vitalTitle]) {
                        grouped[vitalTitle] = [];
                      }
                      grouped[vitalTitle].push(vitalValue);
                    });

                    return Object.entries(grouped).map(([name, values]) => (
                      <div
                        key={name}
                        className="flex items-start gap-3 bg-gray-50/50 rounded-lg px-3 py-2"
                      >
                        <span className="text-[14px] font-bold text-gray-900 min-w-[80px]">
                          {name} x{values.length}
                        </span>
                        <span
                          className={`text-[14px] font-semibold ${categoryColors.text} flex-1`}
                        >
                          ({values.join('; ')})
                        </span>
                      </div>
                    ));
                  }

                  // Handle object map of vital ID to readings array
                  return Object.entries(vitalsList).map(
                    ([vitalId, readings]: [string, unknown]) => {
                      if (!Array.isArray(readings) || readings.length === 0) {
                        return null;
                      }

                      const displayName =
                        vitalNameMap[vitalId] ?? vitalId.toUpperCase();
                      const count = readings.length;

                      // Extract values from reading entries
                      const values = readings.map((reading: unknown) => {
                        if (typeof reading === 'string') {
                          return reading;
                        }
                        const r = reading as {
                          details?: string;
                          value?: string;
                        };
                        if (r.details) {
                          return r.details.replace(/^Value:\s*/i, '').trim();
                        }
                        if (r.value) {
                          return r.value;
                        }
                        return 'N/A';
                      });

                      return (
                        <div
                          key={vitalId}
                          className="flex items-start gap-3 bg-gray-50/50 rounded-lg px-3 py-2"
                        >
                          <span className="text-[14px] font-bold text-gray-900 min-w-[80px]">
                            {displayName} x{count}
                          </span>
                          <span
                            className={`text-[14px] font-semibold ${categoryColors.text} flex-1`}
                          >
                            ({values.join('; ')})
                          </span>
                        </div>
                      );
                    }
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
