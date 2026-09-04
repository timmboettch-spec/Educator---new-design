interface Props {
  message?: string;
  onRetry: () => void;
}

export default function DashboardErrorState({ message, onRetry }: Props) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-col items-center justify-center py-24 text-center"
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
      <p className="text-sm font-semibold text-slate-700 mb-1">Failed to load dashboard</p>
      <p className="text-xs text-slate-400 mb-5 max-w-xs">
        {message ?? 'Something went wrong while fetching your dashboard data.'}
      </p>
      <button
        onClick={onRetry}
        className="px-5 py-2 bg-primary-500 hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-400 text-white text-xs font-semibold rounded-lg transition-colors"
      >
        Try Again
      </button>
    </div>
  );
}
