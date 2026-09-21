# Cloud Mail — Phase 1

**Your Email. Anywhere.**

Phase 1 delivers the complete logged-in **Mail Workspace / Webmail interface** for Cloud Mail. It is a polished, responsive, functional email client that runs entirely in the browser against a local mock data layer — designed so that later phases can plug in real mail infrastructure without redesigning the frontend.

## Run

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # production bundle in dist/
npm run typecheck  # strict TypeScript check
```

Add `?theme=dark` behaviour: visit `/dark.html` once to persist a dark preference in `localStorage`, then any subsequent visit to `/` renders the dark theme. You can also switch via **Settings → Appearance**.

## Stack

* **Vite 5** + **React 18** + **TypeScript** (strict mode, path alias `@/*`)
* **Tailwind CSS 3** with a bespoke Cloud Mail token set (brand green `#159447`, `#087443`; `Poppins` 400/500/600/700)
* **Zustand 5** for state (two focused stores: mail + UI)
* **lucide-react** for icons (one consistent line-icon family)
* No global CSS beyond Tailwind + a small typography layer for email bodies

## What ships in Phase 1

### Application shell
* Sticky top bar with logo (with tagline), Cmd/Ctrl+K search, workspace icons (Mail highlighted, Calendar, Contacts, Drive, Settings), app launcher, notifications, and profile menu.
* Sidebar: prominent green **Compose** button; system folders with unread/count badges (Inbox / Starred / Snoozed / Sent / Drafts / Archive / Spam / Trash); custom folders (Projects, Finance, HR, Meetings, Personal, Notes) with a `+` to create more; **Storage widget** (68% used, green progress bar, "Upgrade Storage" CTA); Settings link.
* **Mobile drawer** sidebar + bottom navigation (Inbox / Search / Compose / Contacts / Settings).

### Mail workspace
* Inbox header with title, message count, filter tabs (**All / Unread / Starred / Attachments** with live counts), refresh, and advanced filter.
* Realistic message list with per-row checkbox, avatar (deterministic brand-safe palette), sender name + trusted-sender badge, subject, preview, attachment indicator, star, and time.
* Bulk-select toolbar (Archive / Spam / Delete / Mark read/unread / Snooze / Move to folder / More).
* Reading pane: full header, timestamp, **trusted sender banner** (soft green), rendered email HTML, attachment cards, and Reply / Reply all / Forward.
* Advanced filter modal (From, To, Subject, Date range, Has attachment, Unread, Starred).

### Compose
* Slide-up compose window with To / Cc / Bcc / Subject / rich body area, format toolbar (Bold, Italic, Underline, lists, link, attach, image), Send with split-button, save/discard.
* Auto-saves drafts every 4 seconds into the Drafts folder; restores when re-opened.
* **Minimizable** compose (persists while you keep browsing), signature auto-appended.

### Menus & modals
* Notification dropdown with unread indicator + mark-all-read.
* Profile menu (avatar, name, email, Profile / Appearance / Security / Shortcuts / Help / Sign out).
* App launcher grid (Mail active + 8 preview apps).
* Advanced filter, Create folder, Storage overview, Keyboard shortcuts, and Settings panel (Profile, Appearance with light/dark/system, Notifications, Signature, Shortcuts).

### Empty / loading / error states
* Skeleton loaders for message rows on folder switch.
* Empty states for "you're all caught up", "no matches", and "select a message".
* Toast system for every action (send, archive, star, snooze, draft, etc.).

### Keyboard shortcuts (typing-context aware)
| Key | Action |
| --- | --- |
| `C` | Compose |
| `R` | Reply |
| `F` | Forward |
| `E` | Archive |
| `⌫ / Del` | Move to Trash |
| `/` | Search |
| `?` | Show shortcuts sheet |
| `⌘ / Ctrl + K` | Focus search |
| `Esc` | Close dialogs / minimize compose |

### Accessibility & responsiveness
* Focus-visible rings, aria-labels on all icon buttons, `role`/`aria-modal` on dialogs, live-region toasts.
* Desktop three-panel layout; on tablet/mobile the reading pane transitions full-screen; sidebar becomes a drawer; bottom nav handles primary navigation.
* Full **dark mode** (proper dark tokens — background `#0F1512`, panels `#151D19`, text `#F2F7F4`) with system / light / dark preference stored in `localStorage`.

### Data
* 26 seeded inbox messages (FDH OneClick OTPs, Salaries Batch, UNDP Webmail, ACB ECMS statement, Google security, Amina/Blessings/Chikondi threads, Stripe/AWS invoices, Zoom meeting, GitHub PR, Notion, LinkedIn, Figma, Cloudflare, Kayak, HR reminder, etc.), 2 Sent, 1 Draft, 3 Spam, 1 Trash — all clearly fictional. Storage widget seeded at 6.8 GB / 10 GB.

## Architecture

```
src/
  components/
    shell/        AppShell, TopBar, Sidebar, MobileBottomNav
    mail/         InboxHeader, MessageList, MessageRow, BulkActionBar,
                  ReadingPane, ComposeModal
    menus/        NotificationMenu, ProfileMenu, AppLauncher
    modals/       AdvancedFilterModal, CreateFolderModal, StorageModal,
                  ShortcutsModal
    settings/     SettingsPanel (Profile / Appearance / Notifications /
                  Signature / Shortcuts)
    sidebar/      StorageWidget
    ui/           Avatar, Button, IconButton, Checkbox, Modal, Dropdown,
                  Tooltip, Toast, Skeleton, EmptyState, Logo, Segmented
  data/           mockData.ts (all seed emails, folders, notifications)
  hooks/          useTheme, useMediaQuery, useKeyboardShortcuts
  lib/            utils.ts (cn, time formatting, avatar hashing, uid)
  store/          useMailStore, useUIStore
  types/          Email, Folder, Notification, FilterTab, AdvancedFilter, Theme
```

### Where to plug real backend later

* `useMailStore` mutations (`markRead`, `toggleStar`, `moveTo`, `sendEmail`, `saveDraft`, ...) currently mutate local state — swap for API calls without changing components.
* `data/mockData.ts` supplies the initial emails/folders — replace with an initial fetch from the Cloud Mail API.
* `useUIStore.notifications` is likewise ready to be fed by a websocket / SSE.
* Avatar rendering is currently initials-only; wire in image URLs from the contacts API when available.

## Not built in Phase 1 (by design)

Postfix / Dovecot / Rspamd / ClamAV / SMTP / IMAP servers, DNS / DKIM / SPF / DMARC automation, payment / subscription / customer onboarding, super-admin dashboard, mailbox provisioning, infrastructure monitoring. These belong to Phases 2–10.
