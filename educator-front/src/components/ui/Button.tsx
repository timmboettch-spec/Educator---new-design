import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-white transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary-500 text-white hover:bg-primary-600',
        destructive: 'bg-feedback-error text-white hover:bg-red-600',
        outline: 'border border-neutral-300 bg-white hover:bg-neutral-100 text-text-primary',
        secondary: 'bg-neutral-200 text-text-secondary hover:bg-neutral-300',
        cancel: 'border border-neutral-300 hover:border-neutral-400 text-text-secondary',
        ghost: 'hover:bg-primary-100 hover:text-primary-600',
        link: 'text-primary-500 underline-offset-4 hover:underline',
        password: 'bg-primary-500 text-white hover:bg-primary-600',
        gradient:
          'bg-gradient-btn text-white hover:opacity-90 rounded-full px-8 h-[48px] text-[16px] font-semibold',
        signIn: 'bg-primary-500 text-white hover:bg-primary-600 rounded-[56px]',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-full',
        lg: 'h-[48px] px-8 rounded-full text-[16px]',

        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading, loadingText, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={loading || props.disabled}
        {...props}
      >
        {loading ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            {loadingText || 'Please wait...'}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
