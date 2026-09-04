import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import {
  useAdminSetupProgress,
  type SetupStepKey,
} from '../../hooks/useAdminSetupProgress';

/**
 * First-time admin setup journey tracker.
 *
 * Anchored to the top of the five admin pages (Dashboard, Schools, Educators,
 * LMS Integration, Account) until the org is set up. Realityworks AI brand
 * palette + gradient only — no healthcare mint/teal/navy. Typography follows the
 * brand stack (Neulis Sans → Apotos → system).
 */

const ORANGE = '#db8833';
const GREY = '#e9e9e9';
const DARK = '#5f6060';
const WHITE = '#ffffff';
const FONT = '"Neulis Sans", "Apotos", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

type Selected = 'start' | SetupStepKey | 'finish';

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

export default function AdminSetupTracker() {
  const p = useAdminSetupProgress();
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

  // ---- stone rendering -----------------------------------------------------
  type Stone =
    | { kind: 'start' }
    | { kind: 'step'; key: SetupStepKey; index: number; done: boolean; current: boolean }
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

  const renderStone = (stone: Stone, i: number) => {
    const connectorBefore =
      i === 0 ? null : (
        <span
          aria-hidden="true"
          style={{
            flex: '1 1 16px', minWidth: 16, height: 2, borderRadius: 2,
            // align the line to the vertical middle of the 42px circles
            marginTop: 20, alignSelf: 'flex-start',
            background: stones[i - 1] && 'done' in stones[i - 1] && (stones[i - 1] as { done?: boolean }).done ? ORANGE
              : stones[i - 1].kind === 'start' ? ORANGE : GREY,
          }}
        />
      );

    let circle: React.ReactNode;
    let caption = '';
    let onClick: (() => void) | undefined;
    let ariaLabel = '';

    if (stone.kind === 'start') {
      circle = <CheckIcon />;
      caption = 'Start';
      ariaLabel = 'Setup started — account created';
    }

    const base: React.CSSProperties = {
      width: 42, height: 42, borderRadius: '999px', display: 'grid', placeItems: 'center',
      fontWeight: 700, fontSize: 15, flex: '0 0 auto', cursor: 'default',
      transition: 'box-shadow .18s ease',
    };

    if (stone.kind === 'start') {
      const isSelected = resolved === 'start';
      return (
        <div key="start" style={{ display: 'contents' }}>
          {connectorBefore}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={() => setSelected('start')}
              aria-label={ariaLabel}
              aria-current={isSelected ? 'step' : undefined}
              style={{
                ...base, ...stoneStyle('done'), cursor: 'pointer',
                boxShadow: isSelected ? `inset 0 0 0 2px ${DARK}` : 'none',
              }}
            >
              {circle}
            </button>
            <span style={{ fontSize: 11, color: DARK, fontWeight: isSelected ? 700 : 600, userSelect: 'none' }}>{caption}</span>
          </div>
        </div>
      );
    }

    if (stone.kind === 'step') {
      const state = stone.done ? 'done' : stone.current ? 'current' : 'upcoming';
      onClick = () => setSelected(stone.key);
      const isSelected = resolved === stone.key;
      return (
        <div key={stone.key} style={{ display: 'contents' }}>
          {connectorBefore}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={onClick}
              aria-label={`Step ${stone.index}${stone.done ? ' (done)' : ''}`}
              aria-current={isSelected ? 'step' : undefined}
              style={{
                ...base, ...stoneStyle(state), cursor: 'pointer',
                boxShadow: isSelected ? `inset 0 0 0 2px ${DARK}` : 'none',
              }}
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
            style={{
              ...base, ...stoneStyle(state), cursor: 'pointer',
              boxShadow: isSelected ? `inset 0 0 0 2px ${DARK}` : 'none',
            }}
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
        style={{
          color: WHITE, padding: '12px 24px',
          display: 'flex', alignItems: 'center', gap: 16,
        }}
      >
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '.01em' }}>
            {p.allGatesDone ? 'Your organization is set up' : 'Account and Organization Set Up Guide'}
          </div>
          <div style={{ fontSize: 12.5, opacity: 0.95, marginTop: 2 }}>
            {p.allGatesDone
              ? 'Nice work — you can hide this guide anytime.'
              : `${p.completedCount} of ${p.totalSteps} steps complete`}
          </div>
        </div>

        {/* slim progress track */}
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
          <div
            style={{
              marginTop: 16, border: `1px solid ${GREY}`, borderRadius: 12,
              background: WHITE, padding: '16px 18px',
            }}
          >
            {activeStep ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', color: ORANGE }}>
                  {activeStep.label}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.55, color: DARK }}>
                  {activeStep.instructions}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
                  <Button
                    variant="gradient"
                    className="w-[260px] h-[48px]"
                    onClick={() => {
                      if (activeStep.key === 'lms') p.setLmsDecision('connect');
                      goTo(activeStep.route);
                    }}
                  >
                    {activeStep.cta}
                  </Button>
                  {activeStep.optionalChoice && (
                    <Button variant="outline" size="lg" className="font-semibold w-[260px] h-[48px]" onClick={() => p.setLmsDecision('skip')}>
                      Skip this, we&rsquo;re not doing it
                    </Button>
                  )}
                </div>
              </>
            ) : resolved === 'start' ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', color: ORANGE }}>
                  START · CREATE ADMIN ACCOUNT &amp; ENTER ACTIVATION CODE
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.55, color: DARK }}>
                  Create admin account and enter activation code. This first step is complete — you&rsquo;re
                  signed in with an activated account.
                </p>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', color: ORANGE }}>
                  STEP 5 · FINISH
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.55, color: DARK }}>
                  Use the Dashboard tab to see usage details at a high level. Use the Products tab to see
                  more details on the products you are using and entitled to. Revisit the other tabs to add or
                  adjust schools or educators anytime it is necessary.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
                  <Button variant="gradient" className="w-[220px]" onClick={() => goTo('/admin-dashboard')}>
                    Go to Dashboard
                  </Button>
                  <Button variant="gradient" className="w-[220px]" onClick={() => goTo('/products')}>
                    Go to Products
                  </Button>
                  {p.allGatesDone && (
                    <Button variant="outline" size="lg" className="font-semibold" onClick={p.dismiss}>
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
