import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'default' | 'active' | 'danger';
}

const SIZES = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  lg: 'h-10 w-10',
};

const TONES = {
  default:
    'text-ink-muted hover:bg-surface-hover hover:text-ink ' +
    'dark:text-dark-muted dark:hover:bg-dark-hover dark:hover:text-dark-text',
  active:
    'text-brand bg-brand-100 hover:bg-brand-200 ' +
    'dark:bg-brand-900/40 dark:text-brand-300 dark:hover:bg-brand-900/60',
  danger:
    'text-state-danger hover:bg-state-danger-soft',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ icon, label, size = 'md', tone = 'default', className, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={cn(
          'inline-flex items-center justify-center rounded-lg transition-colors',
          'focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
          'focus-visible:ring-offset-white dark:focus-visible:ring-offset-dark-bg',
          SIZES[size],
          TONES[tone],
          className,
        )}
        {...rest}
      >
        {icon}
      </button>
    );
  },
);
