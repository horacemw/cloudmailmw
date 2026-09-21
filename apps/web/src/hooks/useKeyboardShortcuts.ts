import { useEffect } from 'react';
import { useMailStore } from '@/store/useMailStore';
import { useUIStore } from '@/store/useUIStore';

/** True when the event target is a form control or contenteditable — skip shortcuts. */
function isTypingContext(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const mail = useMailStore.getState();
      const ui = useUIStore.getState();

      // Cmd/Ctrl+K → focus search
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const el = document.getElementById('cloudmail-search');
        if (el instanceof HTMLInputElement) el.focus();
        return;
      }

      // Escape closes reading pane on mobile, compose, modals
      if (e.key === 'Escape') {
        if (ui.compose.open && !ui.compose.minimized) {
          ui.minimizeCompose(true);
          return;
        }
        if (ui.readingPaneOpenMobile) {
          ui.setReadingPaneOpenMobile(false);
          return;
        }
      }

      if (isTypingContext(e.target)) return;

      // Single-key shortcuts
      switch (e.key.toLowerCase()) {
        case 'c':
          e.preventDefault();
          ui.openCompose();
          break;
        case '/':
          e.preventDefault();
          document.getElementById('cloudmail-search')?.focus();
          break;
        case '?':
          e.preventDefault();
          ui.setShortcutsOpen(true);
          break;
        case 'r':
          if (mail.selectedEmailId) {
            e.preventDefault();
            const em = mail.currentEmail();
            if (em) {
              ui.openCompose({
                to: em.from.email,
                subject: em.subject.startsWith('Re:') ? em.subject : `Re: ${em.subject}`,
                body: `\n\n\n---\nOn ${new Date(em.timestamp).toLocaleString()}, ${em.from.name} wrote:\n> ${em.preview}`,
              });
            }
          }
          break;
        case 'f':
          if (mail.selectedEmailId) {
            e.preventDefault();
            const em = mail.currentEmail();
            if (em) {
              ui.openCompose({
                subject: em.subject.startsWith('Fwd:') ? em.subject : `Fwd: ${em.subject}`,
                body: `\n\n\n---------- Forwarded message ---------\nFrom: ${em.from.name} <${em.from.email}>\nSubject: ${em.subject}\n\n${em.preview}`,
              });
            }
          }
          break;
        case 'e':
          if (mail.selectedEmailId) {
            e.preventDefault();
            mail.archive([mail.selectedEmailId]);
            mail.selectEmail(null);
            ui.pushToast({ title: 'Archived', tone: 'success' });
          }
          break;
        case 'delete':
        case 'backspace':
          if (mail.selectedEmailId) {
            e.preventDefault();
            mail.moveToTrash([mail.selectedEmailId]);
            mail.selectEmail(null);
            ui.pushToast({ title: 'Moved to Trash', tone: 'success' });
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
