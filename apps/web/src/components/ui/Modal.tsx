import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton } from './IconButton';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  disableBackdropClose?: boolean;
}

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  disableBackdropClose,
}: ModalProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px] dark:bg-black/60"
        onClick={disableBackdropClose ? undefined : onClose}
      />
      <div
        className={cn(
          'relative w-full bg-white dark:bg-dark-card rounded-2xl shadow-pop border border-surface-border dark:border-dark-border animate-scale-in',
          'flex flex-col max-h-[90vh]',
          SIZES[size],
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 p-5 border-b border-surface-divider dark:border-dark-divider">
            <div>
              {title && (
                <h2 id="modal-title" className="text-[15px] font-semibold text-ink dark:text-dark-text">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-sm text-ink-muted dark:text-dark-muted mt-0.5">{description}</p>
              )}
            </div>
            <IconButton icon={<X size={18} />} label="Close" onClick={onClose} size="sm" />
          </div>
        )}
        <div className="p-5 overflow-y-auto scroll-thin">{children}</div>
        {footer && (
          <div className="px-5 py-4 border-t border-surface-divider dark:border-dark-divider flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
