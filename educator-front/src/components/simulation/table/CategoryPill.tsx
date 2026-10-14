import React from 'react';

const CATEGORY_STYLES: Record<string, string> = {
  Cardiology: 'bg-sky-100 text-sky-600 border border-sky-200',
  Pediatrics: 'bg-teal-100 text-teal-600 border border-teal-200',
  'Emergency Medicine':
    'bg-orange-100 text-orange-500 border border-orange-200',
  Neurology: 'bg-purple-100 text-purple-600 border border-purple-200',
};

interface CategoryPillProps {
  category: string;
}

const CategoryPill: React.FC<CategoryPillProps> = ({ category }) => {
  const style =
    CATEGORY_STYLES[category] ??
    'bg-slate-100 text-slate-500 border border-slate-200';
  return (
    <span
      className={`inline-flex items-center justify-center text-[11px] font-medium px-3 py-1 rounded-full w-fit ${style}`}
    >
      {category}
    </span>
  );
};

export default CategoryPill;
