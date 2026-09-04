import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import {
  useEducatorSetupProgress,
  type EducatorStepKey,
} from '../../hooks/useEducatorSetupProgress';

/**
 * First-time EDUCATOR setup journey tracker — the educator-portal sibling of
 * {@link AdminSetupTracker}, matching its style exactly (Realityworks AI brand
 * palette + gradient, brand typography). Anchored to the top of the educator
 * surfaces (Dashboard, Class Management, Simulation Library, Simulation Catalog,
 * Account) until the guide is walked or dismissed.
 */

const ORANGE = '#db8833';
const GREY = '#e9e9e9';
const DARK = '#5f6060';
const WHITE = '#ffffff';
const FONT =
  '"Neulis Sans", "Apotos", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

type Selected = 'start' | EducatorStepKey | 'finish';

function CheckIcon({ color = WHITE, size = 18 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.2 4.2L19 7" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FlagIcon({ color = DARK, size = 18 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6.5 21V4.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M6.5 5H17l-2.6 3.2L17 11.5H6.5z" fill={color} />
    </svg>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: '8px 0 0', paddingLeft: 20, listStyleType: 'disc' }}>
      {items.map((t, i) => (
        <li key={i} style={{ fontSize: 14, lineHeight: 1.55, color: DARK, marginBottom: 6 }}>
          {t}
        </li>
      ))}
    </ul>
  );
}

function Chevron({ up }: { up: boolean }) {
  return (
    <svg
      width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      style={{ transform: up ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform .18s ease' }}
    >
      <path d="M6 15l6-6 6 6" stroke={WHITE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function EducatorSetupTracker() {
  const p = useEducatorSetupProgress();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);

  if (!p.visible) return null;

  const firstIncomplete = p.steps.find((s) => !s.done);
  const resolved: Selected = selected ?? (p.allGatesDone ? 'finish' : firstIncomplete?.key ?? 'finish');
  const activeStep =
    resolved === 'finish' || resolved === 'start'
      ? null
      : p.steps.find((s) => s.key === resolved) ?? null;

  const goTo = (route: string) => navigate(route);

  type Stone =
    | { kind: 'start' }
    | { kind: 'step'; key: EducatorStepKey; index: number; done: boolean; current: boolean }
    | { kind: 'finish'; done: boolean; current: boolean };

  const stones: Stone[] = [
    { kind: 'start' },
    ...p.steps.map((s) => ({
      kind: 'step' as const,
      key: s.key,
      index: s.index,
      done: s.done,
      current: !p.allGatesDone && firstIncomplete?.key === s.key,
    })),
    { kind: 'finish', done: p.allGatesDone, current: p.allGatesDone },
  ];

  const stoneStyle = (state: 'done' | 'current' | 'upcoming'): React.CSSProperties => {
    if (state === 'done') return { background: ORANGE, color: WHITE, border: `2px solid ${ORANGE}` };
    if (state === 'current') return { background: WHITE, color: ORANGE, border: `2px solid ${ORANGE}` };
    return { background: GREY, color: DARK, border: `2px solid ${GREY}` };
  };

  const base: React.CSSProperties = {
    width: 42, height: 42, borderRadius: '999px', display: 'grid', placeItems: 'center',
    fontWeight: 700, fontSize: 15, flex: '0 0 auto', transition: 'box-shadow .18s ease',
  };

  const renderStone = (stone: Stone, i: number) => {
    const connectorBefore =
      i === 0 ? null : (
        <span
          aria-hidden="true"
          style={{
            flex: '1 1 16px', minWidth: 16, height: 2, borderRadius: 2,
            marginTop: 20, alignSelf: 'flex-start',
            background: stones[i - 1] && 'done' in stones[i - 1] && (stones[i - 1] as { done?: boolean }).done ? ORANGE
              : stones[i - 1].kind === 'start' ? ORANGE : GREY,
          }}
        />
      );

    if (stone.kind === 'start') {
      const isSelected = resolved === 'start';
      return (
        <div key="start" style={{ display: 'contents' }}>
          {connectorBefore}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={() => setSelected('start')}
              aria-label="Setup started — account activated"
              aria-current={isSelected ? 'step' : undefined}
              style={{ ...base, ...stoneStyle('done'), cursor: 'pointer', boxShadow: isSelected ? `inset 0 0 0 2px ${DARK}` : 'none' }}
            >
              <CheckIcon />
            </button>
            <span style={{ fontSize: 11, color: DARK, fontWeight: isSelected ? 700 : 600, userSelect: 'none' }}>Start</span>
          </div>
        </div>
      );
    }

    if (stone.kind === 'step') {
      const state = stone.done ? 'done' : stone.current ? 'current' : 'upcoming';
      const isSelected = resolved === stone.key;
      return (
        <div key={stone.key} style={{ display: 'contents' }}>
          {connectorBefore}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={() => setSelected(stone.key)}
              aria-label={`Step ${stone.index}${stone.done ? ' (done)' : ''}`}
              aria-current={isSelected ? 'step' : undefined}
              style={{ ...base, ...stoneStyle(state), cursor: 'pointer', boxShadow: isSelected ? `inset 0 0 0 2px ${DARK}` : 'none' }}
            >
              {stone.done ? <CheckIcon /> : stone.index}
            </button>
            <span style={{ fontSize: 11, color: DARK, fontWeight: isSelected ? 700 : 500 }}>Step {stone.index}</span>
          </div>
        </div>
      );
    }

    // finish
    const state = stone.done ? 'done' : 'upcoming';
    const isSelected = resolved === 'finish';
    return (
      <div key="finish" style={{ display: 'contents' }}>
        {connectorBefore}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={() => setSelected('finish')}
            aria-label="Finish"
            aria-current={isSelected ? 'step' : undefined}
            style={{ ...base, ...stoneStyle(state), cursor: 'pointer', boxShadow: isSelected ? `inset 0 0 0 2px ${DARK}` : 'none' }}
          >
            {stone.done ? <CheckIcon /> : <FlagIcon />}
          </button>
          <span style={{ fontSize: 11, color: DARK, fontWeight: 500 }}>Finish</span>
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'sticky', top: 0, zIndex: 30, background: WHITE,
        borderBottom: `1px solid ${GREY}`, fontFamily: FONT,
        boxShadow: '0 2px 10px rgba(95,96,96,0.06)',
      }}
    >
      {/* Gradient accent header — same `gradient-btn` utility the app buttons use */}
      <div
        className="bg-gradient-btn"
        style={{ color: WHITE, padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16 }}
      >
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '.01em' }}>
            {p.allGatesDone ? "You're all set up" : 'Educator Set Up Guide'}
          </div>
          <div style={{ fontSize: 12.5, opacity: 0.95, marginTop: 2 }}>
            {p.allGatesDone
              ? 'Nice work — you can hide this guide anytime.'
              : `${p.completedCount} of ${p.totalSteps} steps complete`}
          </div>
        </div>

        <div
          aria-hidden="true"
          style={{ width: 140, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.35)', overflow: 'hidden', flex: '0 0 auto' }}
        >
          <div style={{ width: `${(p.completedCount / p.totalSteps) * 100}%`, height: '100%', background: WHITE, borderRadius: 999, transition: 'width .25s ease' }} />
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand setup guide' : 'Collapse setup guide'}
          aria-expanded={!collapsed}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}
        >
          <Chevron up={!collapsed} />
        </button>
      </div>

      {!collapsed && (
        <div style={{ padding: '18px 24px 20px' }}>
          {/* stepping stones */}
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 620, padding: '10px 2px' }}>
              {stones.map((s, i) => renderStone(s, i))}
            </div>
          </div>

          {/* detail panel */}
          <div style={{ marginTop: 16, border: `1px solid ${GREY}`, borderRadius: 12, background: WHITE, padding: '16px 18px' }}>
            {activeStep ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', color: ORANGE }}>
                  {activeStep.label}
                </div>
                <Bullets items={activeStep.instructions} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
                  <Button variant="gradient" className="w-[260px] h-[48px]" onClick={() => goTo(activeStep.route)}>
                    {activeStep.cta}
                  </Button>
                </div>
              </>
            ) : resolved === 'start' ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', color: ORANGE }}>
                  START · ACCEPT ACCOUNT INVITATION
                </div>
                <Bullets
                  items={[
                    'Accept your educator account via the emailed invitation and set up your account password. This first step is complete — you’re signed in with an activated account.',
                  ]}
                />
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', color: ORANGE }}>
                  FINISH
                </div>
                <Bullets
                  items={[
                    'Use the Dashboard tab to get an overview of activity and see usage totals.',
                    "Use the Class Management tab to see more details on each of your classes' performance or manage simulation assignments.",
                    'Revisit the other tabs to browse the simulation catalog or your simulation library anytime.',
                  ]}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
                  <Button variant="gradient" className="w-[220px]" onClick={() => goTo('/educator-dashboard')}>
                    Go to Dashboard
                  </Button>
                  <Button variant="gradient" className="w-[220px]" onClick={() => goTo('/classes')}>
                    Go to Class Management
                  </Button>
                  {p.allGatesDone && (
                    <Button variant="outline" className="font-semibold rounded-full px-6" onClick={p.dismiss}>
                      Got it — hide this guide
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
