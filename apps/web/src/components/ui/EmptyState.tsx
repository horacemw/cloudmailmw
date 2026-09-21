import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6 py-16',
        className,
      )}
    >
      <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 mb-4">
        {icon}
      </div>
      <h3 className="text-[15px] font-semibold text-ink dark:text-dark-text">{title}</h3>
      {description && (
        <p className="text-sm text-ink-muted dark:text-dark-muted mt-1 max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
