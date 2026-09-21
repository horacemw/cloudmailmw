import { avatarColors, cn, initials } from '@/lib/utils';

interface AvatarProps {
  name: string;
  email?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  ring?: boolean;
}

const SIZES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-9 w-9 text-[12px]',
  lg: 'h-10 w-10 text-[13px]',
  xl: 'h-14 w-14 text-base',
};

export function Avatar({ name, email, size = 'md', className, ring }: AvatarProps): JSX.Element {
  const colors = avatarColors(email || name);
  return (
    <div
      aria-hidden
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold shrink-0 select-none',
        colors.bg,
        colors.fg,
        SIZES[size],
        ring && 'ring-2 ring-white dark:ring-dark-panel',
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}
