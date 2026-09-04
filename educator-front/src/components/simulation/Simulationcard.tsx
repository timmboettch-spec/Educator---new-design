import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Heart } from "lucide-react";
import loginEn from "../../locales/auth/login/en.json";
import loginEs from "../../locales/auth/login/es.json";
import Button from "../../components/simulation/cardbutton";
import type { Simulation } from "../../types/simulation.types";
import { isAISimulation } from "@/utils/simulationType";

interface SimulationCardProps {
  simulation: Simulation;
  onAssignClass: (id: string) => void;
  onRemoveFromLibrary: (id: string) => void;
  onMoreInfo: (id: string) => void;
  /** Bulk-select support: when provided, a selection checkbox is shown. */
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

const SimulationCard: React.FC<SimulationCardProps> = ({
  simulation,
  onAssignClass,
  onRemoveFromLibrary,
  onMoreInfo,
  selected = false,
  onToggleSelect,
}) => {
  const {
    id,
    title,
    image,
    fromBundle,
    avatarEnabled,
    simulation_id,
    scenario_rio_id,
  } = simulation;
  // Use the correct simulation identifier for navigation
  const correctSimulationId = simulation_id ?? scenario_rio_id ?? id;
  const t = (
    localStorage.getItem("app_language")?.toLowerCase() === "es"
      ? loginEs
      : loginEn
  ).simulationCard;
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Standardized plain chips (catalog style): Learner Level · Modality ·
  // Difficulty · Duration — overlaid on the tile image (white chips), so they
  // read the same as the Simulation Catalog tiles (`AllSimItems`).
  const chipClass =
    "bg-white/90 text-gray-700 text-xs sm:text-sm font-semibold px-2.5 py-1 rounded-full whitespace-nowrap";
  const modalityLabel = avatarEnabled ? "Avatar" : "Workstation";
  const audienceHay =
    `${simulation.learnerLevel ?? ""} ${simulation.targetAudience ?? ""}`.toLowerCase();
  const learnerLevelLabel = /post[-\s]?secondary/.test(audienceHay)
    ? "Post-Secondary"
    : /secondary|high school/.test(audienceHay)
      ? "Secondary"
      : simulation.learnerLevel || simulation.targetAudience || "";
  const [imageError, setImageError] = useState(false);

  /** Determine if this is an AI simulation. Source of truth: avatarEnabled flag only */
  const isAI = isAISimulation(avatarEnabled);

  const hasValidImage = Boolean(image?.trim()) && !imageError;

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col">
      <div className="relative aspect-[3/2] overflow-hidden bg-slate-100">
        {hasValidImage ? (
          <>
            {/* Blurred backdrop — extends the image's own colors into the letterbox area */}
            <img
              src={image}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover scale-110 blur-lg"
              onError={() => setImageError(true)}
            />
            {/* Foreground — full image, never cropped */}
            <img
              src={image}
              alt={title}
              className="absolute inset-0 w-full h-full object-contain"
              onError={() => setImageError(true)}
            />
          </>
        ) : isAI ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 gap-2">
            <img
              src="/assets/RealityworksAI_logo.svg"
              alt="AI Simulation"
              className="w-10 h-10 object-contain opacity-70"
            />
            <span className="text-xs font-semibold text-primary-500">
              AI Simulation
            </span>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <img
              src="/assets/RealityworksAI_logo.svg"
              alt="Realityworks"
              className="w-12 h-12 object-contain opacity-40"
            />
          </div>
        )}
        {/* Legibility scrim so the overlaid chips + title read over any image. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

        {/* Chips — top-left, over the tile. Row 1: learner level + modality.
            Row 2: difficulty + duration on the same line (duration just right of
            difficulty). Matches the catalog tiles. */}
        <div className="absolute top-2 left-2 z-10 flex items-start gap-2 max-w-[calc(100%-2.75rem)]">
          {onToggleSelect && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(id);
              }}
              aria-pressed={selected}
              aria-label={
                selected ? "Deselect simulation" : "Select simulation"
              }
              className={`w-6 h-6 flex-shrink-0 rounded-md flex items-center justify-center border-2 shadow transition-colors ${
                selected
                  ? "bg-primary-500 border-primary-500 text-white"
                  : "bg-white/90 border-white text-transparent hover:border-primary-300"
              }`}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
            </button>
          )}
          <div className="flex flex-col items-start gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {learnerLevelLabel && (
                <span className={chipClass}>{learnerLevelLabel}</span>
              )}
              <span className={chipClass}>{modalityLabel}</span>
            </div>
            {(simulation.difficulty || simulation.duration) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {simulation.difficulty && (
                  <span className={chipClass}>{simulation.difficulty}</span>
                )}
                {simulation.duration && (
                  <span className={chipClass}>{simulation.duration}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {isAI && (
          <span className="absolute top-11 right-2 z-10 bg-primary-500 text-white text-[10px] font-semibold px-2.5 py-1 rounded-full shadow">
            AI Seats Required
          </span>
        )}

        {/* Heart icon — filled because this sim is already in the library.
            Clicking opens a confirmation before removing. */}
        {!fromBundle && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirmRemove(true);
            }}
            className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-white text-primary-500 shadow z-10 hover:bg-[#e9e9e9] transition-colors"
            title="Remove from My Library"
            aria-label="Remove from My Library"
          >
            <Heart size={13} fill="currentColor" strokeWidth={2} />
          </button>
        )}
        {fromBundle && (
          <span
            role="img"
            aria-label="Part of your bundle — cannot be removed"
            className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-white text-primary-300 shadow z-10 cursor-default"
            title="Part of your bundle — cannot be removed"
          >
            <Heart size={13} fill="currentColor" strokeWidth={2} aria-hidden="true" />
          </span>
        )}

        {/* Simulation name — bottom of the tile, over the image (catalog style). */}
        <div className="absolute bottom-0 left-0 right-0 p-3 z-10">
          <p className="text-white text-lg sm:text-xl font-bold leading-snug break-words line-clamp-3">
            {title}
          </p>
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <div className="w-full mt-auto">
          {simulation.productName?.trim() && (
            <p className="text-sm text-slate-600 mb-2">
              <span className="font-semibold text-slate-700">
                Associated Product Name:{" "}
              </span>
              {simulation.productName.trim()}
            </p>
          )}
          <div className="flex gap-2 w-full">
            <Button
              label={t.assignToClass}
              variant="primary"
              className="flex-1"
              onClick={() => onAssignClass(id)}
            />
            <Button
              label={t.moreInfo}
              variant="neutral"
              className="flex-1"
              onClick={() => onMoreInfo(correctSimulationId)}
            />
          </div>
        </div>
      </div>

      {/* Confirmation dialog — rendered via portal at body level so the card's
          CSS transform does not trap the fixed overlay inside the card. */}
      {confirmRemove &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setConfirmRemove(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setConfirmRemove(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={`remove-lib-title-${id}`}
              className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <Heart
                    size={16}
                    className="text-primary-500"
                    fill="currentColor"
                    aria-hidden="true"
                  />
                </div>
                <h3
                  id={`remove-lib-title-${id}`}
                  className="font-semibold text-gray-900 text-sm leading-snug"
                >
                  Remove from My Library?
                </h3>
              </div>
              <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                Are you sure you want to remove{" "}
                <span className="font-medium text-gray-700">
                  &ldquo;{title}&rdquo;
                </span>{" "}
                from your library? You can add it back from the Simulation
                Catalog at any time.
              </p>
              <div className="flex gap-3">
                <button
                  autoFocus
                  onClick={() => setConfirmRemove(false)}
                  className="flex-1 px-4 py-2 rounded-full border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setConfirmRemove(false);
                    onRemoveFromLibrary(id);
                  }}
                  className="flex-1 px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default SimulationCard;
