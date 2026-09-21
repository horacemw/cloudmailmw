export type SystemFolderId =
  | 'inbox'
  | 'starred'
  | 'snoozed'
  | 'sent'
  | 'drafts'
  | 'archive'
  | 'spam'
  | 'trash';

export type FolderId = SystemFolderId | string;

export interface Folder {
  id: FolderId;
  name: string;
  system: boolean;
  icon?: string;
}

export interface Contact {
  name: string;
  email: string;
}

export interface Attachment {
  id: string;
  name: string;
  size: string;
  type: 'pdf' | 'image' | 'doc' | 'sheet' | 'zip' | 'other';
}

export type Label = 'work' | 'personal' | 'important' | 'finance' | 'travel';

export interface Email {
  id: string;
  folderId: FolderId;
  from: Contact;
  to: Contact[];
  cc?: Contact[];
  bcc?: Contact[];
  subject: string;
  preview: string;
  bodyHtml: string;
  timestamp: string; // ISO
  read: boolean;
  starred: boolean;
  trusted?: boolean;
  attachments?: Attachment[];
  labels?: Label[];
  snoozedUntil?: string;
  draft?: boolean;
}

export interface Notification {
  id: string;
  kind: 'new-mail' | 'sent' | 'draft' | 'storage' | 'security';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export type FilterTab = 'all' | 'unread' | 'starred' | 'attachments';

export interface AdvancedFilter {
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
  unread?: boolean;
  starred?: boolean;
  dateRange?: 'any' | 'today' | '7d' | '30d';
}

export type Theme = 'light' | 'dark' | 'system';
