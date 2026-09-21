import { useState, type FormEvent } from 'react';
import { Building2, Loader2, Mail, Phone, Plus, Search, Star, StarOff, Trash2, User } from 'lucide-react';
import { PageHeader } from './DashboardShell';
import { useResource } from '@/lib/hooks';
import { api, ApiError } from '@/lib/apiClient';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  notes: string | null;
  groups: string[];
  starred: boolean;
  createdAt: string;
}

export function ContactsPage(): JSX.Element {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const { data, refetch, loading } = useResource<{ contacts: Contact[] }>(
    `/v1/contacts${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    [search],
  );
  const rows = data?.contacts ?? [];

  const toggleStar = async (c: Contact): Promise<void> => {
    await api(`/v1/contacts/${c.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ starred: !c.starred }),
    });
    await refetch();
  };
  const del = async (c: Contact): Promise<void> => {
    if (!window.confirm(`Delete ${c.displayName}?`)) return;
    await api(`/v1/contacts/${c.id}`, { method: 'DELETE' });
    await refetch();
  };

  return (
    <>
      <PageHeader
        title="Contacts"
        description="Your personal address book. Used by the composer's autocomplete."
        actions={
          <button
            onClick={() => setCreating(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13.5px] font-semibold text-white shadow-card hover:bg-brand-600"
          >
            <Plus size={15} /> Add contact
          </button>
        }
      />
      <div className="p-6 max-w-4xl">
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-surface-border bg-white px-3 h-10 dark:bg-dark-card dark:border-dark-border">
          <Search size={14} className="text-ink-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, company…"
            className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-ink-muted"
          />
        </div>

        {loading && rows.length === 0 && <p className="text-[13px] text-ink-muted">Loading…</p>}
        {!loading && rows.length === 0 && (
          <EmptyState
            icon={<User size={22} />}
            title={search ? 'No matches' : 'No contacts yet'}
            description={search ? 'Try a different query.' : 'Add your first contact to get autocomplete when composing.'}
          />
        )}
        {rows.length > 0 && (
          <ul className="grid gap-2">
            {rows.map((c) => (
              <li key={c.id} className="rounded-xl border border-surface-border bg-white p-3 flex items-center gap-3 dark:bg-dark-card dark:border-dark-border">
                <Avatar name={c.displayName} email={c.email} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditing(c)} className="text-[14px] font-semibold text-ink hover:underline dark:text-dark-text truncate text-left">
                      {c.displayName}
                    </button>
                    {c.starred && <Star size={12} className="text-amber-500 fill-amber-500" />}
                  </div>
                  <p className="text-[12.5px] text-ink-muted dark:text-dark-muted flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="inline-flex items-center gap-1"><Mail size={11} /> {c.email}</span>
                    {c.phone && <span className="inline-flex items-center gap-1"><Phone size={11} /> {c.phone}</span>}
                    {c.company && <span className="inline-flex items-center gap-1"><Building2 size={11} /> {c.company}</span>}
                  </p>
                </div>
                <button aria-label={c.starred ? 'Unstar' : 'Star'} onClick={() => toggleStar(c)} className="text-ink-muted hover:text-amber-500">
                  {c.starred ? <Star size={14} className="fill-amber-500 text-amber-500" /> : <StarOff size={14} />}
                </button>
                <button aria-label="Delete" onClick={() => del(c)} className="text-ink-muted hover:text-state-danger">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(creating || editing) && (
        <ContactModal
          initial={editing ?? null}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={async () => { setCreating(false); setEditing(null); await refetch(); }}
        />
      )}
    </>
  );
}

function ContactModal({
  initial, onClose, onSaved,
}: {
  initial: Contact | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}): JSX.Element {
  const [firstName, setFirstName] = useState(initial?.firstName ?? '');
  const [lastName, setLastName] = useState(initial?.lastName ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [company, setCompany] = useState(initial?.company ?? '');
  const [jobTitle, setJobTitle] = useState(initial?.jobTitle ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        email,
        phone: phone || undefined,
        company: company || undefined,
        jobTitle: jobTitle || undefined,
        notes: notes || undefined,
      };
      if (initial) {
        await api(`/v1/contacts/${initial.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await api('/v1/contacts', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      await onSaved();
    } catch (er) {
      setErr(er instanceof ApiError ? er.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? 'Edit contact' : 'Add contact'}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-surface-border text-[13px] hover:bg-surface-hover dark:border-dark-border">Cancel</button>
          <button type="submit" form="contact-form" disabled={busy || !email} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-60">
            {busy && <Loader2 className="animate-spin" size={13} />} {initial ? 'Save' : 'Add contact'}
          </button>
        </>
      }
    >
      <form id="contact-form" onSubmit={submit} className="space-y-3">
        {err && <div className="rounded-lg border border-state-danger/30 bg-state-danger-soft px-3 py-2 text-[13px] text-state-danger">{err}</div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={60} className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
          </Field>
          <Field label="Last name">
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={60} className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
          </Field>
          <Field label="Email">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value.toLowerCase())} className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
          </Field>
          <Field label="Phone">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
          </Field>
          <Field label="Company">
            <input value={company} onChange={(e) => setCompany(e.target.value)} className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
          </Field>
          <Field label="Job title">
            <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
          </Field>
        </div>
        <Field label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
        </Field>
      </form>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label>
      <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">{label}</span>
      {children}
    </label>
  );
}
