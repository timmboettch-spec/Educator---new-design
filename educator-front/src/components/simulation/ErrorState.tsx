import React from 'react';

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry }) => (
  <div className="flex flex-col items-center justify-center py-20">
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
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    </div>
    <p className="text-sm font-semibold text-slate-700 mb-1">Failed to load simulations</p>
    <p className="text-xs text-slate-400 mb-5 text-center max-w-xs">{message}</p>
    <button
      onClick={onRetry}
      className="px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white text-xs font-semibold rounded-lg transition-colors"
    >
      Try Again
    </button>
  </div>
);

export default ErrorState;
