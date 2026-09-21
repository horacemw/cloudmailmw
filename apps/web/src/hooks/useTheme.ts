import { useEffect, useState } from 'react';
import type { Theme } from '@/types';

const KEY = 'cloudmail.theme';

/**
 * Theme management.
 *
 * Default is LIGHT for everyone — Cloud Mail deliberately does NOT inherit
 * the operating-system dark preference. Users who want dark can pick it
 * themselves in Settings → Appearance ("dark") or opt back into OS-following
 * behaviour ("system").
 */
function apply(theme: Theme): void {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
  // Tell the browser what color-scheme its native controls should follow.
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
}

let systemListener: ((ev: MediaQueryListEvent) => void) | null = null;

function attachSystemListener(): void {
  if (systemListener) return;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  systemListener = () => apply('system');
  mq.addEventListener('change', systemListener);
}

function detachSystemListener(): void {
  if (!systemListener) return;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.removeEventListener('change', systemListener);
  systemListener = null;
}

/** Called from main.tsx before React mounts so we never render the wrong theme. */
export function initTheme(): void {
  try {
    // Explicit LIGHT default — do NOT inherit device dark mode.
    const stored = (localStorage.getItem(KEY) as Theme | null) ?? 'light';
    apply(stored);
    if (stored === 'system') attachSystemListener();
  } catch {
    /* SSR-safe no-op */
  }
}

export function useTheme(): {
  theme: Theme;
  setTheme: (t: Theme) => void;
} {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      return (localStorage.getItem(KEY) as Theme | null) ?? 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    apply(theme);
    if (theme === 'system') attachSystemListener();
    else detachSystemListener();
    return () => {
      /* keep listener alive between renders — cleanup on unmount */
    };
  }, [theme]);

  const setTheme = (t: Theme): void => {
    setThemeState(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
  };

  return { theme, setTheme };
}
