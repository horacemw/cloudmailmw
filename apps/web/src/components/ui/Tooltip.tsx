import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  label: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}

export function Tooltip({ label, children, side = 'bottom', className }: TooltipProps): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={cn(
            'pointer-events-none absolute left-1/2 -translate-x-1/2 z-50 whitespace-nowrap',
            'rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-white shadow-toast',
            'dark:bg-dark-text dark:text-dark-bg',
            'animate-fade-in',
            side === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}
