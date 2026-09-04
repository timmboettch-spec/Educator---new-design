import Input from '@/components/ui/Input';
import { X } from 'lucide-react';
import React from 'react';

interface TableSearchBarProps {
  value: string;
  onChange: (val: string) => void;
}

const TableSearchBar: React.FC<TableSearchBarProps> = ({ value, onChange }) => (
  <div className="px-6 py-3 border-b border-slate-100 bg-[#FAFAFA]">
    <div className="relative max-w-xs">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <Input
        type="text"
        placeholder="Search Simulations or tags..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-8 pr-8 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-primary-300 text-slate-600 placeholder:text-slate-300"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
          aria-label="Clear search"
        >
          <X size={12} />
        </button>
      )}
    </div>
  </div>
);

export default TableSearchBar;
