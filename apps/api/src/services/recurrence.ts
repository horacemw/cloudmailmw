// rrule ships as CommonJS with no named ESM exports — use default-import + destructure.
import rrulePkg from 'rrule';
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
const { RRule } = rrulePkg as any;
type RRule = InstanceType<typeof RRule>;
import type { CalendarEvent, EventAttendee } from '@prisma/client';

/**
 * Expand a set of stored events into concrete occurrences that fall inside
 * the requested window.
 *
 * For non-recurring events: include if it overlaps the window.
 * For recurring events (RRULE present): generate occurrences within the
 * window, apply per-occurrence overrides (child rows keyed on masterId +
 * recurrenceOverrideDate) — those either replace the original occurrence
 * or cancel it (status='cancelled').
 *
 * We deliberately do NOT materialise every occurrence into rows. That means
 * infinitely-recurring events don't blow up storage; instead they get
 * expanded on demand inside a caller-provided window (max ~1 year to keep
 * the response bounded).
 */
export interface ExpandedOccurrence {
  id: string;                              // event id; for recurring: `${masterId}@${occurrence.toISOString()}`
  masterId: string;
  calendarId: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  allDay: boolean;
  organizerEmail: string | null;
  status: 'confirmed' | 'tentative' | 'cancelled';
  reminderMinutes: number | null;
  attendees: EventAttendee[];
  isRecurring: boolean;
  originalStartsAt: Date;                  // for recurring occurrences this is the original series slot
}

export function expandEvents(
  events: (CalendarEvent & { attendees: EventAttendee[]; overrides?: CalendarEvent[] })[],
  windowStart: Date,
  windowEnd: Date,
): ExpandedOccurrence[] {
  const out: ExpandedOccurrence[] = [];

  for (const ev of events) {
    if (ev.masterId) continue; // overrides are consumed via their master

    if (!ev.rrule) {
      // Simple event — include if it overlaps the window.
      if (ev.endsAt >= windowStart && ev.startsAt <= windowEnd) {
        out.push(toOccurrence(ev, ev, false));
      }
      continue;
    }

    const overrides = new Map<string, CalendarEvent>();
    for (const ovr of ev.overrides ?? []) {
      if (ovr.recurrenceOverrideDate) {
        overrides.set(ovr.recurrenceOverrideDate.toISOString(), ovr);
      }
    }

    let rule: RRule;
    try {
      const opts = RRule.parseString(ev.rrule);
      rule = new RRule({ ...opts, dtstart: ev.startsAt });
    } catch {
      // Malformed RRULE — fall back to the master occurrence only.
      out.push(toOccurrence(ev, ev, false));
      continue;
    }

    const occurrences = rule.between(windowStart, windowEnd, true);
    const durationMs = ev.endsAt.getTime() - ev.startsAt.getTime();

    for (const occ of occurrences) {
      const key = occ.toISOString();
      const override = overrides.get(key);
      if (override) {
        // Overridden occurrence — replace with the override row (which may
        // itself be cancelled, moved to a different time, etc).
        if (override.status !== 'cancelled') {
          const asOverride = { ...override, id: `${ev.id}@${key}` };
          out.push(toOccurrence(asOverride, ev, true));
        }
        continue;
      }
      const startsAt = occ;
      const endsAt = new Date(occ.getTime() + durationMs);
      out.push({
        id: `${ev.id}@${key}`,
        masterId: ev.id,
        calendarId: ev.calendarId,
        title: ev.title,
        description: ev.description,
        location: ev.location,
        startsAt,
        endsAt,
        timezone: ev.timezone,
        allDay: ev.allDay,
        organizerEmail: ev.organizerEmail,
        status: ev.status,
        reminderMinutes: ev.reminderMinutes,
        attendees: ev.attendees,
        isRecurring: true,
        originalStartsAt: startsAt,
      });
    }
  }

  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

function toOccurrence(
  ev: CalendarEvent & { attendees?: EventAttendee[] },
  master: CalendarEvent,
  isRecurring: boolean,
): ExpandedOccurrence {
  return {
    id: ev.id,
    masterId: master.id,
    calendarId: ev.calendarId,
    title: ev.title,
    description: ev.description,
    location: ev.location,
    startsAt: ev.startsAt,
    endsAt: ev.endsAt,
    timezone: ev.timezone,
    allDay: ev.allDay,
    organizerEmail: ev.organizerEmail,
    status: ev.status,
    reminderMinutes: ev.reminderMinutes,
    attendees: ev.attendees ?? [],
    isRecurring,
    originalStartsAt: ev.startsAt,
  };
}

/**
 * Produce a valid RFC-5545 VCALENDAR containing all supplied events.
 * Used for `/v1/calendars/:id/ics` export.
 */
export function toIcs(
  calendarName: string,
  events: (CalendarEvent & { attendees: EventAttendee[] })[],
): string {
  const fold = (line: string): string => {
    // ICS lines must be ≤ 75 octets. Fold at 73 to be safe.
    if (line.length <= 73) return line;
    const parts: string[] = [];
    for (let i = 0; i < line.length; i += 73) parts.push((i === 0 ? '' : ' ') + line.slice(i, i + 73));
    return parts.join('\r\n');
  };
  const esc = (s: string): string =>
    s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
  const fmt = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cloud Mail//NONSGML v1.0//EN',
    `X-WR-CALNAME:${esc(calendarName)}`,
  ];
  for (const e of events) {
    if (e.masterId) continue; // skip child override rows; RFC-5545 exports use RRULE+EXDATE later
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.id}@cloudmail`);
    lines.push(`DTSTAMP:${fmt(new Date())}`);
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${fmt(e.startsAt).slice(0, 8)}`);
      lines.push(`DTEND;VALUE=DATE:${fmt(e.endsAt).slice(0, 8)}`);
    } else {
      lines.push(`DTSTART:${fmt(e.startsAt)}`);
      lines.push(`DTEND:${fmt(e.endsAt)}`);
    }
    lines.push(fold(`SUMMARY:${esc(e.title)}`));
    if (e.description) lines.push(fold(`DESCRIPTION:${esc(e.description)}`));
    if (e.location) lines.push(fold(`LOCATION:${esc(e.location)}`));
    if (e.status === 'cancelled') lines.push('STATUS:CANCELLED');
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    if (e.organizerEmail) lines.push(fold(`ORGANIZER;CN=${esc(e.organizerEmail)}:mailto:${e.organizerEmail}`));
    for (const a of e.attendees) {
      const rsvp = a.rsvpStatus === 'accepted' ? 'ACCEPTED' : a.rsvpStatus === 'declined' ? 'DECLINED' : a.rsvpStatus === 'tentative' ? 'TENTATIVE' : 'NEEDS-ACTION';
      lines.push(fold(`ATTENDEE;CN=${esc(a.displayName ?? a.email)};PARTSTAT=${rsvp}:mailto:${a.email}`));
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
