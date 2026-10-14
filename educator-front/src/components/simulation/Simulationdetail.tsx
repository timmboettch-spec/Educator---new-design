import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronDown, Heart, Loader2 } from 'lucide-react';
import {
  type SectionItem,
  type SimulationDetail as SimulationDetailType,
} from '../../types/index';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { cn } from '@/lib/utils';
import { toast } from '../common/Toast';
import {
  selectLibrarySimulationIds,
  selectLibraryUnits,
  addPendingLibraryId,
  removePendingLibraryId,
  addPendingRemoveId,
  removePendingRemoveId,
} from '../../redux/simulation/MyLibraryRedux';
import { selectSimulationLibraryData } from '@/redux/dashboard/simulationlibrary/GetSimulationRedux';
import {
  clearSimulationDetail,
  fetchUnitDataRequest,
  selectSimulationDetail,
} from '../../redux/simulation/Simulationdetailredux';
import {
  clearResolvedScenario,
  fetchSimulationRequest,
  selectEffectiveScenarioId,
} from '../../redux/simulation/SimulationResolveRedux';
import { clearSelectedSimulation } from '../../redux/simulation/FetchSimulationCatalogRedux';
import BlobImage from '../common/BlobImage';
import ErrorState from './ErrorState';
import { Skeleton } from '../ui/Skeleton';
import {
  RemoveFromLibraryRequest,
  selectLibraryRemoving,
} from '@/redux/simulation/RemoveFromLibraryRedux';
import {
  AddToLibraryRequest,
  selectLibraryAdding,
} from '@/redux/simulation/AddToLibraryRequestRedux';
import { selectIsStartTrial } from '@/redux/auth/LoginRedux';
import {
  useSimulationDurationLabel,
  useSimulationValueLabel,
} from '@/hooks/useSimulationValueLabel';
import { type SimulationDocumentType } from '@/api/simulationDocumentApi';
import { generateSupportingDocument } from '@/lib/simulationDocuments';
import { translateApiError } from '../../utils/translateApiError';

type SupportingDocument = {
  type: SimulationDocumentType;
  labelKey:
    | 'documents.setupGuide'
    | 'documents.simulationDetails'
    | 'documents.briefingScript'
    | 'documents.debriefingScript'
    | 'documents.patientSbar'
    | 'documents.patientChart';
  filename: string;
  audience: 'instructor' | 'student';
  availableForAvatar: boolean;
};

const SUPPORTING_DOCUMENTS: SupportingDocument[] = [
  {
    type: 'setup-guide',
    labelKey: 'documents.setupGuide',
    filename: 'simulation-set-up-guide.pdf',
    audience: 'instructor',
    availableForAvatar: false,
  },
  {
    type: 'simulation-details',
    labelKey: 'documents.simulationDetails',
    filename: 'simulation-details.pdf',
    audience: 'instructor',
    availableForAvatar: true,
  },
  {
    type: 'briefing-script',
    labelKey: 'documents.briefingScript',
    filename: 'simulation-briefing-script.pdf',
    audience: 'instructor',
    availableForAvatar: true,
  },
  {
    type: 'debriefing-script',
    labelKey: 'documents.debriefingScript',
    filename: 'simulation-debriefing-script.pdf',
    audience: 'instructor',
    availableForAvatar: true,
  },
  {
    type: 'patient-sbar',
    labelKey: 'documents.patientSbar',
    filename: 'printable-patient-sbar.pdf',
    audience: 'student',
    availableForAvatar: false,
  },
  {
    type: 'patient-chart',
    labelKey: 'documents.patientChart',
    filename: 'printable-patient-chart.pdf',
    audience: 'student',
    availableForAvatar: false,
  },
];

/** A rounded, self-contained collapsible section card for the details page. */
function CollapsibleCard({
  title,
  open,
  onToggle,
  className,
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
      className={cn(
        'bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden',
        className
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 text-left px-5 sm:px-6 py-4 hover:bg-neutral-active/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
      >
        <h2
          className={cn(
            'text-base sm:text-lg font-bold transition-colors',
            open ? 'text-primary-500' : 'text-neutral-strong'
          )}
        >
          {title}
        </h2>
        <ChevronDown
          size={20}
          className={cn(
            'text-gray-500 shrink-0 transition-transform duration-200',
            open && 'rotate-180'
          )}
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
 * Render a free-text value as bullet points, one per line. Strips any leading
 * bullet/dash the source text already carries so dots don't double.
 */
function BulletedText({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[•\-*]\s*/, ''))
    .filter(Boolean);
  if (lines.length === 0) {
    return <p className={cn('whitespace-pre-line', className)}>{value}</p>;
  }
  return (
    <ul className={cn('list-disc list-outside pl-5 space-y-1', className)}>
      {lines.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  );
}

const SECTION_INSET = 'mx-6 sm:mx-8 lg:mx-12 xl:mx-16';

interface SimulationDetailProps {
  simulationId: string | number;
  initialData?: SectionItem;
  publicDetail?: SimulationDetailType | null;
  onBack: () => void;
  isPublic?: boolean;
  hideBackButton?: boolean;
  fromProducts?: boolean;
  fromLibrary?: boolean;
  disableLibraryAction?: boolean;
  backLabel?: string;
  /**
   * Status of the page's full-details request. While it is pending or has
   * failed and no section data has arrived from either source, the sections
   * area shows a loading skeleton or an error with Retry under the hero.
   */
  detailsStatus?: 'loading' | 'ready' | 'failed';
  /** Re-requests the page's full details (paired with `detailsStatus`). */
  onRetryDetails?: () => void;
}

const sanitizeDurationText = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  if (raw.length <= 30 && /min|hour|hr/i.test(raw)) return raw;

  const rangeMatch = raw.match(
    /(\d+\s*(?:-|to)\s*\d+\s*(?:minutes?|mins?|hours?|hrs?))/i
  );
  if (rangeMatch?.[1]) {
    return rangeMatch[1]
      .replace(/\s+to\s+/i, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const singleMatch = raw.match(/(\d+\s*(?:minutes?|mins?|hours?|hrs?))/i);
  if (singleMatch?.[1]) return singleMatch[1].replace(/\s+/g, ' ').trim();

  return '';
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
  detailsStatus,
  onRetryDetails,
}: SimulationDetailProps) => {
  const dispatch = useAppDispatch();
  const { t, i18n } = useTranslation('simulationLibrary', {
    keyPrefix: 'details',
  });
  // Drives the API `ls` param and the legacy API-error translator.
  const language = i18n.resolvedLanguage === 'es' ? 'es' : 'en';
  const valueLabel = useSimulationValueLabel();
  const durationLabel = useSimulationDurationLabel();
  const simulationDetail = useAppSelector(selectSimulationDetail);
  const blobDetail = useAppSelector(
    (state) => state.simulationCatalog.selectedItem
  );
  const effectiveScenarioId = useAppSelector(
    selectEffectiveScenarioId(simulationId)
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
    String(value ?? '')
      .trim()
      .toLowerCase();
  const normalizedLibraryIds = new Set(Array.from(libraryIds, normalizeKey));

  useEffect(() => {
    if (!optimisticInLibrary) return;
    if (!libraryLoadedRef.current) return;
    const hasKey = normalizedLibraryIds.has(
      normalizeKey(optimisticInLibrary.key)
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
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [additionalDetailsOpen, setAdditionalDetailsOpen] = useState(false);
  const [studentBriefingOpen, setStudentBriefingOpen] = useState(false);
  const [sbarOpen, setSbarOpen] = useState(false);
  const [facilitationDocsOpen, setFacilitationDocsOpen] = useState(false);
  const [generatingDocument, setGeneratingDocument] =
    useState<SimulationDocumentType | null>(null);
  // The unit request is the second source of section data.
  const [isUnitLoading, setIsUnitLoading] = useState(false);
  const [unitRetryKey, setUnitRetryKey] = useState(0);

  // One-click expand/collapse for every collapsible section.
  const setAllSections = (open: boolean) => {
    setOverviewOpen(open);
    setAdditionalDetailsOpen(open);
    setStudentBriefingOpen(open);
    setSbarOpen(open);
    setFacilitationDocsOpen(open);
  };
  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      if (isPublic) return;

      dispatch(clearSelectedSimulation());

      try {
        const initialScenarioId =
          initialData?.scenarioId ??
          (typeof simulationId === 'string' && simulationId !== '0'
            ? simulationId
            : undefined) ??
          (typeof simulationId === 'number' && simulationId !== 0
            ? String(simulationId)
            : undefined);

        let resolvedScenarioId: string | undefined = initialScenarioId;

        const ls = language;

        if (!resolvedScenarioId && initialData?.title) {
          try {
            resolvedScenarioId = await dispatch(
              fetchSimulationRequest({ title: initialData.title, ls })
            ).unwrap();
          } catch (err) {
            const msg = (err as { message?: string })?.message ?? '';
            toast.error(
              msg
                ? translateApiError(msg, language)
                : t('toast.failedToResolve')
            );
          }
        }

        const unitId =
          initialData?.unit ??
          ((initialData as unknown as Record<string, unknown>)?.unit_id as
            string | undefined);

        if (unitId) {
          setIsUnitLoading(true);
          try {
            const fallbackItem: SectionItem = initialData || {
              id:
                typeof simulationId === 'string'
                  ? parseInt(simulationId)
                  : simulationId,
              title: '',
              image: '',
              cta: 'View',
              description: '',
            };
            await dispatch(
              fetchUnitDataRequest({
                unitId,
                simulationId,
                resolvedScenarioId,
                title: initialData?.title || '',
                fallback: fallbackItem,
                ls,
                // The page shows its own loading state for this request
                // when it tracks the details status.
                silent: Boolean(detailsStatus),
              })
            ).unwrap();
          } catch (err) {
            // When the page reports the details status, a failure here is
            // covered by the inline error with Retry; don't toast it as well.
            if (!detailsStatus) {
              const msg = (err as { message?: string })?.message ?? '';
              toast.error(
                msg
                  ? translateApiError(msg, language)
                  : t('toast.failedToLoadUnitData')
              );
            }
          } finally {
            if (!cancelled) setIsUnitLoading(false);
          }
        }
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? '';
        toast.error(
          msg
            ? translateApiError(msg, language)
            : t('toast.failedToLoadDetails')
        );
      }
    };

    bootstrap().catch((err) => {
      const msg = (err as { message?: string })?.message ?? '';
      toast.error(
        msg ? translateApiError(msg, language) : t('toast.unexpectedError')
      );
    });

    return () => {
      cancelled = true;
      dispatch(clearSimulationDetail());
      dispatch(clearResolvedScenario());
      dispatch(clearSelectedSimulation());
    };
  }, [simulationId, unitRetryKey]);

  const fallbackSim: SimulationDetailType = {
    id: 0,
    title: initialData?.title ?? '',
    subtitle: initialData?.subtitle || '',
    scenarioImage: initialData?.image || '',
    images: initialData?.images,
    unit: initialData?.unit || '',
    category: '', // Category is now derived from avatarEnabled only
    language: initialData?.language || '',
    targetAudience: initialData?.targetAudience,
    difficultyLevel: initialData?.difficulty || '',
    estimatedDuration: initialData?.duration || '',
    purpose: initialData?.purpose || '',
    description: initialData?.description || '',
    learning_objectives: initialData?.learning_objectives,
    developer: initialData?.developer || '',
    institution: initialData?.institution || '',
    last_update: initialData?.last_update || '',
    simulation_privacy: '',
    tries_left: undefined,
    whats_new: undefined,
  };

  const sim: SimulationDetailType = (() => {
    if (isPublic && publicDetail) return publicDetail;
    if (!isPublic && publicDetail && !simulationDetail) return publicDetail;
    if (blobDetail) {
      const base = simulationDetail ?? ({} as SimulationDetailType);
      const blob = blobDetail as unknown as Record<string, unknown>;
      return {
        ...base,
        ...blobDetail,
        scenarioImage:
          blobDetail.scenarioImage ||
          base.scenarioImage ||
          initialData?.image ||
          '',
        images: blobDetail.images?.length
          ? blobDetail.images
          : (base.images ?? initialData?.images),
        unit: blobDetail.unit || base.unit || initialData?.unit || '',
        category: '', // Category is now derived from avatarEnabled only
        language:
          blobDetail.language || base.language || initialData?.language || '',
        image_url:
          blobDetail.image_url || base.image_url || initialData?.image || '',
        estimatedDuration:
          blobDetail.estimatedDuration ||
          (blob.estimated_duration as string | undefined) ||
          (blob.duration as string | undefined) ||
          base.estimatedDuration ||
          initialData?.duration ||
          '',
        targetAudience:
          blobDetail.targetAudience ??
          base.targetAudience ??
          initialData?.targetAudience,
        learning_objectives:
          blobDetail.learning_objectives ??
          base.learning_objectives ??
          initialData?.learning_objectives,
      } as SimulationDetailType;
    }
    return simulationDetail ?? fallbackSim;
  })();

  const screenshots = (sim.images ?? []).filter(
    (src): src is string => typeof src === 'string' && src.trim().length > 0
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
        .filter((value) => value != null && String(value).trim() !== '')
        .map(normalizeKey)
    )
  );

  const isLibraryKey = (key: unknown) => {
    const normalized = normalizeKey(key);
    if (normalizedLibraryIds.has(normalized)) return true;
    return libraryUnits.some((unit) =>
      unit.simulations.some((librarySim) =>
        [librarySim.id, librarySim.simulation_id, librarySim.scenario_id]
          .filter((value) => value != null && String(value).trim() !== '')
          .map(normalizeKey)
          .includes(normalized)
      )
    );
  };
  // Also check against the simulation-library store (populated when navigating from the library page)
  // so the button state is correct immediately using whatever data is already in Redux.
  const isInSimulationLibraryData = librarySimulationsData.some((libSim) =>
    matchKeys.some((k) =>
      [normalizeKey(libSim.id), normalizeKey(libSim.simulation_id)].includes(k)
    )
  );

  const addedToLibrary =
    optimisticInLibrary !== null &&
    optimisticInLibrary.key === librarySimulationId
      ? optimisticInLibrary.value
      : matchKeys.some(isLibraryKey) || isInSimulationLibraryData;

  const libraryActionDisabled = disableLibraryAction || actionInProgress;

  const simRecord = sim as unknown as Record<string, unknown>;

  // avatarEnabled is the sole source of truth for the modality shown.
  const avatarEnabledValue = (sim as unknown as Record<string, unknown>)
    ?.avatarEnabled as boolean | undefined;
  const categoryText =
    avatarEnabledValue === true
      ? t('modalityValue.aiOnly')
      : t('modalityValue.manikin');
  const supportingDocuments = SUPPORTING_DOCUMENTS.filter(
    (document) => !avatarEnabledValue || document.availableForAvatar
  );
  const instructorDocuments = supportingDocuments.filter(
    (document) => document.audience === 'instructor'
  );
  const studentDocuments = supportingDocuments.filter(
    (document) => document.audience === 'student'
  );
  const handleDocumentRequest = async (document: SupportingDocument) => {
    if (generatingDocument) return;

    setGeneratingDocument(document.type);
    try {
      await generateSupportingDocument(document.type, sim, document.filename);
    } catch {
      toast.error(t('documentFailed'));
    } finally {
      setGeneratingDocument(null);
    }
  };
  const rawDifficulty =
    sim.difficultyLevel ||
    (simRecord.difficulty as string | undefined) ||
    (simRecord.difficulty_level as string | undefined) ||
    initialData?.difficulty ||
    '';
  const displayDifficulty = valueLabel(rawDifficulty);
  const rawDuration = sanitizeDurationText(
    sim.estimatedDuration ||
      (simRecord.estimated_duration as string | undefined) ||
      (simRecord.estimated_duration_minutes as string | undefined) ||
      (simRecord.duration as string | undefined) ||
      ((sim.studentBriefing as Record<string, unknown> | undefined)
        ?.time_allotment as string | undefined) ||
      sim.studentBriefing?.timeAllotment ||
      initialData?.duration ||
      ''
  );
  const displayDuration = durationLabel(rawDuration);

  const handleAddToLibrary = async () => {
    const scenarioKey = effectiveScenarioId ?? String(simulationId);

    if (addedToLibrary) {
      setActionInProgress(true);
      setOptimisticInLibrary({ value: false, key: scenarioKey });
      dispatch(addPendingRemoveId(scenarioKey));
      try {
        await dispatch(
          RemoveFromLibraryRequest({ scenario_id: scenarioKey })
        ).unwrap();
        toast.success(t('toast.removedFromLibrary'));
      } catch (err: unknown) {
        const msg =
          typeof err === 'string'
            ? err
            : ((err as { message?: string })?.message ?? '');
        const lower = msg.toLowerCase();
        if (
          lower.includes('not found') ||
          lower.includes('simulation not found')
        ) {
          toast.success(t('toast.removedFromLibrary'));
        } else {
          setOptimisticInLibrary({ value: true, key: scenarioKey });
          dispatch(removePendingRemoveId(scenarioKey));
          toast.error(msg || t('toast.failedToRemove'));
        }
      } finally {
        setActionInProgress(false);
      }
      return;
    }

    if (!effectiveScenarioId) {
      toast.error(t('toast.cannotAddNoScenario'));
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
    const unitId = sim.unit || initialData?.unit || '';
    try {
      await dispatch(
        AddToLibraryRequest({
          scenario_id: effectiveScenarioId,
          unit_id: unitId,
        })
      ).unwrap();
      toast.success(t('toast.addedToLibrary'));
    } catch (err: unknown) {
      const msg =
        typeof err === 'string'
          ? err
          : ((err as { message?: string })?.message ?? '');
      const lower = msg.toLowerCase();
      if (
        !lower.includes('already exists') &&
        !lower.includes('already in library')
      ) {
        setOptimisticInLibrary({ value: false, key: scenarioKey });
        dispatch(removePendingLibraryId(effectiveScenarioId));
        toast.error(msg || t('toast.failedToAdd'));
      } else {
        toast.success(t('toast.addedToLibrary'));
      }
    } finally {
      setActionInProgress(false);
    }
  };

  const sectionGroups = [
    { heading: t('instructorFacing'), documents: instructorDocuments },
    { heading: t('studentFacing'), documents: studentDocuments },
  ].filter((group) => group.documents.length > 0);

  // Each section renders only when it has content; Expand/Collapse All
  // reflects just the sections on screen.
  const sections = [
    {
      visible: Boolean(
        sim.purpose ||
        sim.description ||
        sim.learningObjective ||
        sim.topicsAddressed ||
        sim.learning_objectives?.length
      ),
      open: overviewOpen,
    },
    {
      visible: [
        sim.productName,
        sim.additionalEquipment,
        sim.optionalEquipment,
        sim.setupNotes,
      ].some(Boolean),
      open: additionalDetailsOpen,
    },
    {
      visible: Boolean(
        sim.studentBriefing && Object.values(sim.studentBriefing).some(Boolean)
      ),
      open: studentBriefingOpen,
    },
    {
      visible: Boolean(sim.sbar && Object.values(sim.sbar).some(Boolean)),
      open: sbarOpen,
    },
    {
      visible: !isPublic && sectionGroups.length > 0,
      open: facilitationDocsOpen,
    },
  ];
  const [
    hasOverview,
    hasAdditionalDetails,
    hasStudentBriefing,
    hasSbar,
    hasDocuments,
  ] = sections.map((section) => section.visible);
  const visibleSections = sections.filter((section) => section.visible);
  const allSectionsOpen =
    visibleSections.length > 0 &&
    visibleSections.every((section) => section.open);

  // Until full details arrive from either source, the hero shows the summary
  // the page already had; the sections area shows loading, or an error with
  // Retry once both sources have given up.
  const hasFullDetails = Boolean(
    publicDetail || simulationDetail || blobDetail
  );
  const sectionsState = hasFullDetails
    ? 'ready'
    : detailsStatus === 'loading' || isUnitLoading
      ? 'loading'
      : detailsStatus === 'failed'
        ? 'failed'
        : 'ready';
  const retryDetails = () => {
    onRetryDetails?.();
    setUnitRetryKey((key) => key + 1);
  };

  return (
    <div className="min-h-screen bg-sim-page font-sans text-gray-800">
      <div className="w-full pb-10 space-y-5">
        <div className="relative overflow-hidden rounded-2xl mx-3 sm:mx-5 mt-4 px-6 sm:px-8 lg:px-12 xl:px-16 py-6 sm:py-7 text-white bg-gradient-sim-hero">
          <div
            className="pointer-events-none absolute inset-0 bg-black/10"
            aria-hidden="true"
          />
          {!isPublic && !hideBackButton && (
            <button
              onClick={onBack}
              className="relative flex items-center gap-1 text-sm text-white hover:text-white mb-4 transition-colors [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]"
            >
              <ArrowLeft size={15} />{' '}
              {backLabel ??
                (fromProducts
                  ? t('backToProducts')
                  : fromLibrary
                    ? t('backToLibrary')
                    : t('back'))}
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
                        ? t('library.removeAria')
                        : t('library.addAria')
                    }
                    aria-label={
                      addedToLibrary
                        ? t('library.removeAria')
                        : t('library.addAria')
                    }
                  >
                    <Heart
                      size={18}
                      className="text-white"
                      fill={addedToLibrary ? 'currentColor' : 'none'}
                      strokeWidth={2}
                    />
                  </button>
                )}
              </div>
              {sim.subtitle && (
                <p className="text-sm text-white mt-1 [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]">
                  {sim.subtitle}
                </p>
              )}
              {!isPublic && isStartTrial && (
                <button
                  onClick={() => navigate('/redeem')}
                  className="mt-2 flex items-center gap-2 px-5 py-2 rounded-full bg-white text-sim-navy font-semibold text-sm hover:bg-white/90 transition-colors"
                >
                  {t('activateLicense')}
                </button>
              )}
              <div className="flex gap-3 mt-3 flex-wrap">
                {isPublic ? (
                  <button
                    onClick={() =>
                      navigate('/login', {
                        state: {
                          from: window.location.pathname + window.location.hash,
                        },
                      })
                    }
                    className="flex items-center gap-2 px-5 py-2 rounded-full bg-white text-sim-navy font-semibold text-sm hover:bg-white/90 transition-colors whitespace-nowrap"
                  >
                    {t('library.signInToAdd')}
                  </button>
                ) : (
                  !isStartTrial && (
                    <button
                      onClick={handleAddToLibrary}
                      disabled={libraryActionDisabled}
                      className="flex items-center gap-2 px-5 py-2 rounded-full bg-white text-sim-navy font-semibold text-sm hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {addingToLibrary || removingFromLibrary ? (
                        <span className="w-3.5 h-3.5 border-2 border-sim-navy border-t-transparent rounded-full animate-spin" />
                      ) : null}
                      {disableLibraryAction
                        ? t('library.addedByEducator')
                        : addedToLibrary
                          ? t('library.remove')
                          : t('library.add')}
                    </button>
                  )
                )}
              </div>
            </div>

            {sim.tries_left !== undefined && (
              <div className="flex-shrink-0 w-full md:w-64 border border-amber-300 bg-amber-50 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-amber-600 font-bold text-sm">
                    {t('attention')}
                  </span>
                  <span className="bg-blue-100 text-blue-600 text-xs font-semibold px-3 py-1 rounded-full border border-blue-200">
                    {t('triesLeft', { count: sim.tries_left })}
                  </span>
                </div>
                <p className="text-sm text-gray-700 leading-snug">
                  {t('triesLeftDesc')}
                </p>
              </div>
            )}
          </div>

          <div className="relative mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {(
              [
                { label: t('tiles.modality'), value: categoryText },
                {
                  label: t('tiles.targetAudience'),
                  value: Array.isArray(sim.targetAudience)
                    ? sim.targetAudience.join(', ')
                    : sim.targetAudience || sim.learnerLevel,
                },
                { label: t('tiles.difficulty'), value: displayDifficulty },
                { label: t('tiles.duration'), value: displayDuration },
                { label: t('tiles.clinicalSetting'), value: sim.department },
                { label: t('tiles.unit'), value: sim.unit },
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
                  key={`${i}-${src}`}
                  src={src}
                  alt={t('screenshotAlt', { number: i + 1 })}
                  className="rounded-xl border border-gray-200 shadow-sm h-44 w-auto flex-shrink-0 object-cover"
                />
              ))}
            </div>
          </div>
        )}

        {sectionsState === 'loading' && (
          <div
            role="status"
            aria-label={t('loading')}
            className={cn(SECTION_INSET, 'space-y-5 pt-11')}
          >
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 sm:px-6 py-[18px]"
              >
                <Skeleton className="h-5 w-48" />
              </div>
            ))}
          </div>
        )}

        {sectionsState === 'failed' && (
          <div
            className={cn(
              SECTION_INSET,
              'bg-white rounded-2xl border border-gray-200 shadow-sm'
            )}
          >
            <ErrorState
              title={t('partialError.title')}
              message={t('partialError.body')}
              retryLabel={t('retry')}
              onRetry={retryDetails}
            />
          </div>
        )}

        {sectionsState === 'ready' && (
          <>
            <div className={cn(SECTION_INSET, 'flex justify-end')}>
              <button
                type="button"
                onClick={() => setAllSections(!allSectionsOpen)}
                aria-expanded={allSectionsOpen}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-500 hover:text-primary-600 rounded-full px-3 py-1.5 hover:bg-neutral-active transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
              >
                <ChevronDown
                  size={16}
                  className={cn(
                    'transition-transform duration-200',
                    allSectionsOpen && 'rotate-180'
                  )}
                  aria-hidden="true"
                />
                {allSectionsOpen ? t('collapseAll') : t('expandAll')}
              </button>
            </div>

            {hasOverview && (
              <CollapsibleCard
                title={t('sections.overview')}
                open={overviewOpen}
                onToggle={() => setOverviewOpen((prev) => !prev)}
                className={SECTION_INSET}
              >
                <div className="text-base text-gray-700 leading-relaxed space-y-3 break-words">
                  {sim.purpose && (
                    <p>
                      <strong>{t('overviewFields.purpose')}</strong>{' '}
                      {sim.purpose}
                    </p>
                  )}
                  {sim.description && (
                    <p>
                      <strong>{t('overviewFields.description')}</strong>{' '}
                      {sim.description}
                    </p>
                  )}
                  {sim.learningObjective && (
                    <div>
                      <p className="font-bold text-gray-900 mb-1">
                        {t('overviewFields.learningObjective')}
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
                        {t('overviewFields.learningObjectives')}
                      </h3>
                      <ul className="list-disc list-inside space-y-1">
                        {sim.learning_objectives.map((obj, i) => (
                          <li key={`${i}-${obj}`}>
                            {obj.replace(/^[•\-*]\s*/, '')}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {sim.topicsAddressed && (
                    <div>
                      <p className="font-bold text-gray-900 mb-1">
                        {t('overviewFields.topicsAddressed')}
                      </p>
                      <p className="whitespace-pre-line text-gray-700">
                        {sim.topicsAddressed}
                      </p>
                    </div>
                  )}
                </div>
              </CollapsibleCard>
            )}

            {hasAdditionalDetails && (
              <CollapsibleCard
                title={t('sections.additionalDetails')}
                open={additionalDetailsOpen}
                onToggle={() => setAdditionalDetailsOpen((prev) => !prev)}
                className={SECTION_INSET}
              >
                <div className="grid grid-cols-1 gap-y-5 text-base break-words">
                  {[
                    {
                      label: t('additionalFields.productName'),
                      value: sim.productName,
                    },
                    {
                      label: t('additionalFields.additionalEquipment'),
                      value: sim.additionalEquipment,
                    },
                    {
                      label: t('additionalFields.optionalEquipment'),
                      value: sim.optionalEquipment,
                    },
                    {
                      label: t('additionalFields.setupNotes'),
                      value: sim.setupNotes,
                    },
                  ]
                    .filter((f) => f.value)
                    .map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-sm font-bold text-gray-700 mb-0.5">
                          {label}
                        </p>
                        <p className="text-gray-800 whitespace-pre-line">
                          {value}
                        </p>
                      </div>
                    ))}
                </div>
              </CollapsibleCard>
            )}

            {hasStudentBriefing && sim.studentBriefing && (
              <CollapsibleCard
                title={t('sections.studentBriefing')}
                open={studentBriefingOpen}
                onToggle={() => setStudentBriefingOpen((prev) => !prev)}
                className={SECTION_INSET}
              >
                <div className="space-y-5 text-base text-gray-700 break-words">
                  {[
                    {
                      label: t('briefing.safeEnvironment'),
                      value: sim.studentBriefing.safeEnvironment,
                    },
                    {
                      label: t('briefing.facilitatorSupport'),
                      value: sim.studentBriefing.facilitatorSupport,
                    },
                    {
                      label: t('briefing.orientationSpace'),
                      value: sim.studentBriefing.orientationSpace,
                    },
                    {
                      label: t('briefing.orientationEquipment'),
                      value: sim.studentBriefing.orientationEquipment,
                    },
                    {
                      label: t('briefing.evaluation'),
                      value: sim.studentBriefing.evaluation,
                    },
                    {
                      label: t('briefing.rolesExpectations'),
                      value: sim.studentBriefing.rolesExpectations,
                    },
                    {
                      label: t('briefing.simulationLimitations'),
                      value: sim.studentBriefing.simulationLimitations,
                    },
                    {
                      label: t('briefing.timeAllotment'),
                      value: sim.studentBriefing.timeAllotment,
                    },
                    {
                      label: t('briefing.purpose'),
                      value: sim.studentBriefing.purpose,
                    },
                    {
                      label: t('briefing.learningObjectives'),
                      value: sim.studentBriefing.learningObjectives,
                    },
                    {
                      label: t('briefing.closingReminder'),
                      value: sim.studentBriefing.closingReminder,
                    },
                  ]
                    .filter(
                      (f): f is { label: string; value: string } =>
                        typeof f.value === 'string' && f.value.trim() !== ''
                    )
                    .map(({ label, value }) => (
                      <div
                        key={label}
                        className="rounded-lg border-l-4 border-primary-500 bg-sim-callout px-4 py-3"
                      >
                        <p className="text-sm sm:text-base font-bold uppercase tracking-wide text-primary-500 mb-1">
                          {label}
                        </p>
                        <BulletedText
                          value={value}
                          className="leading-relaxed text-gray-700"
                        />
                      </div>
                    ))}
                </div>
              </CollapsibleCard>
            )}

            {hasSbar && sim.sbar && (
              <CollapsibleCard
                title={t('sections.sbar')}
                open={sbarOpen}
                onToggle={() => setSbarOpen((prev) => !prev)}
                className={SECTION_INSET}
              >
                <div className="space-y-4 text-base text-gray-700 break-words">
                  {[
                    {
                      label: t('sbarFields.situation'),
                      value: sim.sbar.situation,
                    },
                    {
                      label: t('sbarFields.background'),
                      value: sim.sbar.background,
                    },
                    {
                      label: t('sbarFields.assessment'),
                      value: sim.sbar.assessment,
                    },
                    {
                      label: t('sbarFields.recommendation'),
                      value: sim.sbar.recommendation,
                    },
                  ]
                    .filter(
                      (f): f is { label: string; value: string } =>
                        typeof f.value === 'string' && f.value.trim() !== ''
                    )
                    .map(({ label, value }) => (
                      <div
                        key={label}
                        className="rounded-lg border-l-4 border-primary-500 bg-sim-callout px-4 py-3"
                      >
                        <p className="text-sm sm:text-base font-bold uppercase tracking-wide text-primary-500 mb-1">
                          {label}
                        </p>
                        <BulletedText
                          value={value}
                          className="leading-relaxed text-gray-700"
                        />
                      </div>
                    ))}
                </div>
              </CollapsibleCard>
            )}

            {hasDocuments && (
              <CollapsibleCard
                title={t('sections.facilitationDocuments')}
                open={facilitationDocsOpen}
                onToggle={() => setFacilitationDocsOpen((prev) => !prev)}
                className={SECTION_INSET}
              >
                <div className="space-y-5">
                  {sectionGroups.map((group) => (
                    <section key={group.heading} aria-label={group.heading}>
                      <h3 className="text-sm sm:text-base font-bold uppercase tracking-wide text-neutral-strong mb-2">
                        {group.heading}
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 text-sm items-stretch">
                        {group.documents.map((document) => {
                          const isGenerating =
                            generatingDocument === document.type;
                          return (
                            <button
                              key={document.type}
                              type="button"
                              onClick={() =>
                                void handleDocumentRequest(document)
                              }
                              disabled={generatingDocument !== null}
                              className="group flex items-start gap-2.5 h-full text-left bg-neutral-active border border-gray-300 hover:border-primary-400 rounded-xl px-4 py-3 font-medium cursor-pointer transition-all hover:shadow-md disabled:cursor-wait disabled:opacity-60"
                            >
                              {isGenerating ? (
                                <Loader2
                                  className="w-5 h-5 flex-shrink-0 mt-0.5 text-primary-500 animate-spin"
                                  aria-hidden="true"
                                />
                              ) : (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="w-5 h-5 flex-shrink-0 mt-0.5 text-primary-500"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                </svg>
                              )}
                              <span className="text-neutral-strong group-hover:underline break-words min-w-0">
                                {isGenerating
                                  ? t('preparingPdf')
                                  : t(document.labelKey)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </CollapsibleCard>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SimulationDetail;
