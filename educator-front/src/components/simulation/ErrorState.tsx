import React from 'react';

interface ErrorStateProps {
  title: string;
  message: string;
  retryLabel: string;
  onRetry: () => void;
}

/** "Couldn't load" state with a retry. Callers pass friendly, translated copy — never a raw API error. */
const ErrorState: React.FC<ErrorStateProps> = ({
  title,
  message,
  retryLabel,
  onRetry,
}) => (
  <div
    role="alert"
    className="flex flex-col items-center justify-center py-20 text-center"
  >
    <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-4">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#EF4444"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    </div>
    <p className="text-sm font-semibold text-slate-700 mb-1">{title}</p>
    <p className="text-xs text-slate-400 mb-5 max-w-xs">{message}</p>
    <button
      type="button"
      onClick={onRetry}
      className="px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white text-xs font-semibold rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2"
    >
      {retryLabel}
    </button>
  </div>
);

export default ErrorState;
