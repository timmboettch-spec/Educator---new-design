import React from 'react';

interface CategoryBadgeProps {
  category: string;
}

const CATEGORY_STYLES: Record<string, string> = {
  Cardiology: 'bg-rose-100 text-rose-600',
  Pediatrics: 'bg-purple-100 text-purple-600',
  'Emergency Medicine': 'bg-primary-100 text-primary-600',
  Neurology: 'bg-blue-100 text-blue-600',
};

const CategoryBadge: React.FC<CategoryBadgeProps> = ({ category }) => {
  const style = CATEGORY_STYLES[category] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-md ${style}`}>
      {category}
    </span>
  );
};

export default CategoryBadge;
