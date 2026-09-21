import { CheckCircle2, AlertTriangle, X, Info } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { cn } from '@/lib/utils';

export function ToastViewport(): JSX.Element {
  const toasts = useUIStore((s) => s.toasts);
  const dismiss = useUIStore((s) => s.dismissToast);
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const Icon =
          t.tone === 'success'
            ? CheckCircle2
            : t.tone === 'warning' || t.tone === 'danger'
              ? AlertTriangle
              : Info;
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-center gap-3 min-w-[280px] max-w-md',
              'rounded-xl bg-white dark:bg-dark-card border border-surface-border dark:border-dark-border shadow-toast',
              'px-4 py-3 animate-slide-up',
            )}
            role="status"
          >
            <Icon
              size={18}
              className={cn(
                t.tone === 'success' && 'text-brand',
                t.tone === 'warning' && 'text-state-warning',
                t.tone === 'danger' && 'text-state-danger',
                !t.tone && 'text-ink-muted',
              )}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink dark:text-dark-text truncate">
                {t.title}
              </p>
              {t.description && (
                <p className="text-[12px] text-ink-muted dark:text-dark-muted mt-0.5 truncate">
                  {t.description}
                </p>
              )}
            </div>
            {t.action && (
              <button
                onClick={t.action.onClick}
                className="text-[13px] font-medium text-brand-700 dark:text-brand-300 hover:underline"
              >
                {t.action.label}
              </button>
            )}
            <button
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="text-ink-faint hover:text-ink dark:hover:text-dark-text"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
