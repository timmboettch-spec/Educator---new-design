import React from 'react';

interface StarRatingProps {
  rating: number;
}

const StarRating: React.FC<StarRatingProps> = ({ rating }) => {
  const full = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;

  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill={i < full ? '#F59E0B' : i === full && hasHalf ? 'url(#half)' : '#E2E8F0'}
          stroke="none"
        >
          <defs>
            <linearGradient id="half">
              <stop offset="50%" stopColor="#F59E0B" />
              <stop offset="50%" stopColor="#E2E8F0" />
            </linearGradient>
          </defs>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
      <span className="text-slate-400 text-[11px] ml-1">{rating}</span>
    </span>
  );
};

export default StarRating;
