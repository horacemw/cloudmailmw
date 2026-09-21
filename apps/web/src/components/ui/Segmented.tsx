import { cn } from '@/lib/utils';

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; badge?: number }[];
  size?: 'sm' | 'md';
  className?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
}: SegmentedProps<T>): JSX.Element {
  const h = size === 'sm' ? 'h-8' : 'h-9';
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center rounded-lg bg-surface-hover p-0.5',
        'dark:bg-dark-hover',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-all',
              h,
              active
                ? 'bg-white text-brand-700 shadow-card dark:bg-dark-card dark:text-brand-300'
                : 'text-ink-muted hover:text-ink dark:text-dark-muted dark:hover:text-dark-text',
            )}
          >
            {opt.label}
            {typeof opt.badge === 'number' && opt.badge > 0 && (
              <span
                className={cn(
                  'ml-1 min-w-[18px] px-1 h-[16px] rounded-full text-[10px] leading-[16px] text-center font-semibold',
                  active
                    ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200'
                    : 'bg-surface-border text-ink-muted dark:bg-dark-border dark:text-dark-muted',
                )}
              >
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
