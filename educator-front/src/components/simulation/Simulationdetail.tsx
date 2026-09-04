import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Heart, ChevronDown, Play } from "lucide-react";
import loginEn from "../../locales/auth/login/en.json";
import loginEs from "../../locales/auth/login/es.json";
import { type SectionItem, type SimulationDetail } from "../../types/index";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { toast } from "../common/Toast";
import ShareModal from "../../components/modal/ShareModal";
import {
  selectLibrarySimulationIds,
  selectLibraryUnits,
  addPendingLibraryId,
  removePendingLibraryId,
  addPendingRemoveId,
  removePendingRemoveId,
} from "../../redux/simulation/MyLibraryRedux";
import { selectSimulationLibraryData } from "@/redux/dashboard/simulationlibrary/GetSimulationRedux";
import {
  clearSimulationDetail,
  fetchUnitDataRequest,
  selectSimulationDetail,
} from "../../redux/simulation/Simulationdetailredux";
import {
  clearResolvedScenario,
  fetchSimulationRequest,
  selectEffectiveScenarioId,
} from "../../redux/simulation/SimulationResolveRedux";
import { clearSelectedSimulation } from "../../redux/simulation/FetchSimulationCatalogRedux";
import BlobImage from "../common/BlobImage";
import {
  RemoveFromLibraryRequest,
  selectLibraryRemoving,
} from "@/redux/simulation/RemoveFromLibraryRedux";
import {
  AddToLibraryRequest,
  selectLibraryAdding,
} from "@/redux/simulation/AddToLibraryRequestRedux";
import { selectIsStartTrial } from "@/redux/auth/LoginRedux";
import { getDerivedCategory } from "../../utils/simulationType";
import { getParsedUser } from "../../utils/storage";
import {
  consumePreview,
  getPreviewsRemaining,
  MAX_PREVIEW_ATTEMPTS,
} from "../../utils/previewAttempts";
import PreviewSimulationModal from "./PreviewSimulationModal";

// Simulations run in the student app; an educator preview launches there in
// Practice mode, flagged so the backend stores no report/transcript.
const STUDENT_APP_URL = "https://tutorpatient.realityworksai.com/";

type SupportedLang = "en" | "es";
const getStoredLanguage = (): SupportedLang => {
  if (typeof window === "undefined") return "en";
  const saved = localStorage.getItem("app_language")?.toLowerCase();
  return saved === "es" ? "es" : "en";
};

/** A rounded, self-contained collapsible section card for the details page. */
function CollapsibleCard({
  title,
  open,
  onToggle,
  className = "",
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden ${className}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 text-left px-5 sm:px-6 py-4 hover:bg-[#e9e9e9]/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
      >
        <h2
          className={`text-base sm:text-lg font-bold transition-colors ${
            open ? "text-primary-500" : "text-[#5f6060]"
          }`}
        >
          {title}
        </h2>
        <ChevronDown
          size={20}
          className={`text-gray-500 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-4 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Render a free-text value as bullet points — one dot per line — when it spans
 * multiple lines; falls back to a single paragraph for one-line values. Strips
 * any leading bullet/dash the source text already carries so dots don't double.
 */
function BulletedText({
  value,
  className = "",
}: {
  value: string;
  className?: string;
}) {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[•\-*]\s*/, ""))
    .filter(Boolean);
  if (lines.length === 0) {
    return <p className={`whitespace-pre-line ${className}`}>{value}</p>;
  }
  // Always render a dot per line — a single-line value still gets one bullet.
  return (
    <ul className={`list-disc list-outside pl-5 space-y-1 ${className}`}>
      {lines.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  );
}

interface SimulationDetailProps {
  simulationId: string | number;
  initialData?: SectionItem;
  publicDetail?: SimulationDetail | null;
  onBack: () => void;
  isPublic?: boolean;
  hideBackButton?: boolean;
  fromProducts?: boolean;
  fromLibrary?: boolean;
  disableLibraryAction?: boolean;
  backLabel?: string;
}

const sanitizeDurationText = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  if (raw.length <= 30 && /min|hour|hr/i.test(raw)) return raw;

  const rangeMatch = raw.match(
    /(\d+\s*(?:-|to)\s*\d+\s*(?:minutes?|mins?|hours?|hrs?))/i,
  );
  if (rangeMatch?.[1]) {
    return rangeMatch[1]
      .replace(/\s+to\s+/i, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  const singleMatch = raw.match(/(\d+\s*(?:minutes?|mins?|hours?|hrs?))/i);
  if (singleMatch?.[1]) return singleMatch[1].replace(/\s+/g, " ").trim();

  return "";
};

const SimulationDetail = ({
  simulationId,
  initialData,
  publicDetail,
  onBack,
  isPublic = false,
  hideBackButton = false,
  fromProducts = false,
  fromLibrary = false,
  disableLibraryAction = false,
  backLabel,
}: SimulationDetailProps) => {
  const dispatch = useAppDispatch();
  const t = (
    localStorage.getItem("app_language")?.toLowerCase() === "es"
      ? loginEs
      : loginEn
  ).simulationDetail;
  const simulationDetail = useAppSelector(selectSimulationDetail);
  const blobDetail = useAppSelector(
    (state) => state.simulationCatalog.selectedItem,
  );
  const effectiveScenarioId = useAppSelector(
    selectEffectiveScenarioId(simulationId),
  );
  const addingToLibrary = useAppSelector(selectLibraryAdding);
  const removingFromLibrary = useAppSelector(selectLibraryRemoving);
  const isStartTrial = useAppSelector(selectIsStartTrial);
  const libraryIds = useAppSelector(selectLibrarySimulationIds);
  const libraryUnits = useAppSelector(selectLibraryUnits);
  const librarySimulationsData = useAppSelector(selectSimulationLibraryData);
  const librarySimulationId = effectiveScenarioId ?? String(simulationId);
  const [actionInProgress, setActionInProgress] = useState(false);

  // True once fetchMyLibrary has successfully loaded for this page session.
  // While false, state.SimulationLibrary is used as a fallback for immediate UI correctness.
  // Once true, state.myLibrary is the sole authoritative source.
  const libraryLoadedRef = useRef(false);

  // Optimistic local override: null = follow Redux, true/false = pending action
  // Stores the scenario key it's tracking so we only clear when that key is confirmed.
  const [optimisticInLibrary, setOptimisticInLibrary] = useState<{
    value: boolean;
    key: string;
  } | null>(null);

  const normalizeKey = (value: unknown) =>
    String(value ?? "")
      .trim()
      .toLowerCase();
  const normalizedLibraryIds = new Set(Array.from(libraryIds, normalizeKey));

  useEffect(() => {
    if (!optimisticInLibrary) return;
    if (!libraryLoadedRef.current) return;
    const hasKey = normalizedLibraryIds.has(
      normalizeKey(optimisticInLibrary.key),
    );
    if (
      (optimisticInLibrary.value && hasKey) ||
      (!optimisticInLibrary.value && !hasKey)
    ) {
      setOptimisticInLibrary(null);
    }
  }, [libraryIds, optimisticInLibrary, normalizedLibraryIds]);

  useEffect(() => {
    setOptimisticInLibrary(null);
    // Reset so the fallback activates until fetchMyLibrary completes for the new simulation.
    libraryLoadedRef.current = false;
  }, [simulationId]);

  const navigate = useNavigate();
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [additionalDetailsOpen, setAdditionalDetailsOpen] = useState(false);
  const [studentBriefingOpen, setStudentBriefingOpen] = useState(false);
  const [sbarOpen, setSbarOpen] = useState(false);
  const [facilitationDocsOpen, setFacilitationDocsOpen] = useState(false);

  // Educator "preview simulation" (practice mode, up to 3 attempts, nothing
  // stored). Tracked per educator + simulation in localStorage.
  const previewUserId = String(
    (getParsedUser()?.id as string | undefined) ?? "",
  );
  const previewSimId = String(effectiveScenarioId ?? simulationId ?? "");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewsRemaining, setPreviewsRemaining] = useState<number>(() =>
    getPreviewsRemaining(previewUserId, previewSimId),
  );
  useEffect(() => {
    setPreviewsRemaining(getPreviewsRemaining(previewUserId, previewSimId));
  }, [previewUserId, previewSimId]);

  const handleStartPreview = () => {
    if (!previewUserId || !previewSimId) {
      setPreviewOpen(false);
      return;
    }
    const remaining = consumePreview(previewUserId, previewSimId);
    setPreviewsRemaining(remaining);
    setPreviewOpen(false);
    // Launch in the student app, Practice mode, flagged as a no-store preview.
    const url = `${STUDENT_APP_URL}?simulationId=${encodeURIComponent(
      previewSimId,
    )}&mode=practice&preview=1`;
    window.open(url, "_blank", "noopener,noreferrer");
  };
  // 1-click expand/collapse for every collapsible section.
  const setAllSections = (open: boolean) => {
    setOverviewOpen(open);
    setAdditionalDetailsOpen(open);
    setStudentBriefingOpen(open);
    setSbarOpen(open);
    setFacilitationDocsOpen(open);
  };
  const allSectionsOpen =
    overviewOpen &&
    additionalDetailsOpen &&
    studentBriefingOpen &&
    sbarOpen &&
    facilitationDocsOpen;

  useEffect(() => {
    const bootstrap = async () => {
      if (isPublic) return;

      dispatch(clearSelectedSimulation());

      try {
        const initialScenarioId =
          initialData?.scenarioId ??
          (typeof simulationId === "string" && simulationId !== "0"
            ? simulationId
            : undefined) ??
          (typeof simulationId === "number" && simulationId !== 0
            ? String(simulationId)
            : undefined);

        let resolvedScenarioId: string | undefined = initialScenarioId;

        const ls = getStoredLanguage() === "es" ? "es" : "en";

        if (!resolvedScenarioId && initialData?.title) {
          try {
            resolvedScenarioId = await dispatch(
              fetchSimulationRequest({ title: initialData.title, ls }),
            ).unwrap();
          } catch (err) {
            const msg = (err as { message?: string })?.message ?? "";
            toast.error(msg || "Failed to resolve simulation by title");
          }
        }

        const unitId =
          initialData?.unit ??
          ((initialData as unknown as Record<string, unknown>)?.unit_id as
            | string
            | undefined);

        if (unitId) {
          try {
            const fallbackItem: SectionItem = initialData || {
              id:
                typeof simulationId === "string"
                  ? parseInt(simulationId)
                  : simulationId,
              title: "",
              image: "",
              cta: "View",
              description: "",
            };
            await dispatch(
              fetchUnitDataRequest({
                unitId,
                simulationId,
                resolvedScenarioId,
                title: initialData?.title || "",
                fallback: fallbackItem,
                ls,
              }),
            ).unwrap();
          } catch (err) {
            const msg = (err as { message?: string })?.message ?? "";
            toast.error(msg || "Failed to load unit data");
          }
        }
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? "";
        toast.error(msg || "Failed to load simulation details");
      }
    };

    bootstrap().catch((err) => {
      const msg = (err as { message?: string })?.message ?? "";
      toast.error(msg || "Unexpected error loading simulation details");
    });

    return () => {
      dispatch(clearSimulationDetail());
      dispatch(clearResolvedScenario());
      dispatch(clearSelectedSimulation());
    };
  }, [simulationId]);

  const fallbackSim: SimulationDetail = {
    id: 0,
    title: initialData?.title ?? "",
    subtitle: initialData?.subtitle || "",
    scenarioImage: initialData?.image || "",
    images: initialData?.images,
    unit: initialData?.unit || "",
    category: "", // Category is now derived from avatarEnabled only
    language: initialData?.language || "",
    targetAudience: initialData?.targetAudience,
    difficultyLevel: initialData?.difficulty || "",
    estimatedDuration: initialData?.duration || "",
    purpose: initialData?.purpose || "",
    description: initialData?.description || "",
    learning_objectives: initialData?.learning_objectives,
    developer: initialData?.developer || "",
    institution: initialData?.institution || "",
    last_update: initialData?.last_update || "",
    simulation_privacy: "",
    tries_left: undefined,
    whats_new: undefined,
  };

  const sim: SimulationDetail = (() => {
    if (isPublic && publicDetail) return publicDetail;
    if (!isPublic && publicDetail && !simulationDetail) return publicDetail;
    if (blobDetail) {
      const base = simulationDetail ?? ({} as SimulationDetail);
      const blob = blobDetail as unknown as Record<string, unknown>;
      return {
        ...base,
        ...blobDetail,
        scenarioImage:
          blobDetail.scenarioImage ||
          base.scenarioImage ||
          initialData?.image ||
          "",
        images: blobDetail.images?.length
          ? blobDetail.images
          : (base.images ?? initialData?.images),
        unit: blobDetail.unit || base.unit || initialData?.unit || "",
        category: "", // Category is now derived from avatarEnabled only
        language:
          blobDetail.language || base.language || initialData?.language || "",
        image_url:
          blobDetail.image_url || base.image_url || initialData?.image || "",
        estimatedDuration:
          blobDetail.estimatedDuration ||
          (blob.estimated_duration as string | undefined) ||
          (blob.duration as string | undefined) ||
          base.estimatedDuration ||
          initialData?.duration ||
          "",
        targetAudience:
          blobDetail.targetAudience ??
          base.targetAudience ??
          initialData?.targetAudience,
        learning_objectives:
          blobDetail.learning_objectives ??
          base.learning_objectives ??
          initialData?.learning_objectives,
      } as SimulationDetail;
    }
    return simulationDetail ?? fallbackSim;
  })();

  const screenshots = (sim.images ?? []).filter(
    (src): src is string => typeof src === "string" && src.trim().length > 0,
  );

  const matchKeys = Array.from(
    new Set(
      [
        librarySimulationId,
        simulationId,
        initialData?.scenarioId,
        initialData?.id,
        sim.id,
        (sim as unknown as Record<string, unknown>).simulation_id,
        (sim as unknown as Record<string, unknown>).scenario_id,
      ]
        .filter((value) => value != null && String(value).trim() !== "")
        .map(normalizeKey),
    ),
  );

  const isLibraryKey = (key: unknown) => {
    const normalized = normalizeKey(key);
    if (normalizedLibraryIds.has(normalized)) return true;
    return libraryUnits.some((unit) =>
      unit.simulations.some((librarySim) =>
        [librarySim.id, librarySim.simulation_id, librarySim.scenario_id]
          .filter((value) => value != null && String(value).trim() !== "")
          .map(normalizeKey)
          .includes(normalized),
      ),
    );
  };
  // Also check against the simulation-library store (populated when navigating from the library page)
  // so the button state is correct immediately using whatever data is already in Redux.
  const isInSimulationLibraryData = librarySimulationsData.some((libSim) =>
    matchKeys.some((k) =>
      [normalizeKey(libSim.id), normalizeKey(libSim.simulation_id)].includes(k),
    ),
  );

  const addedToLibrary =
    optimisticInLibrary !== null &&
      optimisticInLibrary.key === librarySimulationId
      ? optimisticInLibrary.value
      : matchKeys.some(isLibraryKey) || isInSimulationLibraryData;

  const libraryActionDisabled = disableLibraryAction || actionInProgress;

  const simRecord = sim as unknown as Record<string, unknown>;
  // Use avatarEnabled as sole source of truth for category display
  const avatarEnabledValue = (sim as unknown as Record<string, unknown>)
    ?.avatarEnabled as boolean | undefined;
  const derivedCategory = getDerivedCategory(avatarEnabledValue);
  const displayCategory = derivedCategory || "";
  const categoryText = displayCategory || "N/A";
  const rawDifficulty =
    sim.difficultyLevel ||
    (simRecord.difficulty as string | undefined) ||
    (simRecord.difficulty_level as string | undefined) ||
    initialData?.difficulty ||
    "";
  const difficultyTranslationMap: Record<string, string> = {
    Easy: t.difficultyEasy,
    Medium: t.difficultyMedium,
    Hard: t.difficultyHard,
  };
  const displayDifficulty =
    difficultyTranslationMap[rawDifficulty] ?? rawDifficulty;
  const displayDuration = sanitizeDurationText(
    sim.estimatedDuration ||
    (simRecord.estimated_duration as string | undefined) ||
    (simRecord.estimated_duration_minutes as string | undefined) ||
    (simRecord.duration as string | undefined) ||
    ((sim.studentBriefing as Record<string, unknown> | undefined)
      ?.time_allotment as string | undefined) ||
    sim.studentBriefing?.timeAllotment ||
    initialData?.duration ||
    "",
  );

  const handleAddToLibrary = async () => {
    const scenarioKey = effectiveScenarioId ?? String(simulationId);

    if (addedToLibrary) {
      setActionInProgress(true);
      setOptimisticInLibrary({ value: false, key: scenarioKey });
      dispatch(addPendingRemoveId(scenarioKey));
      try {
        await dispatch(
          RemoveFromLibraryRequest({ scenario_id: scenarioKey }),
        ).unwrap();
        toast.success("Removed from library successfully");
      } catch (err: unknown) {
        const msg =
          typeof err === "string"
            ? err
            : ((err as { message?: string })?.message ?? "");
        const lower = msg.toLowerCase();
        if (
          lower.includes("not found") ||
          lower.includes("simulation not found")
        ) {
          toast.success("Removed from library successfully");
        } else {
          setOptimisticInLibrary({ value: true, key: scenarioKey });
          dispatch(removePendingRemoveId(scenarioKey));
          toast.error(msg || "Failed to remove from library");
        }
      } finally {
        setActionInProgress(false);
      }
      return;
    }

    if (!effectiveScenarioId) {
      toast.error("Cannot add to library: simulation has no valid scenario ID");
      return;
    }

    // Guard: already in library (covers stale-state race)
    if (matchKeys.some(isLibraryKey)) {
      setOptimisticInLibrary({ value: true, key: scenarioKey });
      return;
    }

    setActionInProgress(true);
    setOptimisticInLibrary({ value: true, key: scenarioKey });
    // Optimistic Redux add: catalog heart fills immediately across all views.
    dispatch(addPendingLibraryId(effectiveScenarioId));
    const unitId = sim.unit || initialData?.unit || "";
    try {
      await dispatch(
        AddToLibraryRequest({
          scenario_id: effectiveScenarioId,
          unit_id: unitId,
        }),
      ).unwrap();
      toast.success("Added to library successfully");
    } catch (err: unknown) {
      const msg =
        typeof err === "string"
          ? err
          : ((err as { message?: string })?.message ?? "");
      const lower = msg.toLowerCase();
      if (
        !lower.includes("already exists") &&
        !lower.includes("already in library")
      ) {
        setOptimisticInLibrary({ value: false, key: scenarioKey });
        dispatch(removePendingLibraryId(effectiveScenarioId));
        toast.error(msg || "Failed to add to library");
      } else {
        toast.success("Added to library successfully");
      }
    } finally {
      setActionInProgress(false);
    }
  };

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const base = `${window.location.origin}/simulationdetails/${simulationId}`;
    try {
      const payload = {
        id: sim.id,
        scenarioId: String(simulationId),
        title: sim.title,
        subtitle: sim.subtitle ?? "",
        image: sim.image_url ?? sim.scenarioImage ?? "",
        cta: "View",
        unit: sim.unit ?? "",
        category: sim.category ?? "",
        language: sim.language ?? "",
        description: sim.description ?? "",
        purpose: sim.purpose ?? "",
        difficulty: sim.difficultyLevel ?? "",
        duration: sim.estimatedDuration ?? "",
        developer: sim.developer ?? "",
        institution: sim.institution ?? "",
        last_update: sim.last_update ?? "",
        learning_objectives: sim.learning_objectives ?? [],
        targetAudience: sim.targetAudience ?? [],
      };
      return `${base}#data=${btoa(encodeURIComponent(JSON.stringify(payload)))}`;
    } catch {
      return base;
    }
  }, [simulationId, sim]);

  return (
    <div className="min-h-screen bg-[#f7f8fa] font-sans text-gray-800">
      <div className="w-full pb-10 space-y-5">
        {/* Gradient hero banner — healthcare product-family palette (marketing-
            approved): teal #7dc7b7 / #4f9096 → navy #323464. Intentionally
            different from the app's Realityworks orange scheme. */}
        <div
          className="relative overflow-hidden rounded-2xl mx-3 sm:mx-5 mt-4 px-6 sm:px-8 lg:px-12 xl:px-16 py-6 sm:py-7 text-white"
          style={{ background: 'linear-gradient(135deg, #7dc7b7 0%, #4f9096 45%, #323464 100%)' }}
        >
          <div className="pointer-events-none absolute inset-0 bg-black/10" aria-hidden="true" />
          {!isPublic && !hideBackButton && (
            <button
              onClick={onBack}
              className="relative flex items-center gap-1 text-sm text-white hover:text-white mb-4 transition-colors [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]"
            >
              <ArrowLeft size={15} />{" "}
              {backLabel ??
                (fromProducts
                  ? t.backToProducts
                  : fromLibrary
                    ? t.backToLibrary
                    : t.back)}
            </button>
          )}

          <div className="relative flex items-start gap-6 flex-wrap">
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight min-w-0 break-words [text-shadow:0_1px_3px_rgba(0,0,0,0.35)]">
                  {sim.title}
                </h1>
                {!isPublic && !isStartTrial && addedToLibrary && (
                  <button
                    onClick={handleAddToLibrary}
                    disabled={libraryActionDisabled}
                    className="p-1.5 rounded-full hover:bg-white/20 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={
                      addedToLibrary
                        ? t.removeFromLibraryAria
                        : t.addToLibraryAria
                    }
                    aria-label={
                      addedToLibrary
                        ? t.removeFromLibraryAria
                        : t.addToLibraryAria
                    }
                  >
                    <Heart
                      size={18}
                      className="text-white"
                      fill={addedToLibrary ? "currentColor" : "none"}
                      strokeWidth={2}
                    />
                  </button>
                )}
              </div>
              {sim.subtitle && (
                <p className="text-sm text-white mt-1 [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]">{sim.subtitle}</p>
              )}
              {!isPublic && isStartTrial && (
                <button
                  onClick={() => navigate("/redeem")}
                  className="mt-2 flex items-center gap-2 px-5 py-2 rounded-full bg-white text-[#323464] font-semibold text-sm hover:bg-white/90 transition-colors"
                >
                  Activate License
                </button>
              )}
              <div className="flex gap-3 mt-3 flex-wrap">
                {isPublic ? (
                  <button
                    onClick={() =>
                      navigate("/login", {
                        state: {
                          from: window.location.pathname + window.location.hash,
                        },
                      })
                    }
                    className="flex items-center gap-2 px-5 py-2 rounded-full bg-white text-[#323464] font-semibold text-sm hover:bg-white/90 transition-colors whitespace-nowrap"
                  >
                    {t.signInToAdd}
                  </button>
                ) : (
                  !isStartTrial && (
                    <button
                      onClick={handleAddToLibrary}
                      disabled={libraryActionDisabled}
                      className="flex items-center gap-2 px-5 py-2 rounded-full bg-white text-[#323464] font-semibold text-sm hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {addingToLibrary || removingFromLibrary ? (
                        <span className="w-3.5 h-3.5 border-2 border-[#323464] border-t-transparent rounded-full animate-spin" />
                      ) : null}
                      {disableLibraryAction
                        ? t.addedByEducator
                        : addedToLibrary
                          ? t.removeFromLibrary
                          : t.addToLibrary}
                    </button>
                  )
                )}
                {!isPublic && !isStartTrial && (
                  <button
                    onClick={() => setPreviewOpen(true)}
                    disabled={previewsRemaining <= 0 || !previewSimId}
                    className="flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-btn text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    title={
                      previewsRemaining > 0
                        ? `Preview in Practice mode — ${previewsRemaining} of ${MAX_PREVIEW_ATTEMPTS} attempts left`
                        : "No preview attempts left"
                    }
                  >
                    <Play size={15} aria-hidden="true" />
                    {previewsRemaining > 0
                      ? "Preview Simulation"
                      : "No Previews Left"}
                    <span
                      className={`ml-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                        previewsRemaining > 0
                          ? "bg-[#e9e9e9] text-[#5f6060]"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {previewsRemaining} of {MAX_PREVIEW_ATTEMPTS} left
                    </span>
                  </button>
                )}
              </div>
            </div>

            {sim.tries_left !== undefined && (
              <div className="flex-shrink-0 w-full md:w-64 border border-amber-300 bg-amber-50 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-amber-600 font-bold text-sm">
                    {t.attention}
                  </span>
                  <span className="bg-blue-100 text-blue-600 text-xs font-semibold px-3 py-1 rounded-full border border-blue-200">
                    Only {sim.tries_left} {t.triesLeft}
                  </span>
                </div>
                <p className="text-sm text-gray-700 leading-snug">
                  {t.triesLeftDesc}
                </p>
              </div>
            )}
          </div>

          <div className="relative mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {(
              [
                { label: "Modality", value: categoryText },
                {
                  label: t.labelTargetAudience,
                  value: Array.isArray(sim.targetAudience)
                    ? sim.targetAudience.join(", ")
                    : sim.targetAudience || sim.learnerLevel,
                },
                { label: t.labelDifficulty, value: displayDifficulty },
                { label: t.labelDuration, value: displayDuration },
                { label: t.labelClinicalSetting, value: sim.department },
                { label: t.labelUnit, value: sim.unit },
              ] as { label: string; value: string | undefined }[]
            )
              .filter(({ value }) => value)
              .map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 min-w-0 overflow-hidden"
                >
                  <p className="text-[10px] uppercase tracking-wide text-white font-semibold truncate [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">
                    {label}
                  </p>
                  <p
                    className="text-sm font-semibold text-white truncate"
                    title={value}
                  >
                    {value}
                  </p>
                </div>
              ))}
          </div>
        </div>

        {screenshots.length > 0 && (
          <div className="px-6 sm:px-8 lg:px-12 xl:px-16">
            <div className="flex gap-4 overflow-x-auto pb-2">
              {screenshots.map((src, i) => (
                <BlobImage
                  key={i}
                  src={src}
                  alt={`Screenshot ${i + 1}`}
                  className="rounded-xl border border-gray-200 shadow-sm h-44 w-auto flex-shrink-0 object-cover"
                />
              ))}
            </div>
          </div>
        )}

        {/* 1-click expand-all / collapse-all for every section below. */}
        <div className="mx-6 sm:mx-8 lg:mx-12 xl:mx-16 flex justify-end">
          <button
            type="button"
            onClick={() => setAllSections(!allSectionsOpen)}
            aria-expanded={allSectionsOpen}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-500 hover:text-primary-600 rounded-full px-3 py-1.5 hover:bg-[#e9e9e9] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          >
            <ChevronDown
              size={16}
              className={`transition-transform duration-200 ${allSectionsOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
            {allSectionsOpen ? "Collapse All" : "Expand All"}
          </button>
        </div>

        {(sim.purpose ||
          sim.description ||
          sim.learningObjective ||
          sim.topicsAddressed ||
          !!sim.learning_objectives?.length) && (
          <CollapsibleCard
            title="Simulation Overview"
            open={overviewOpen}
            onToggle={() => setOverviewOpen((p) => !p)}
            className="mx-6 sm:mx-8 lg:mx-12 xl:mx-16"
          >
            <div className="text-base text-gray-700 leading-relaxed space-y-3">
              {sim.purpose && (
                <p>
                  <strong>{t.labelPurpose}</strong> {sim.purpose}
                </p>
              )}
              {sim.description && (
                <p>
                  <strong>{t.labelDescription}</strong> {sim.description}
                </p>
              )}
              {sim.learningObjective && (
                <div>
                  <p className="font-bold text-gray-900 mb-1">
                    {t.learningObjective}
                  </p>
                  <BulletedText
                    value={sim.learningObjective}
                    className="text-gray-700"
                  />
                </div>
              )}
              {!!sim.learning_objectives?.length && (
                <div>
                  <h3 className="font-bold text-gray-900 mb-2">
                    {t.learningObjectives}
                  </h3>
                  <ul className="list-disc list-inside space-y-1">
                    {sim.learning_objectives.map((obj, i) => (
                      <li key={i}>{obj.replace(/^[•\-*]\s*/, "")}</li>
                    ))}
                  </ul>
                </div>
              )}
              {sim.topicsAddressed && (
                <div>
                  <p className="font-bold text-gray-900 mb-1">
                    {t.labelTopicsAddressed}
                  </p>
                  <p className="whitespace-pre-line text-gray-700">
                    {sim.topicsAddressed}
                  </p>
                </div>
              )}
            </div>
          </CollapsibleCard>
        )}

        {[
          sim.productName,
          sim.additionalEquipment,
          sim.optionalEquipment,
          sim.setupNotes,
        ].some(Boolean) && (
          <CollapsibleCard
            title={t.additionalDetails}
            open={additionalDetailsOpen}
            onToggle={() => setAdditionalDetailsOpen((prev) => !prev)}
            className="mx-6 sm:mx-8 lg:mx-12 xl:mx-16"
          >
            <div className="grid grid-cols-1 gap-y-5 text-base">
              {[
                { label: t.labelProductName, value: sim.productName },
                {
                  label: t.labelAdditionalEquipment,
                  value: sim.additionalEquipment,
                },
                {
                  label: t.labelOptionalEquipment,
                  value: sim.optionalEquipment,
                },
                { label: t.labelSetupNotes, value: sim.setupNotes },
              ]
                .filter((f) => f.value)
                .map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-sm font-bold text-gray-700 mb-0.5">{label}</p>
                    <p className="text-gray-800 whitespace-pre-line">
                      {value}
                    </p>
                  </div>
                ))}
            </div>
          </CollapsibleCard>
        )}

        {sim.studentBriefing &&
          Object.values(sim.studentBriefing).some(Boolean) && (
            <CollapsibleCard
              title={t.studentBriefing}
              open={studentBriefingOpen}
              onToggle={() => setStudentBriefingOpen((prev) => !prev)}
              className="mx-6 sm:mx-8 lg:mx-12 xl:mx-16"
            >
              <div className="space-y-5 text-base text-gray-700">
                    {[
                      {
                        label: t.sbSafeEnvironment,
                        value: sim.studentBriefing.safeEnvironment,
                      },
                      {
                        label: t.sbFacilitatorSupport,
                        value: sim.studentBriefing.facilitatorSupport,
                      },
                      {
                        label: t.sbOrientationSpace,
                        value: sim.studentBriefing.orientationSpace,
                      },
                      {
                        label: t.sbOrientationEquipment,
                        value: sim.studentBriefing.orientationEquipment,
                      },
                      {
                        label: t.sbEvaluation,
                        value: sim.studentBriefing.evaluation,
                      },
                      {
                        label: t.sbRolesExpectations,
                        value: sim.studentBriefing.rolesExpectations,
                      },
                      {
                        label: t.sbSimulationLimitations,
                        value: sim.studentBriefing.simulationLimitations,
                      },
                      {
                        label: t.sbTimeAllotment,
                        value: sim.studentBriefing.timeAllotment,
                      },
                      {
                        label: t.sbPurpose,
                        value: sim.studentBriefing.purpose,
                      },
                      {
                        label: t.sbLearningObjectives,
                        value: sim.studentBriefing.learningObjectives,
                      },
                      {
                        label: t.sbClosingReminder,
                        value: sim.studentBriefing.closingReminder,
                      },
                    ]
                      .filter((f) => f.value)
                      .map(({ label, value }) => (
                        // Every briefing section gets the orange left-accent card
                        // (same treatment as the SBAR sections).
                        <div
                          key={label}
                          className="rounded-lg border-l-4 border-primary-500 bg-[#f5f6f8] px-4 py-3"
                        >
                          <p className="text-sm sm:text-base font-bold uppercase tracking-wide text-primary-500 mb-1">
                            {label}
                          </p>
                          <BulletedText
                            value={value as string}
                            className="leading-relaxed text-gray-700"
                          />
                        </div>
                      ))}
              </div>
            </CollapsibleCard>
          )}

        {sim.sbar && Object.values(sim.sbar).some(Boolean) && (
          <CollapsibleCard
            title={t.sbar}
            open={sbarOpen}
            onToggle={() => setSbarOpen((prev) => !prev)}
            className="mx-6 sm:mx-8 lg:mx-12 xl:mx-16"
          >
            <div className="space-y-4 text-base text-gray-700">
              {[
                { label: t.sbarSituation, value: sim.sbar.situation },
                { label: t.sbarBackground, value: sim.sbar.background },
                { label: t.sbarAssessment, value: sim.sbar.assessment },
                {
                  label: t.sbarRecommendation,
                  value: sim.sbar.recommendation,
                },
              ]
                .filter((f) => f.value)
                .map(({ label, value }) => (
                  <div
                    key={label}
                    className="rounded-lg border-l-4 border-primary-500 bg-[#f5f6f8] px-4 py-3"
                  >
                    <p className="text-sm sm:text-base font-bold uppercase tracking-wide text-primary-500 mb-1">
                      {label}
                    </p>
                    <BulletedText
                      value={value as string}
                      className="leading-relaxed text-gray-700"
                    />
                  </div>
                ))}
            </div>
          </CollapsibleCard>
        )}

        {[
          sim.prebriefScriptPdf,
          sim.debriefPointsPdf,
          sim.setupNotesPdf,
          sim.facilitationNotesPdf,
          sim.printableSbarPdf,
          sim.printablePatientChartPdf,
        ].some(Boolean) && (
          <CollapsibleCard
            title={t.facilitationDocuments}
            open={facilitationDocsOpen}
            onToggle={() => setFacilitationDocsOpen((prev) => !prev)}
            className="mx-6 sm:mx-8 lg:mx-12 xl:mx-16"
          >
            {(() => {
              const renderDocs = (
                docs: { label: string; url?: string }[],
              ) => (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 text-sm items-stretch">
                  {docs
                    .filter((f) => f.url)
                    .map(({ label, url }) => (
                      <a
                        key={label}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-start gap-2.5 h-full bg-[#e9e9e9] border border-gray-300 hover:border-primary-400 rounded-xl px-4 py-3 font-medium cursor-pointer transition-all hover:shadow-md"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="w-5 h-5 flex-shrink-0 mt-0.5 text-primary-500"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span className="text-[#5f6060] group-hover:underline break-words min-w-0">
                          {label}
                        </span>
                      </a>
                    ))}
                </div>
              );
              const instructorDocs = [
                { label: t.fdSetupNotes, url: sim.setupNotesPdf },
                { label: t.fdFacilitationNotes, url: sim.facilitationNotesPdf },
                { label: t.fdPrebriefScript, url: sim.prebriefScriptPdf },
                { label: t.fdDebriefPoints, url: sim.debriefPointsPdf },
              ];
              const studentDocs = [
                { label: t.fdPrintableSbar, url: sim.printableSbarPdf },
                {
                  label: t.fdPrintablePatientChart,
                  url: sim.printablePatientChartPdf,
                },
              ];
              return (
                <div className="space-y-5">
                  {instructorDocs.some((d) => d.url) && (
                    <div>
                      <p className="text-sm sm:text-base font-bold uppercase tracking-wide text-[#5f6060] mb-2">
                        Instructor-Facing
                      </p>
                      {renderDocs(instructorDocs)}
                    </div>
                  )}
                  {studentDocs.some((d) => d.url) && (
                    <div>
                      <p className="text-sm sm:text-base font-bold uppercase tracking-wide text-[#5f6060] mb-2">
                        Student-Facing
                      </p>
                      {renderDocs(studentDocs)}
                    </div>
                  )}
                </div>
              );
            })()}
          </CollapsibleCard>
        )}
      </div>

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        title={sim.title}
        simulationUrl={shareUrl}
      />

      <PreviewSimulationModal
        isOpen={previewOpen}
        simName={sim.title}
        remaining={previewsRemaining}
        onClose={() => setPreviewOpen(false)}
        onConfirm={handleStartPreview}
      />
    </div>
  );
};

export default SimulationDetail;
