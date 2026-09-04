import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'neutral';

interface CommonButtonProps {
  label: string;
  onClick?: () => void;
  variant?: ButtonVariant;
  className?: string;
  disabled?: boolean;
}

const CommonButton: React.FC<CommonButtonProps> = ({
  label,
  onClick,
  variant = 'primary',
  className = '',
  disabled = false,
}) => {
  const baseStyle =
    'min-h-[34px] px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-150 inline-flex items-center justify-center whitespace-nowrap';

  const variantStyle =
    variant === 'primary'
      ? 'bg-gradient-btn text-white shadow-sm hover:opacity-90'
      : variant === 'neutral'
        ? 'bg-[#e9e9e9] text-[#5f6060] hover:bg-gray-200'
        : 'bg-[#5BA7C8] text-white hover:bg-[#4a95b5]';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyle} ${variantStyle} ${className} ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      {label}
    </button>
  );
};

export default CommonButton;
