export type ClassTabKey = 'all' | 'active' | 'needAttention' | 'draft' | 'archived';

export type ClassStatusTab = {
  key: ClassTabKey;
  label: string;
};

const defaultTabs: ClassStatusTab[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'needAttention', label: 'Need Attention' },
  { key: 'draft', label: 'Draft' },
  { key: 'archived', label: 'Archived' },
];

interface StatusTabsProps {
  activeTab: ClassTabKey;
  onChange: (tab: ClassTabKey) => void;
  tabs?: ClassStatusTab[];
  /** Number of classes currently needing attention — shown as a badge. */
  needAttentionCount?: number;
}

export default function StatusTabs({
  activeTab,
  onChange,
  tabs = defaultTabs,
  needAttentionCount,
}: StatusTabsProps) {
  const handleClick = (tab: ClassTabKey) => {
    onChange?.(tab);
  };

  return (
    <div className="inline-flex items-center gap-1.5 bg-[#FEEFE0] p-1.5 rounded-full">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => handleClick(tab.key)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap flex-shrink-0 ${
            activeTab === tab.key
              ? 'bg-primary-500 text-white shadow-sm'
              : 'text-black hover:text-primary-500'
          }`}
        >
          {tab.label}
          {tab.key === 'needAttention' && needAttentionCount != null && needAttentionCount > 0 && (
            <span
              className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none ${
                activeTab === tab.key
                  ? 'bg-white text-primary-500'
                  : 'bg-primary-500 text-white'
              }`}
            >
              {needAttentionCount > 99 ? '99+' : needAttentionCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
