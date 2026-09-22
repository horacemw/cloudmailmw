import type { Email, Folder, Notification } from '@/types';

/**
 * Deprecated seed-data module.
 *
 * ⚠️  All content-bearing exports (MOCK_EMAILS, CURRENT_USER, custom folders,
 *     mock notifications) were removed on 2026-09-22 as part of the zero-mock
 *     production cutover. A real MailCloud customer must never see fabricated
 *     inbox items or a hardcoded user identity in any code path.
 *
 * What remains is intentionally minimal:
 *
 *   - SYSTEM_FOLDERS: the seven standard IMAP special-use folders that a real
 *     Dovecot account auto-provisions. Kept here so the client-side folder
 *     rail has structural labels/icons even before /v1/mail/folders returns.
 *     The counts are calculated from the real emails array (which starts empty).
 *
 *   - CUSTOM_FOLDERS: empty. A real customer creates their own via the
 *     "New folder" UI, which will eventually round-trip to IMAP CREATE.
 *
 *   - MOCK_EMAILS / MOCK_NOTIFICATIONS: empty arrays. Kept to preserve the
 *     import surface of legacy callers; every caller now sees zero content.
 *
 * Callers that need the signed-in user's identity should read it from
 * `useAuthStore((s) => s.user)` — CURRENT_USER has been removed.
 *
 * Once the webmail message list is fully wired to /v1/mail/*, delete this
 * file and its remaining imports.
 */

export const SYSTEM_FOLDERS: Folder[] = [
  { id: 'inbox', name: 'Inbox', system: true },
  { id: 'starred', name: 'Starred', system: true },
  { id: 'snoozed', name: 'Snoozed', system: true },
  { id: 'sent', name: 'Sent', system: true },
  { id: 'drafts', name: 'Drafts', system: true },
  { id: 'archive', name: 'Archive', system: true },
  { id: 'spam', name: 'Spam', system: true },
  { id: 'trash', name: 'Trash', system: true },
];

export const CUSTOM_FOLDERS: Folder[] = [];

export const MOCK_EMAILS: Email[] = [];

export const MOCK_NOTIFICATIONS: Notification[] = [];
