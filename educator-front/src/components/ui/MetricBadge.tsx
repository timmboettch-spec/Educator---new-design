import React from 'react';

const badgeColors = {
  green: 'bg-green-50 text-green-700 border-green-200',
  yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  orange: 'bg-primary-50 text-primary-700 border-primary-200',
  pink: 'bg-pink-50 text-pink-700 border-pink-200',
  gray: 'bg-gray-50 text-gray-700 border-gray-200',
  olive: 'bg-lime-50 text-lime-700 border-lime-200',
  inactive:
    'bg-feedback-error text-white w-[88px] h-[26px] rounded-full flex items-center justify-center font-sans text-caption font-medium leading-[20px]',
  pending:
    'bg-yellow-400 text-white w-[88px] h-[26px] rounded-full flex items-center justify-center font-sans text-caption font-medium leading-[20px]',
  active:
    'bg-feedback-success text-white w-[88px] h-[26px] rounded-full flex items-center justify-center font-sans text-caption font-medium leading-[20px]',
} as const;

type BadgeColor = keyof typeof badgeColors;

interface MetricBadgeProps {
  value: number | string;
  color?: BadgeColor;
  children?: React.ReactNode;
}

const statusVariants = new Set(['active', 'pending', 'inactive']);

export const MetricBadge = ({ value, color = 'gray', children }: MetricBadgeProps) => {
  const isStatus = statusVariants.has(color);
  return (
    <span
      className={
        isStatus
          ? badgeColors[color]
          : `inline-block px-2 py-1 rounded-md text-caption font-medium border ${badgeColors[color]}`
      }
    >
      {children || value}
    </span>
  );
};
