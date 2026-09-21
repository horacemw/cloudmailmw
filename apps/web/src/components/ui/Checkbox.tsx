import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  size?: 'sm' | 'md';
}

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
  className,
  onClick,
  size = 'md',
}: CheckboxProps): JSX.Element {
  const boxSize = size === 'sm' ? 'h-[15px] w-[15px]' : 'h-[17px] w-[17px]';
  const iconSize = size === 'sm' ? 10 : 12;
  return (
    <label
      className={cn(
        'inline-flex items-center gap-2 cursor-pointer select-none',
        className,
      )}
      onClick={onClick}
    >
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-[5px] border transition-colors shrink-0',
          boxSize,
          checked || indeterminate
            ? 'bg-brand border-brand text-white'
            : 'bg-white border-surface-border hover:border-ink-faint dark:bg-dark-card dark:border-dark-border',
        )}
      >
        {indeterminate ? (
          <Minus size={iconSize} strokeWidth={3} />
        ) : checked ? (
          <Check size={iconSize} strokeWidth={3} />
        ) : null}
      </span>
      {label ? (
        <span className="text-sm text-ink dark:text-dark-text">{label}</span>
      ) : null}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
    </label>
  );
}
