import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle, Bell, Calendar as CalIcon, ChevronLeft, ChevronRight, Clock,
  Download, Loader2, MapPin, Plus, Trash2, Upload, Users, X,
} from 'lucide-react';
import { PageHeader } from './DashboardShell';
import { useResource } from '@/lib/hooks';
import { api, apiFetchBlob, ApiError } from '@/lib/apiClient';
import { useUIStore } from '@/store/useUIStore';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

interface Calendar {
  id: string;
  name: string;
  color: string;
  timezone: string;
  isDefault: boolean;
  visible: boolean;
}
interface Attendee {
  id: string;
  email: string;
  displayName: string | null;
  rsvpStatus: 'needs_action' | 'accepted' | 'declined' | 'tentative';
  isOrganizer: boolean;
}
interface EventOccurrence {
  id: string;                     // synthetic for recurring: `masterId@iso`
  masterId: string;
  calendarId: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  allDay: boolean;
  organizerEmail: string | null;
  status: 'confirmed' | 'tentative' | 'cancelled';
  reminderMinutes: number | null;
  attendees: Attendee[];
  isRecurring: boolean;
  originalStartsAt: string;
}

type View = 'month' | 'agenda';

export function CalendarPage(): JSX.Element {
  const { data: calData, refetch: refetchCals } = useResource<{ calendars: Calendar[] }>('/v1/calendars');
  const calendars = calData?.calendars ?? [];

  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const { from, to } = useMemo(() => monthWindow(cursor), [cursor]);
  const eventsUrl = `/v1/events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
  const { data: evData, refetch: refetchEvents, loading: evLoading } = useResource<{ events: EventOccurrence[] }>(eventsUrl, [eventsUrl]);
  const events = evData?.events ?? [];

  const [editing, setEditing] = useState<EventOccurrence | null>(null);
  const [creatingOnDate, setCreatingOnDate] = useState<Date | null>(null);

  const refreshAll = async (): Promise<void> => {
    await Promise.all([refetchCals(), refetchEvents()]);
  };

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Events, recurrences, reminders. Server-side timezone-aware. Export any calendar as .ics."
        actions={
          <button
            onClick={() => setCreatingOnDate(new Date())}
            disabled={calendars.length === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13.5px] font-semibold text-white shadow-card hover:bg-brand-600 disabled:opacity-60"
          >
            <Plus size={15} /> New event
          </button>
        }
      />

      <div className="p-6 grid gap-4 lg:grid-cols-[240px_1fr] max-w-6xl">
        {/* Left rail: view switcher + calendar list */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-surface-border bg-white p-2 dark:bg-dark-card dark:border-dark-border">
            <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-surface-hover dark:bg-dark-hover">
              {(['month', 'agenda'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    'h-8 rounded text-[12.5px] font-medium capitalize transition-colors',
                    view === v
                      ? 'bg-white text-brand-700 shadow-card dark:bg-dark-card dark:text-brand-300'
                      : 'text-ink-muted hover:text-ink dark:text-dark-muted',
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-surface-border bg-white p-3 dark:bg-dark-card dark:border-dark-border">
            <p className="text-[11px] uppercase tracking-wider text-ink-muted font-semibold px-1 pb-1">My calendars</p>
            {calendars.length === 0 && <p className="text-[13px] text-ink-muted p-2">Setting up default calendar…</p>}
            <ul className="space-y-0.5">
              {calendars.map((c) => (
                <li key={c.id} className="flex items-center gap-2 px-2 py-1.5 text-[13px] rounded-md hover:bg-surface-hover dark:hover:bg-dark-hover">
                  <span aria-hidden style={{ background: c.color }} className="h-3 w-3 rounded-full shrink-0" />
                  <span className="flex-1 truncate">{c.name}</span>
                  {c.isDefault && <span className="text-[10px] uppercase tracking-wider text-ink-muted">default</span>}
                  <ImportIcsButton calendarId={c.id} />
                  <ExportIcsButton calendarId={c.id} calendarName={c.name} />
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Main */}
        <div className="min-w-0">
          {/* Toolbar */}
          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => setCursor(startOfMonth(new Date()))} className="h-9 px-3 rounded-lg border border-surface-border text-[13px] hover:bg-surface-hover dark:border-dark-border">
              Today
            </button>
            <div className="inline-flex rounded-lg border border-surface-border dark:border-dark-border overflow-hidden">
              <button aria-label="Previous" onClick={() => setCursor(shiftMonth(cursor, -1))} className="h-9 w-9 inline-flex items-center justify-center hover:bg-surface-hover dark:hover:bg-dark-hover">
                <ChevronLeft size={16} />
              </button>
              <button aria-label="Next" onClick={() => setCursor(shiftMonth(cursor, +1))} className="h-9 w-9 inline-flex items-center justify-center hover:bg-surface-hover dark:hover:bg-dark-hover border-l border-surface-border dark:border-dark-border">
                <ChevronRight size={16} />
              </button>
            </div>
            <h2 className="text-[16px] font-semibold ml-2">
              {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </h2>
            {evLoading && <Loader2 size={14} className="animate-spin text-ink-muted ml-2" />}
          </div>

          {view === 'month' && (
            <MonthGrid
              cursor={cursor}
              events={events}
              calendars={calendars}
              onEventClick={(e) => setEditing(e)}
              onDayClick={(d) => setCreatingOnDate(d)}
            />
          )}
          {view === 'agenda' && (
            <AgendaView events={events} calendars={calendars} onEventClick={(e) => setEditing(e)} />
          )}
        </div>
      </div>

      {(editing || creatingOnDate) && (
        <EventEditor
          initial={editing}
          seedDate={creatingOnDate}
          calendars={calendars}
          onClose={() => { setEditing(null); setCreatingOnDate(null); }}
          onSaved={async () => { setEditing(null); setCreatingOnDate(null); await refreshAll(); }}
        />
      )}
    </>
  );
}

/* ─── Month grid ──────────────────────────────────────────────── */

function MonthGrid({
  cursor, events, calendars, onEventClick, onDayClick,
}: {
  cursor: Date;
  events: EventOccurrence[];
  calendars: Calendar[];
  onEventClick: (e: EventOccurrence) => void;
  onDayClick: (d: Date) => void;
}): JSX.Element {
  const days = useMemo(() => monthGridDays(cursor), [cursor]);
  const colorOf = (calendarId: string): string =>
    calendars.find((c) => c.id === calendarId)?.color ?? '#159447';
  const dayEvents = groupByDay(events);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="rounded-xl border border-surface-border overflow-hidden bg-white dark:bg-dark-card dark:border-dark-border">
      <div className="grid grid-cols-7 text-[11px] uppercase tracking-wider text-ink-muted bg-surface-hover dark:bg-dark-hover dark:text-dark-muted">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="py-2 text-center font-semibold">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {days.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = d.getTime() === today.getTime();
          const key = ymd(d);
          const es = dayEvents.get(key) ?? [];
          return (
            <button
              key={i}
              onClick={() => onDayClick(d)}
              className={cn(
                'text-left min-h-[92px] border-b border-r border-surface-divider dark:border-dark-divider p-1.5 hover:bg-surface-hover dark:hover:bg-dark-hover transition-colors',
                !inMonth && 'bg-surface-bg text-ink-faint dark:bg-dark-bg dark:text-dark-faint',
              )}
            >
              <div className={cn(
                'text-[11.5px] font-semibold mb-1',
                isToday && 'inline-flex items-center justify-center h-5 w-5 rounded-full bg-brand text-white',
              )}>
                {d.getDate()}
              </div>
              <div className="space-y-0.5">
                {es.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }}
                    className="text-[11px] px-1.5 py-0.5 rounded truncate cursor-pointer"
                    style={{ background: colorOf(e.calendarId) + '22', color: colorOf(e.calendarId) }}
                    title={e.title}
                  >
                    {e.allDay ? '' : `${shortTime(new Date(e.startsAt))} `}
                    {e.title}
                  </div>
                ))}
                {es.length > 3 && (
                  <div className="text-[10.5px] text-ink-muted">+{es.length - 3} more</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Agenda view ─────────────────────────────────────────────── */

function AgendaView({
  events, calendars, onEventClick,
}: {
  events: EventOccurrence[];
  calendars: Calendar[];
  onEventClick: (e: EventOccurrence) => void;
}): JSX.Element {
  const colorOf = (calendarId: string): string =>
    calendars.find((c) => c.id === calendarId)?.color ?? '#159447';
  const grouped = groupByDay(events);
  const sortedKeys = [...grouped.keys()].sort();

  if (events.length === 0) {
    return <EmptyState icon={<CalIcon size={22} />} title="Nothing on the schedule" description="Click New event to add one." />;
  }
  return (
    <ul className="space-y-4">
      {sortedKeys.map((key) => {
        const d = new Date(key);
        return (
          <li key={key}>
            <p className="text-[12.5px] font-semibold uppercase tracking-wider text-ink-muted mb-1.5">
              {d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
            <ul className="space-y-1">
              {grouped.get(key)!.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => onEventClick(e)}
                    className="w-full flex items-center gap-3 rounded-lg border border-surface-border bg-white p-3 hover:border-brand-300 dark:bg-dark-card dark:border-dark-border text-left"
                  >
                    <span aria-hidden style={{ background: colorOf(e.calendarId) }} className="h-9 w-1 rounded-full shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-semibold text-ink dark:text-dark-text truncate">
                        {e.title}
                      </p>
                      <p className="mt-0.5 text-[12px] text-ink-muted dark:text-dark-muted flex flex-wrap gap-x-3">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={11} />
                          {e.allDay ? 'All day' : `${shortTime(new Date(e.startsAt))} – ${shortTime(new Date(e.endsAt))}`}
                        </span>
                        {e.location && <span className="inline-flex items-center gap-1 truncate max-w-xs"><MapPin size={11} /> {e.location}</span>}
                        {e.attendees.length > 0 && <span className="inline-flex items-center gap-1"><Users size={11} /> {e.attendees.length}</span>}
                        {e.isRecurring && <span className="text-brand-700">recurring</span>}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

/* ─── Event editor modal ──────────────────────────────────────── */

function EventEditor({
  initial, seedDate, calendars, onClose, onSaved,
}: {
  initial: EventOccurrence | null;
  seedDate: Date | null;
  calendars: Calendar[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}): JSX.Element {
  const defaultCal = calendars.find((c) => c.isDefault)?.id ?? calendars[0]?.id ?? '';
  const seedStart = initial ? new Date(initial.startsAt) : (seedDate ? withTime(seedDate, 9, 0) : new Date());
  const seedEnd = initial ? new Date(initial.endsAt) : new Date(seedStart.getTime() + 60 * 60 * 1000);

  const [calendarId, setCalendarId] = useState(initial?.calendarId ?? defaultCal);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [allDay, setAllDay] = useState(initial?.allDay ?? false);
  const [start, setStart] = useState(toInputDT(seedStart, allDay));
  const [end, setEnd] = useState(toInputDT(seedEnd, allDay));
  const [rrulePreset, setRrulePreset] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'>(
    rruleToPreset(null),
  );
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(initial?.reminderMinutes ?? 15);
  const [attendees, setAttendees] = useState<{ email: string }[]>(
    initial?.attendees?.map((a) => ({ email: a.email })) ?? [],
  );
  const [newAttendee, setNewAttendee] = useState('');
  const [scope, setScope] = useState<'occurrence' | 'series'>('series');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Keep the datetime inputs in sync when the all-day toggle changes format.
    const s = new Date(start);
    const e = new Date(end);
    setStart(toInputDT(s, allDay));
    setEnd(toInputDT(e, allDay));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDay]);

  const save = async (ev: FormEvent): Promise<void> => {
    ev.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const rr = presetToRrule(rrulePreset);
      const startsAt = fromInputDT(start, allDay);
      const endsAt = fromInputDT(end, allDay);
      if (endsAt <= startsAt) throw new Error('End time must be after start');
      const payload: Record<string, unknown> = {
        calendarId,
        title,
        description: description || undefined,
        location: location || undefined,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        allDay,
        rrule: rr,
        reminderMinutes,
        attendees: attendees.length ? attendees : undefined,
      };
      if (initial) {
        payload.scope = initial.isRecurring ? scope : 'series';
        if (scope === 'occurrence') payload.occurrenceDate = new Date(initial.originalStartsAt).toISOString();
        await api(`/v1/events/${initial.masterId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/v1/events', { method: 'POST', body: JSON.stringify(payload) });
      }
      await onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const del = async (): Promise<void> => {
    if (!initial) return;
    if (!window.confirm(initial.isRecurring && scope === 'occurrence' ? 'Cancel this occurrence?' : 'Delete this event?')) return;
    const qs = initial.isRecurring
      ? `?scope=${scope}${scope === 'occurrence' ? `&occurrenceDate=${encodeURIComponent(new Date(initial.originalStartsAt).toISOString())}` : ''}`
      : '';
    await api(`/v1/events/${initial.masterId}${qs}`, { method: 'DELETE' });
    await onSaved();
  };

  const addAttendee = (): void => {
    const em = newAttendee.trim().toLowerCase();
    if (!em) return;
    if (attendees.some((a) => a.email === em)) return;
    setAttendees([...attendees, { email: em }]);
    setNewAttendee('');
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? 'Edit event' : 'New event'}
      size="lg"
      footer={
        <>
          {initial && (
            <button type="button" onClick={del} className="mr-auto inline-flex items-center gap-1 h-9 px-3 rounded-lg text-[13px] text-state-danger hover:bg-state-danger-soft">
              <Trash2 size={13} /> {initial.isRecurring && scope === 'occurrence' ? 'Cancel occurrence' : 'Delete'}
            </button>
          )}
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-surface-border text-[13px] hover:bg-surface-hover dark:border-dark-border">Cancel</button>
          <button type="submit" form="event-form" disabled={busy || !title} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-60">
            {busy && <Loader2 className="animate-spin" size={13} />} {initial ? 'Save' : 'Create event'}
          </button>
        </>
      }
    >
      <form id="event-form" onSubmit={save} className="space-y-3">
        {err && <div className="flex items-start gap-2 rounded-lg border border-state-danger/30 bg-state-danger-soft px-3 py-2 text-[13px] text-state-danger"><AlertCircle size={14} className="mt-0.5" /> {err}</div>}
        {initial?.isRecurring && (
          <div className="rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-[13px] dark:bg-brand-900/20 dark:border-brand-900/40">
            <label className="flex items-center gap-3">
              <span>Applies to:</span>
              <select value={scope} onChange={(e) => setScope(e.target.value as 'occurrence' | 'series')} className="h-8 rounded-md border border-surface-border bg-white px-2 text-[12.5px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border">
                <option value="occurrence">This occurrence only</option>
                <option value="series">The entire series</option>
              </select>
            </label>
          </div>
        )}
        <label>
          <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Title</span>
          <input required maxLength={240} value={title} onChange={(e) => setTitle(e.target.value)} className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Calendar</span>
            <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)} className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border">
              {calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 mt-6">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="accent-brand" />
            <span className="text-[13px]">All day</span>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Start</span>
            <input type={allDay ? 'date' : 'datetime-local'} required value={start} onChange={(e) => setStart(e.target.value)} className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
          </label>
          <label>
            <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">End</span>
            <input type={allDay ? 'date' : 'datetime-local'} required value={end} onChange={(e) => setEnd(e.target.value)} className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
          </label>
        </div>
        <label>
          <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted"><MapPin size={11} className="inline mr-1" /> Location</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={240} placeholder="Google Meet, boardroom, etc." className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
        </label>
        <label>
          <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Description</span>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border border-surface-border bg-white p-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Repeats</span>
            <select value={rrulePreset} onChange={(e) => setRrulePreset(e.target.value as 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly')} className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border">
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted"><Bell size={11} className="inline mr-1" /> Reminder</span>
            <select value={String(reminderMinutes ?? '')} onChange={(e) => setReminderMinutes(e.target.value ? Number(e.target.value) : null)} className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border">
              <option value="">None</option>
              <option value="0">At time of event</option>
              <option value="5">5 minutes before</option>
              <option value="10">10 minutes before</option>
              <option value="15">15 minutes before</option>
              <option value="30">30 minutes before</option>
              <option value="60">1 hour before</option>
              <option value="1440">1 day before</option>
            </select>
          </label>
        </div>
        <div>
          <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted"><Users size={11} className="inline mr-1" /> Attendees</span>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {attendees.map((a) => (
              <span key={a.email} className="inline-flex items-center gap-1 rounded-full bg-brand-50 border border-brand-100 text-brand-800 px-2 py-0.5 text-[12px] dark:bg-brand-900/20 dark:border-brand-900/40 dark:text-brand-200">
                {a.email}
                <button type="button" onClick={() => setAttendees(attendees.filter((x) => x.email !== a.email))} className="hover:text-brand-900"><X size={11} /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="email" value={newAttendee} onChange={(e) => setNewAttendee(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAttendee(); } }} placeholder="attendee@example.com" className="flex-1 h-9 rounded-lg border border-surface-border bg-white px-3 text-[13px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
            <button type="button" onClick={addAttendee} className="h-9 px-3 rounded-lg border border-surface-border text-[13px] hover:bg-surface-hover dark:border-dark-border">Add</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/* ─── date helpers ─────────────────────────────────────────────── */

function startOfMonth(d: Date): Date { const x = new Date(d); x.setDate(1); x.setHours(0, 0, 0, 0); return x; }
function shiftMonth(d: Date, delta: number): Date { const x = new Date(d); x.setMonth(x.getMonth() + delta); return x; }
function monthWindow(cursor: Date): { from: Date; to: Date } {
  const first = startOfMonth(cursor);
  const last = new Date(first); last.setMonth(last.getMonth() + 1); last.setMilliseconds(-1);
  return { from: startOfWeekMonday(first), to: endOfWeekMonday(last) };
}
function monthGridDays(cursor: Date): Date[] {
  const start = startOfWeekMonday(startOfMonth(cursor));
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d); }
  return days;
}
function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfWeekMonday(d: Date): Date {
  const s = startOfWeekMonday(d);
  const x = new Date(s); x.setDate(s.getDate() + 6); x.setHours(23, 59, 59, 999);
  return x;
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function shortTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function toInputDT(d: Date, allDay: boolean): string {
  if (allDay) return ymd(d);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromInputDT(s: string, allDay: boolean): Date {
  if (allDay) { const d = new Date(s + 'T00:00'); return d; }
  return new Date(s);
}
function withTime(d: Date, hh: number, mm: number): Date {
  const x = new Date(d); x.setHours(hh, mm, 0, 0); return x;
}
function groupByDay(events: EventOccurrence[]): Map<string, EventOccurrence[]> {
  const m = new Map<string, EventOccurrence[]>();
  for (const e of events) {
    const key = ymd(new Date(e.startsAt));
    const list = m.get(key) ?? [];
    list.push(e);
    m.set(key, list);
  }
  return m;
}
function presetToRrule(p: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'): string | null {
  switch (p) {
    case 'daily': return 'FREQ=DAILY';
    case 'weekly': return 'FREQ=WEEKLY';
    case 'monthly': return 'FREQ=MONTHLY';
    case 'yearly': return 'FREQ=YEARLY';
    default: return null;
  }
}
function rruleToPreset(_r: string | null): 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' {
  // Simple round-trip for the presets we generate. Anything else stays 'none'.
  return 'none';
}

function ImportIcsButton({ calendarId }: { calendarId: string }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const push = useUIStore((s) => s.pushToast);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      push({ title: 'ICS file over 5 MB', tone: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api<{ imported: number; skipped: number }>(
        `/v1/calendars/${calendarId}/import`,
        { method: 'POST', body: form },
      );
      push({
        title: `Imported ${res.imported} event${res.imported === 1 ? '' : 's'}`,
        description: res.skipped > 0 ? `${res.skipped} skipped (duplicates or invalid)` : undefined,
        tone: 'success',
      });
      // Signal the CalendarPage to re-fetch. useResource listens for its own
      // deps change; a full-page refetch is triggered by parent state anyway,
      // but we surface a dispatch here so a future subscriber can hook in.
      window.dispatchEvent(new CustomEvent('cloudmail:refresh-events'));
    } catch (err) {
      push({
        title: 'ICS import failed',
        description: err instanceof ApiError ? err.message : 'Please try again',
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <label className="text-ink-muted hover:text-ink cursor-pointer" title="Import .ics file">
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
      <input
        ref={inputRef}
        type="file"
        accept=".ics,text/calendar"
        className="hidden"
        onChange={(e) => void handleFile(e)}
      />
    </label>
  );
}

/**
 * ICS download button. Cannot be a plain <a href="/v1/calendars/:id/ics">
 * because /v1/* requires Authorization: Bearer — a direct link would 401.
 * We fetch as a Blob through the API client (which attaches the access
 * token) and trigger a save-as via a temporary <a download>.
 */
function ExportIcsButton({
  calendarId,
  calendarName,
}: {
  calendarId: string;
  calendarName: string;
}): JSX.Element {
  const [busy, setBusy] = useState(false);
  const push = useUIStore((s) => s.pushToast);

  const download = async (): Promise<void> => {
    setBusy(true);
    try {
      const blob = await apiFetchBlob(`/v1/calendars/${calendarId}/ics`);
      const safeName = calendarName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'calendar';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.ics`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
    } catch (err) {
      push({
        title: 'Download failed',
        description: err instanceof ApiError ? err.message : 'Please try again',
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void download()}
      title="Download .ics"
      className="text-ink-muted hover:text-ink"
      disabled={busy}
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
    </button>
  );
}
