import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { getApiBase } from '@/utils/apiBase';

const NGROK_HEADERS = { 'ngrok-skip-browser-warning': 'true' };

interface DeepLinkingContext {
  schoolId: string;
  courseTitle: string | null;
  deepLinkingSettings: {
    deep_link_return_url: string;
    accept_types: string[];
    accept_multiple?: boolean;
    data?: string;
  };
}

interface Simulation {
  id: string;
  title: string;
  maxScore?: number;
  estimatedDuration?: string | null;
  difficulty?: string | null;
  learnerLevel?: string | null;
  purpose?: string | null;
}

const META_FIELDS = [
  ['estimatedDuration', 'duration'],
  ['difficulty', 'difficulty'],
  ['learnerLevel', 'audience'],
  ['purpose', 'context'],
] as const;

type DeepLinkingPickerStatus =
  'ready' | 'course_not_linked' | 'no_simulations_assigned';

function getEmptyStateMessage(status: DeepLinkingPickerStatus): {
  title: string;
  body: string;
} {
  if (status === 'course_not_linked') {
    return {
      title: 'Course not linked yet',
      body: 'Open the RealityWorks educator setup activity in this LMS course first to sync the class and roster. Then assign simulations in RealityWorks and return here to add simulation activities.',
    };
  }
  if (status === 'no_simulations_assigned') {
    return {
      title: 'No simulations assigned yet',
      body: 'This course is linked, but no simulations are assigned to the class in RealityWorks yet. Assign simulations in the educator app, then reopen this picker.',
    };
  }
  return {
    title: 'No simulations available',
    body: 'No simulations are available for this course.',
  };
}

/**
 * Deep Linking picker page - embedded in LMS for content selection
 * NO navigation, NO layout - just the picker UI
 */
export default function DeepLinkingPickerPage() {
  const { t } = useTranslation('classManagement');
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<DeepLinkingContext | null>(null);
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [pickerStatus, setPickerStatus] =
    useState<DeepLinkingPickerStatus>('ready');
  const [selectedSims, setSelectedSims] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!code) {
      setError('Missing session code');
      setLoading(false);
      return;
    }

    const fetchContext = async () => {
      try {
        const res = await axios.post(
          `${getApiBase()}/api/lti/deep-linking/exchange`,
          { code },
          { withCredentials: true, headers: NGROK_HEADERS }
        );

        // Guard against missing or partial deepLinkingSettings
        if (!res.data?.deepLinkingSettings) {
          setError('Invalid Deep Linking configuration');
          setLoading(false);
          return;
        }

        setContext(res.data);

        // Fetch simulations using the same code (backend session is NOT consumed by exchange)
        const simsRes = await axios.get(
          `${getApiBase()}/api/lti/deep-linking/simulations?code=${encodeURIComponent(code)}`,
          { withCredentials: true, headers: NGROK_HEADERS }
        );
        setSimulations(simsRes.data?.simulations || []);
        setPickerStatus(simsRes.data?.status || 'ready');
      } catch {
        setError('Failed to load picker context');
      } finally {
        setLoading(false);
      }
    };

    fetchContext();
  }, [code]);

  const handleToggleSimulation = (simId: string) => {
    const newSet = new Set(selectedSims);

    // For single-select mode (radio), always replace selection
    if (!context?.deepLinkingSettings.accept_multiple) {
      if (newSet.has(simId)) {
        // Already selected - keep it selected (radio behavior)
        return;
      }
      newSet.clear();
      newSet.add(simId);
    } else {
      // Multi-select mode (checkbox) - toggle as before
      if (newSet.has(simId)) {
        newSet.delete(simId);
      } else {
        newSet.add(simId);
      }
    }

    setSelectedSims(newSet);
  };

  const handleSubmit = async () => {
    if (!code || selectedSims.size === 0) return;

    setSubmitting(true);
    try {
      const selections = simulations
        .filter((s) => selectedSims.has(s.id))
        .map((s) => ({
          simulationId: s.id,
          title: s.title,
          scoreMaximum: s.maxScore ?? 100,
        }));

      const res = await axios.post(
        `${getApiBase()}/api/lti/deep-linking/submit`,
        { code, selections },
        { withCredentials: true, responseType: 'text', headers: NGROK_HEADERS }
      );

      // Response is an HTML form that auto-submits to the LMS
      // Write it to the document to trigger submission
      document.open();
      document.write(res.data);
      document.close();
    } catch {
      setError('Failed to submit selections');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          padding: '3rem 2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          color: '#555',
        }}
      >
        <div
          role="status"
          aria-label="Loading"
          style={{
            width: '2.5rem',
            height: '2.5rem',
            border: '3px solid #e0e0e0',
            borderTopColor: '#1976d2',
            borderRadius: '50%',
            animation: 'rw-spin 0.75s linear infinite',
          }}
        />
        <p style={{ margin: 0 }}>Loading content picker...</p>
        <style>
          {'@keyframes rw-spin { to { transform: rotate(360deg); } }'}
        </style>
      </div>
    );
  }

  if (error || !context) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>
        <p>{error || 'Failed to load picker'}</p>
      </div>
    );
  }

  const emptyState = getEmptyStateMessage(pickerStatus);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleSims = simulations.filter((sim) =>
    sim.title.toLowerCase().includes(normalizedQuery)
  );

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Select Simulations for {context.courseTitle || 'your course'}</h2>
      <p style={{ marginBottom: '1.5rem', color: '#666' }}>
        {context.deepLinkingSettings.accept_multiple
          ? 'Select one or more simulations to add to your course.'
          : 'Select one simulation to add to your course.'}
      </p>

      {simulations.length === 0 ? (
        <div
          style={{
            padding: '1rem 1.25rem',
            borderRadius: '8px',
            background: '#fff8e1',
            border: '1px solid #ffe082',
            color: '#5d4037',
            lineHeight: 1.5,
            marginBottom: '1.5rem',
          }}
        >
          <strong
            style={{
              display: 'block',
              marginBottom: '0.35rem',
              color: '#3e2723',
            }}
          >
            {emptyState.title}
          </strong>
          {emptyState.body}
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            marginBottom: '2rem',
          }}
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('deepLinkingPicker.searchPlaceholder')}
            aria-label={t('deepLinkingPicker.searchPlaceholder')}
            style={{
              padding: '0.625rem 0.75rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              font: 'inherit',
            }}
          />
          {visibleSims.length === 0 && (
            <p style={{ color: '#666', margin: 0 }}>
              {t('deepLinkingPicker.noMatches')}
            </p>
          )}
          {visibleSims.map((sim) => (
            <label
              key={sim.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                padding: '1rem',
                border: '2px solid',
                borderColor: selectedSims.has(sim.id) ? '#1976d2' : '#e0e0e0',
                borderRadius: '8px',
                cursor: 'pointer',
                backgroundColor: selectedSims.has(sim.id) ? '#f0f8ff' : '#fff',
              }}
            >
              <input
                type={
                  context.deepLinkingSettings.accept_multiple
                    ? 'checkbox'
                    : 'radio'
                }
                name={
                  context.deepLinkingSettings.accept_multiple
                    ? undefined
                    : 'simulation'
                }
                checked={selectedSims.has(sim.id)}
                onChange={() => handleToggleSimulation(sim.id)}
                style={{ marginRight: '1rem', marginTop: '0.2rem' }}
              />
              <span>
                <span style={{ fontWeight: 500 }}>{sim.title}</span>
                {META_FIELDS.some(([field]) => sim[field]) && (
                  <dl
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.25rem 1.25rem',
                      margin: '0.375rem 0 0',
                      fontSize: '0.875rem',
                      color: '#555',
                    }}
                  >
                    {META_FIELDS.filter(([field]) => sim[field]).map(
                      ([field, label]) => (
                        <div
                          key={field}
                          style={{ display: 'flex', gap: '0.25rem' }}
                        >
                          <dt style={{ fontWeight: 600 }}>
                            {t(`deepLinkingPicker.fields.${label}`)}:
                          </dt>
                          <dd style={{ margin: 0 }}>{sim[field]}</dd>
                        </div>
                      )
                    )}
                  </dl>
                )}
              </span>
            </label>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button
          onClick={handleSubmit}
          disabled={selectedSims.size === 0 || submitting}
          style={{
            padding: '0.75rem 2rem',
            backgroundColor: selectedSims.size > 0 ? '#1976d2' : '#ccc',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 500,
            cursor: selectedSims.size > 0 ? 'pointer' : 'not-allowed',
          }}
        >
          {submitting
            ? 'Submitting...'
            : `Add to Course (${selectedSims.size})`}
        </button>
      </div>
    </div>
  );
}
