import React from "react";

interface SeatsCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: React.ReactNode;
  iconBgColor?: string;
  borderColor?: string;
}

const SeatsCard = ({
  title,
  value,
  subtitle,
  icon,
  iconBgColor = "bg-blue-100",
  borderColor = "border-slate-200",
}: SeatsCardProps) => {
  return (
    <div
      className={`
        bg-white
        border
        ${borderColor}
        rounded-2xl
        p-4
        h-full
        min-h-[120px]
        overflow-hidden
        shadow-[0_2px_8px_rgba(15,23,42,0.06)]
        transition-all
      `}
    >
      <div
        className={`
          w-8
          h-8
          flex-shrink-0
          rounded-lg
          flex
          items-center
          justify-center
          ${iconBgColor}
        `}
      >
        {icon}
      </div>

      <div className="mt-4 min-w-0">
        <h2 className="text-xl font-bold text-black leading-none truncate">
          {value}
        </h2>

        <p className="mt-3 text-sm font-medium text-slate-900 truncate">
          {title}
        </p>

        {subtitle && (
          <p className="mt-1 text-[12px] text-slate-500">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
};

export default SeatsCard;