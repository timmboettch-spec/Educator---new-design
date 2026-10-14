import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export default function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-surface rounded-2xl shadow-card p-6 ${className}`}>
      {children}
    </div>
  );
}
