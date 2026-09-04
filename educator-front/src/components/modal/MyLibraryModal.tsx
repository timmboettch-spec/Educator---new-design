import React, { useEffect } from "react";
import loginEn from "../../locales/auth/login/en.json";
import loginEs from "../../locales/auth/login/es.json";
import {
  fetchSimulationsByUnit,
  selectUnitSimLoading,
  selectUnitSimulations,
} from "../../redux/dashboard/simulationlibrary/addsimulationredux";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import type { Simulation } from "../../types/simulation.types";
import Modal from "../ui/Modal";
import { isAISimulation, getDerivedCategory } from "@/utils/simulationType";

interface MyLibraryModalProps {
  simulation: Simulation;
  onClose: () => void;
  onAssign: (id: string, category: string) => void;
}

const DIFFICULTY_STYLES: Record<string, string> = {
  Easy: "bg-green-50 text-green-600",
  Medium: "bg-amber-50 text-amber-600",
  Hard: "bg-red-50 text-red-500",
  Expert: "bg-purple-50 text-purple-600",
};

const LEVEL_STYLES: Record<string, string> = {
  Beginner: "bg-sky-50 text-sky-600",
  Intermediate: "bg-blue-50 text-blue-600",
  Advanced: "bg-indigo-50 text-indigo-600",
  Expert: "bg-purple-50 text-purple-600",
};

const MyLibraryModal: React.FC<MyLibraryModalProps> = ({
  simulation,
  onClose,
  onAssign,
}) => {
  const dispatch = useAppDispatch();
  const unitSimulations = useAppSelector(selectUnitSimulations);
  const unitSimLoading = useAppSelector(selectUnitSimLoading);

  useEffect(() => {
    if (!simulation.unit) return;
    try {
      dispatch(fetchSimulationsByUnit(simulation.unit));
    } catch {
      // Silently handle dispatch errors
    }
  }, [simulation.unit, dispatch]);

  return (
    <>
      <Modal
        isOpen={true}
        onClose={onClose}
        title="Simulation Details"
        className="max-w-2xl"
      >
        {/* Image */}
        {simulation.image?.trim() && (
          <div className="w-full h-44 rounded-xl overflow-hidden bg-slate-100 mb-4">
            <img
              src={simulation.image}
              alt={simulation.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}

        {/* Category + badges */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {getDerivedCategory(
            (simulation as unknown as Record<string, unknown>)
              .avatarEnabled as boolean | undefined,
          ) && (
              <span className="inline-block text-[11px] font-medium px-3 py-1 rounded-full bg-sky-100 text-sky-600 border border-sky-200">
                {getDerivedCategory(
                  (simulation as unknown as Record<string, unknown>)
                    .avatarEnabled as boolean | undefined,
                )}
              </span>
            )}
          {simulation.duration && (
            <span className="inline-block text-[11px] font-medium px-3 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              {simulation.duration}
            </span>
          )}
          {isAISimulation(
            (simulation as unknown as Record<string, unknown>).avatarEnabled as
            | boolean
            | undefined,
          ) && (
              <span className="inline-block text-[11px] font-medium px-3 py-1 rounded-full bg-primary-50 text-primary-500 border border-primary-200">
                AI Seats Required
              </span>
            )}
          {simulation.difficulty && (
            <span
              className={`inline-block text-[11px] font-medium px-3 py-1 rounded-full ${DIFFICULTY_STYLES[simulation.difficulty] ?? "bg-slate-50 text-slate-500"}`}
            >
              {simulation.difficulty}
            </span>
          )}
          {simulation.learnerLevel && (
            <span
              className={`inline-block text-[11px] font-medium px-3 py-1 rounded-full ${LEVEL_STYLES[simulation.learnerLevel] ?? "bg-slate-50 text-slate-500"}`}
            >
              {simulation.learnerLevel}
            </span>
          )}
          {simulation.targetAudience &&
            simulation.targetAudience !== simulation.learnerLevel && (
              <span className="inline-block text-[11px] font-medium px-3 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                {simulation.targetAudience}
              </span>
            )}
        </div>

        {/* Title + unit name */}
        <h3 className="text-xl font-bold text-slate-800 mb-0.5">
          {simulation.title}
        </h3>
        {simulation.unit_name && (
          <p className="text-xs text-slate-400 mb-3">
            Unit: {simulation.unit_name}
          </p>
        )}

        {/* Description */}
        {simulation.description && (
          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            {simulation.description}
          </p>
        )}

        {simulation.learningObjectives &&
          simulation.learningObjectives.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-semibold text-slate-700 mb-2">
                Learning Objectives
              </p>
              <ul className="space-y-1.5">
                {simulation.learningObjectives.map((objective, idx) => (
                  <li
                    key={`${objective}-${idx}`}
                    className="flex items-start gap-2 text-sm text-slate-600"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-400 shrink-0 inline-block mt-2" />
                    <span>{objective}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

        {simulation.topicsAddressed && (
          <div className="mb-3">
            <p className="text-sm font-semibold text-slate-700 mb-1">
              Topics Addressed
            </p>
            <p className="text-sm text-slate-600">
              {simulation.topicsAddressed}
            </p>
          </div>
        )}

        {simulation.productName && (
          <div className="mb-3">
            <p className="text-sm font-semibold text-slate-700 mb-1">
              Product Name
            </p>
            <p className="text-sm text-slate-600">{simulation.productName}</p>
          </div>
        )}

        {simulation.clinicalSetting && (
          <div className="mb-4">
            <p className="text-sm font-semibold text-slate-700 mb-1">
              Clinical Setting
            </p>
            <p className="text-sm text-slate-600">
              {simulation.clinicalSetting}
            </p>
          </div>
        )}

        <div className="mb-5">
          <a
            href={`/simulationdetails/${encodeURIComponent(String(simulation.simulation_id || simulation.id))}`}
            className="inline-flex items-center text-sm font-semibold text-primary-500 hover:text-primary-600 hover:underline"
          >
            View Full Simulation Details in Simulation Catalog
          </a>
        </div>

        {/* Scenarios in this unit */}
        <div className="mb-5">
          <p className="text-sm font-semibold text-slate-700 mb-2">
            Scenarios in this Unit:
          </p>
          {unitSimLoading ? (
            <p className="text-xs text-slate-400">Loading scenarios...</p>
          ) : unitSimulations.length === 0 ? (
            <p className="text-xs text-slate-400">No scenarios found.</p>
          ) : (
            <ul className="space-y-1.5">
              {unitSimulations.map((sim) => (
                <li
                  key={sim.id}
                  className="flex items-center gap-2 text-sm text-slate-600"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-400 shrink-0 inline-block" />
                  {sim.title}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Assign button */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              onClose();
              onAssign(
                String(simulation.id),
                '', // Category no longer sourced from units
              );
            }}
            className="px-6 py-2.5 bg-primary-500 text-white text-sm font-semibold rounded-full hover:bg-primary-600 transition-colors shadow-sm"
          >
            {
              (localStorage.getItem("app_language")?.toLowerCase() === "es"
                ? loginEs
                : loginEn
              ).simulationCard.assignToClass
            }
          </button>
        </div>
      </Modal>
    </>
  );
};

export default MyLibraryModal;
