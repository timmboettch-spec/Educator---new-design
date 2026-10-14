import React from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'neutral';

interface CommonButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'className' | 'disabled' | 'type'
> {
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
  ...rest
}) => {
  const baseStyle =
    'min-h-[34px] px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-150 inline-flex items-center justify-center whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2';

  const variantStyle =
    variant === 'primary'
      ? 'bg-gradient-btn text-white shadow-sm hover:opacity-90'
      : variant === 'neutral'
        ? 'bg-neutral-active text-neutral-strong hover:bg-gray-200'
        : 'bg-[#5BA7C8] text-white hover:bg-[#4a95b5]';

  return (
    <button
      {...rest}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        baseStyle,
        variantStyle,
        className,
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {label}
    </button>
  );
};

export default CommonButton;
