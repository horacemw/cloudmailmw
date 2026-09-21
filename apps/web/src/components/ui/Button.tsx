import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

const V: Record<Variant, string> = {
  primary:
    'bg-brand text-white hover:bg-brand-600 active:bg-brand-700 shadow-sm disabled:bg-brand-300',
  secondary:
    'bg-white text-ink border border-surface-border hover:bg-surface-hover disabled:opacity-50 ' +
    'dark:bg-dark-card dark:text-dark-text dark:border-dark-border dark:hover:bg-dark-hover',
  ghost:
    'bg-transparent text-ink hover:bg-surface-hover disabled:opacity-50 ' +
    'dark:text-dark-text dark:hover:bg-dark-hover',
  subtle:
    'bg-brand-100 text-brand-700 hover:bg-brand-200 disabled:opacity-50 ' +
    'dark:bg-brand-900/40 dark:text-brand-300 dark:hover:bg-brand-900/60',
  danger:
    'bg-state-danger text-white hover:opacity-90 disabled:opacity-50',
};

const S: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    className,
    leftIcon,
    rightIcon,
    loading,
    fullWidth,
    children,
    disabled,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors',
        'focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
        'focus-visible:ring-offset-white dark:focus-visible:ring-offset-dark-bg',
        V[variant],
        S[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" />
      ) : (
        leftIcon
      )}
      {children}
      {rightIcon}
    </button>
  );
});
