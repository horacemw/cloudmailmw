import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  showTag?: boolean;
  size?: number;
}

export function Logo({ className, showTag = true, size = 34 }: LogoProps): JSX.Element {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark size={size} />
      <div className="leading-tight">
        <div className="text-[15px] font-bold text-ink dark:text-dark-text tracking-tight">
          Cloud Mail
        </div>
        {showTag && (
          <div className="text-[10.5px] font-medium text-brand-700 dark:text-brand-300 tracking-wide">
            Your Email. Anywhere.
          </div>
        )}
      </div>
    </div>
  );
}

export function LogoMark({ size = 34 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Cloud Mail"
    >
      <defs>
        <linearGradient id="cm-g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#159447" />
          <stop offset="1" stopColor="#087443" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill="url(#cm-g)" />
      <path
        d="M9 17c0-2.2 1.8-4 4-4h.6a6.5 6.5 0 0 1 12.6 1.1 4.5 4.5 0 0 1 1 8.9H13a4 4 0 0 1-4-4v-2Z"
        fill="#fff"
      />
      <path
        d="M12.5 24.5l3.6-3.6 2.2 2.2 3.6-3.6 2.4 2.4 3.2-3.2"
        stroke="#159447"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
