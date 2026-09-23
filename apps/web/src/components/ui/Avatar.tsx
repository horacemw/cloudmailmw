import { useState } from 'react';
import { avatarColors, cn, initials } from '@/lib/utils';

interface AvatarProps {
  name: string;
  email?: string;
  /** Optional avatar image URL. Falls back to coloured initials on load error. */
  avatarUrl?: string | null;
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

export function Avatar({
  name,
  email,
  avatarUrl,
  size = 'md',
  className,
  ring,
}: AvatarProps): JSX.Element {
  const colors = avatarColors(email || name);
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = Boolean(avatarUrl) && !imgFailed;

  const commonClasses = cn(
    'inline-flex items-center justify-center rounded-full font-semibold shrink-0 select-none overflow-hidden',
    SIZES[size],
    ring && 'ring-2 ring-white dark:ring-dark-panel',
    className,
  );

  if (showImg) {
    return (
      <img
        aria-hidden
        src={avatarUrl!}
        alt=""
        onError={() => setImgFailed(true)}
        className={cn(commonClasses, 'object-cover')}
      />
    );
  }

  return (
    <div aria-hidden className={cn(commonClasses, colors.bg, colors.fg)}>
      {initials(name)}
    </div>
  );
}
