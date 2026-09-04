import { useEffect, useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import SimulationDetailComponent from '@/components/simulation/Simulationdetail';
import type { SectionItem, SimulationDetail } from '../../../types/index';
import { normalizeToSimulationDetail } from '@/utils/normalizeSectionItem';
import axios from 'axios';
import config from '@/redux/config';
import { selectSimulationLibraryData } from '@/redux/dashboard/simulationlibrary/GetSimulationRedux';
import { setLoading } from '@/redux/loader/loaderSlice';

const publicApi = axios.create({ withCredentials: false });

interface LocationState {
  simulationId?: string | number;
  initialData?: SectionItem;
  fromLibrary?: boolean;
  fromProducts?: boolean;
  fromClasses?: boolean;
  classId?: string;
  expandType?: 'students' | 'sims' | 'reports';
  fromAdminAssignedNotification?: boolean;
  backTo?: string;
}

function decodeHashData(hash: string): SectionItem | null {
  try {
    if (!hash.startsWith('#data=')) return null;
    const encoded = hash.slice(6);
    const decoded = JSON.parse(decodeURIComponent(atob(encoded)));
    if (!decoded || typeof decoded.title !== 'string') return null;
    return decoded as SectionItem;
  } catch {
    return null;
  }
}

interface Props {
  isPublic?: boolean;
}

const SimulationDetail = ({ isPublic = false }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const { simulationId: paramId } = useParams<{ simulationId: string }>();
  const blobDetail = useAppSelector((state) => state.simulationCatalog.selectedItem);
  const librarySimulations = useAppSelector(selectSimulationLibraryData);
  const state = (location.state ?? {}) as LocationState;
  const query = new URLSearchParams(location.search);
  const isAdminAssignedNotificationFlow =
    state.fromAdminAssignedNotification === true ||
    query.get('source') === 'admin-assigned-notification';

  const [fetchedData, setFetchedData] = useState<SectionItem | null>(null);
  const [fetchedDetail, setFetchedDetail] = useState<SimulationDetail | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [richDataLoading, setRichDataLoading] = useState(isAdminAssignedNotificationFlow);

  useEffect(() => {
    if (!isAdminAssignedNotificationFlow) return;
    dispatch(setLoading(true));
    return () => {
      dispatch(setLoading(false));
    };
  }, [isAdminAssignedNotificationFlow]);

  useEffect(() => {
    if (!isAdminAssignedNotificationFlow) return;
    if (!richDataLoading) {
      dispatch(setLoading(false));
    }
  }, [richDataLoading, isAdminAssignedNotificationFlow]);

  const [hashData] = useState<SectionItem | null>(() =>
    typeof window !== 'undefined' ? decodeHashData(window.location.hash) : null,
  );

  const fallbackInitialData: SectionItem | null = blobDetail
    ? {
      id: blobDetail.id,
      scenarioId: String(paramId ?? blobDetail.id),
      title: blobDetail.title,
      image: blobDetail.scenarioImage || blobDetail.image_url || '',
      cta: '',
      unit: blobDetail.unit,
      category: undefined, // Category is now derived from avatarEnabled only
      language: blobDetail.language,
      targetAudience: blobDetail.targetAudience,
      difficulty: blobDetail.difficultyLevel,
      duration: blobDetail.estimatedDuration,
      description: blobDetail.description,
      purpose: blobDetail.purpose,
      learning_objectives: blobDetail.learning_objectives,
      developer: blobDetail.developer,
      institution: blobDetail.institution,
      last_update: blobDetail.last_update,
    }
    : null;

  const libraryMatch = librarySimulations.find(
    (sim) =>
      String(sim.simulation_id ?? sim.id ?? '') === String(paramId ?? '') ||
      String(sim.id ?? '') === String(paramId ?? ''),
  );

  const libraryFallbackData: SectionItem | null = libraryMatch
    ? {
      id: Number.isFinite(Number(libraryMatch.id)) ? Number(libraryMatch.id) : 0,
      scenarioId: String(libraryMatch.simulation_id ?? libraryMatch.id ?? ''),
      title: String(libraryMatch.title ?? libraryMatch.name ?? ''),
      image: String(libraryMatch.image ?? ''),
      cta: 'View',
      unit: String(libraryMatch.unit ?? ''),
      category: undefined, // Category is now derived from avatarEnabled only
      description: String(libraryMatch.description ?? ''),
      difficulty: String(libraryMatch.difficulty ?? ''),
      duration: String(libraryMatch.duration ?? ''),
      targetAudience:
        typeof libraryMatch.targetAudience === 'string' && libraryMatch.targetAudience.trim().length > 0
          ? [libraryMatch.targetAudience]
          : typeof libraryMatch.learnerLevel === 'string' && libraryMatch.learnerLevel.trim().length > 0
            ? [libraryMatch.learnerLevel]
            : undefined,
    }
    : null;

  const resolvedId = state.simulationId ?? paramId ?? '';
  const resolvedInitialData =
    state.initialData ?? libraryFallbackData ?? fallbackInitialData ?? hashData ?? fetchedData;
  const handleBack = () => {
    if (isAdminAssignedNotificationFlow) {
      if (state.backTo) {
        navigate(state.backTo);
      } else if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate('/schools');
      }
      return;
    }

    if (state.fromClasses) {
      navigate('/classes', {
        state: {
          classId: state.classId,
          expandType: state.expandType ?? 'sims',
          simulationId: state.simulationId != null ? String(state.simulationId) : undefined,
        },
      });
      return;
    }

    navigate(state.fromProducts ? '/products' : state.fromLibrary ? '/simulationlibrary' : isPublic ? '/login' : '/simulation-catalog');
  };

  useEffect(() => {
    if (!paramId) return;

    let cancelled = false;

    const fetchRichData = async () => {
      try {
        const titleHint = hashData?.title ?? '';
        const url = `${config.SimulationCatalogDetailAPI}/scenario/${encodeURIComponent(paramId)}/public`
          + (titleHint ? `?title=${encodeURIComponent(titleHint)}` : '');
        const res = await publicApi.get(url, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        if (cancelled) return;

        const raw = res.data?.data ?? null;
        if (raw && typeof raw === 'object') {
          const fallback: SectionItem = {
            id: 0,
            scenarioId: paramId,
            title: String(raw.title ?? ''),
            image: String(raw.scenarioImage ?? raw.image_url ?? ''),
            cta: 'View',
          };
          if (!resolvedInitialData) setFetchedData(fallback);
          setFetchedDetail(normalizeToSimulationDetail(raw as Parameters<typeof normalizeToSimulationDetail>[0], paramId, fallback));
        } else {
          if (!resolvedInitialData) setFetchError(true);
        }
      } catch {
        if (!cancelled && !resolvedInitialData) setFetchError(true);
      } finally {
        if (!cancelled) setRichDataLoading(false);
      }
    };

    fetchRichData();
    return () => { cancelled = true; };
  }, [paramId]);

  if (richDataLoading) return null;

  if (!resolvedInitialData && !fetchError) {
    return (
      <div className="min-h-screen bg-[#f5f4ef] flex items-center justify-center">
        <span className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (fetchError && !resolvedInitialData && !richDataLoading) {
    return (
      <div className="min-h-screen bg-[#f5f4ef] flex flex-col items-center justify-center gap-4">
        <p className="text-gray-600 text-lg">Simulation not found.</p>
        <button
          onClick={() => navigate('/simulation-catalog')}
          className="px-4 py-2 bg-primary-500 text-white rounded hover:bg-primary-600"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <>
      <SimulationDetailComponent
        simulationId={resolvedId}
        initialData={resolvedInitialData!}
        publicDetail={fetchedDetail}
        onBack={handleBack}
        isPublic={isPublic}
        hideBackButton={false}
        backLabel={
          isAdminAssignedNotificationFlow
            ? 'Back'
            : state.fromClasses
              ? 'Back to Class Management'
              : undefined
        }
        fromLibrary={state.fromLibrary === true}
        fromProducts={state.fromProducts === true}
        disableLibraryAction={isAdminAssignedNotificationFlow}
      />
    </>
  );
};

export default SimulationDetail;
