import { createPortal } from 'react-dom';
import { useEffect, useRef } from 'react';
import { useScrollLock } from '../../../hooks/useScrollLock';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { type SimulationItem } from '@/types';

interface Props {
  sim: SimulationItem;
  onClose: () => void;
}

const scoreData = [
  { range: '0-20', count: 2 },
  { range: '21-40', count: 5 },
  { range: '41-60', count: 13 },
  { range: '61-80', count: 35 },
  { range: '81-100', count: 27 },
];

const trendData = [
  { day: 'Day 1', rate: 18 },
  { day: 'Day 3', rate: 32 },
  { day: 'Day 5', rate: 45 },
  { day: 'Day 7', rate: 58 },
  { day: 'Day 10', rate: 70 },
  { day: 'Day 14', rate: 78 },
];

export default function AIInsightsModal({ onClose }: Props) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Lock background scrolling while this modal is mounted.
  useScrollLock(true);

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    const focusableSelectors =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const getFocusable = () =>
      Array.from(
        modal.querySelectorAll<HTMLElement>(focusableSelectors)
      ).filter((el) => !el.hasAttribute('disabled'));

    const els = getFocusable();
    if (els.length) els[0].focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      if (modal && !modal.contains(e.target as Node)) {
        e.stopPropagation();
        const focusable = getFocusable();
        if (focusable.length) focusable[0].focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn, true);
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="AI Generated Insights"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[min(calc(100vh-2rem),calc(100dvh-2rem))]"
      >
        <div className="px-6 sm:px-8 pt-8 pb-4 shrink-0 flex items-center justify-between">
          <h2 className="text-xl font-bold text-orange-500">
            AI Generated Insights
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            aria-label="Close"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 sm:px-8 pb-4">
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { value: '81%', label: 'Avg Score' },
              { value: '80%', label: 'Completion Rate' },
              { value: '42 min', label: 'Avg Time Spent' },
              { value: '94%', label: 'AI Confidence' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col items-center justify-center border border-gray-200 rounded-xl py-4 px-2 gap-1"
              >
                <span className="text-orange-500 font-bold text-lg leading-tight">
                  {stat.value}
                </span>
                <span className="text-gray-400 text-xs text-center">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>

          <div className="bg-orange-50 border border-orange-100 rounded-xl px-5 py-4 mb-6">
            <p className="text-sm font-semibold text-orange-500 mb-3 flex items-center gap-2">
              AI Generated Insights
            </p>
            <ul className="space-y-2">
              <li className="text-xs text-gray-700 flex gap-2">
                <span className="text-orange-400 mt-0.5">•</span>
                <span>
                  Most students struggled with{' '}
                  <strong>medication dosage calculations</strong> — consider
                  adding a review module.
                </span>
              </li>
              <li className="text-xs text-gray-700 flex gap-2">
                <span className="text-orange-400 mt-0.5">•</span>
                <span>
                  Top performers:{' '}
                  <strong>Alice Johnson, David Park, Emma Wilson</strong>{' '}
                  completed with 95%+ accuracy.
                </span>
              </li>
              <li className="text-xs text-gray-700 flex gap-2">
                <span className="text-orange-400 mt-0.5">•</span>
                <span>
                  20% of students did not complete the simulation before the due
                  date.
                </span>
              </li>
              <li className="text-xs text-gray-700 flex gap-2">
                <span className="text-orange-400 mt-0.5">•</span>
                <span>
                  Average completion time improved by 15% compared to the
                  previous simulation.
                </span>
              </li>
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-3">
                Score Distribution
              </p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={scoreData} barSize={22}>
                  <XAxis
                    dataKey="range"
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Bar dataKey="count" fill="#f97316" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-600 mb-3">
                Completion Trend
              </p>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ fill: '#22c55e', r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="px-6 sm:px-8 py-4 shrink-0 flex justify-end border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-8 py-2.5 rounded-full border border-gray-300 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
