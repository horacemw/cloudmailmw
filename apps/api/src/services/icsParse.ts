/**
 * Minimal RFC-5545 VCALENDAR parser — enough to import events from an .ics
 * export. Supports VEVENT with SUMMARY, DESCRIPTION, LOCATION, DTSTART,
 * DTEND, RRULE, ORGANIZER, ATTENDEE, STATUS, UID, and the DTSTART;VALUE=DATE
 * / DTSTART;TZID=... variants. Line unfolding per RFC-5545 §3.1.
 *
 * We do NOT execute embedded scripts, do not follow URLs, and cap the input
 * size at 5 MB in the calling route.
 */

export interface ParsedIcsEvent {
  uid: string | null;
  summary: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  timezone: string;
  rrule: string | null;
  organizerEmail: string | null;
  status: 'confirmed' | 'tentative' | 'cancelled';
  attendees: Array<{ email: string; displayName: string | null; rsvp: 'accepted' | 'declined' | 'tentative' | 'needs_action' }>;
}

const CRLF = /\r?\n/;

function unfold(input: string): string[] {
  const raw = input.split(CRLF);
  const out: string[] = [];
  for (const line of raw) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      // Continuation of the previous logical line.
      if (out.length === 0) continue;
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function unescape(v: string): string {
  return v
    .replace(/\\\\/g, '\\')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\n/gi, '\n');
}

/** Parses DTSTART, DTEND, and similar timestamp property values. */
function parseIcsDate(value: string, params: Record<string, string>): { date: Date; allDay: boolean; tz: string } {
  const isDateOnly = params['VALUE'] === 'DATE';
  const tz = params['TZID'] ?? 'UTC';
  let date: Date;
  if (isDateOnly && /^\d{8}$/.test(value)) {
    // Local midnight in TZ — but we store UTC so this becomes 00:00 UTC.
    date = new Date(
      Date.UTC(
        Number(value.slice(0, 4)),
        Number(value.slice(4, 6)) - 1,
        Number(value.slice(6, 8)),
      ),
    );
    return { date, allDay: true, tz };
  }
  // Full timestamp: 20260921T203000 or 20260921T203000Z
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) {
    // Fall back to Date.parse for exotic formats — worst case, we skip.
    const t = Date.parse(value);
    if (Number.isNaN(t)) throw new Error(`bad_ics_date: ${value}`);
    return { date: new Date(t), allDay: false, tz };
  }
  const [, y, mo, d, hh, mm, ss, z] = m;
  if (z === 'Z') {
    date = new Date(Date.UTC(+y!, +mo! - 1, +d!, +hh!, +mm!, +ss!));
  } else {
    // Floating time without TZID — treat as UTC to avoid ambiguity.
    date = new Date(Date.UTC(+y!, +mo! - 1, +d!, +hh!, +mm!, +ss!));
  }
  return { date, allDay: false, tz };
}

function parsePropParams(rawKey: string): { name: string; params: Record<string, string> } {
  const [name, ...rest] = rawKey.split(';');
  const params: Record<string, string> = {};
  for (const p of rest) {
    const eq = p.indexOf('=');
    if (eq === -1) continue;
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: name!.toUpperCase(), params };
}

function parseMailto(v: string): string {
  const m = v.match(/^mailto:(.+)$/i);
  return m ? m[1]!.trim() : v.trim();
}

/**
 * Parse a full VCALENDAR into VEVENT records. Silently skips unknown
 * components (VTODO, VJOURNAL, VTIMEZONE) and events with unparseable dates.
 */
export function parseIcs(input: string): ParsedIcsEvent[] {
  const lines = unfold(input);
  const events: ParsedIcsEvent[] = [];
  let inEvent = false;
  let current: Partial<ParsedIcsEvent> & { attendees: ParsedIcsEvent['attendees'] } | null = null;

  for (const line of lines) {
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const rawKey = line.slice(0, colon);
    const rawVal = line.slice(colon + 1);
    const { name, params } = parsePropParams(rawKey);

    if (name === 'BEGIN' && rawVal === 'VEVENT') {
      inEvent = true;
      current = {
        uid: null,
        summary: '',
        description: null,
        location: null,
        startsAt: new Date(0),
        endsAt: new Date(0),
        allDay: false,
        timezone: 'UTC',
        rrule: null,
        organizerEmail: null,
        status: 'confirmed',
        attendees: [],
      };
      continue;
    }
    if (name === 'END' && rawVal === 'VEVENT') {
      inEvent = false;
      if (current && current.startsAt && current.startsAt.getTime() !== 0) {
        // If DTEND is missing, use DTSTART + 1 h for timed, or DTSTART for all-day.
        if (!current.endsAt || current.endsAt.getTime() === 0) {
          current.endsAt = current.allDay
            ? new Date(current.startsAt.getTime() + 24 * 60 * 60 * 1000)
            : new Date(current.startsAt.getTime() + 60 * 60 * 1000);
        }
        events.push(current as ParsedIcsEvent);
      }
      current = null;
      continue;
    }
    if (!inEvent || !current) continue;

    try {
      switch (name) {
        case 'UID':
          current.uid = rawVal.trim();
          break;
        case 'SUMMARY':
          current.summary = unescape(rawVal);
          break;
        case 'DESCRIPTION':
          current.description = unescape(rawVal);
          break;
        case 'LOCATION':
          current.location = unescape(rawVal);
          break;
        case 'DTSTART': {
          const { date, allDay, tz } = parseIcsDate(rawVal, params);
          current.startsAt = date;
          current.allDay = allDay;
          current.timezone = tz;
          break;
        }
        case 'DTEND': {
          const { date } = parseIcsDate(rawVal, params);
          current.endsAt = date;
          break;
        }
        case 'RRULE':
          current.rrule = rawVal.trim();
          break;
        case 'ORGANIZER':
          current.organizerEmail = parseMailto(rawVal);
          break;
        case 'STATUS': {
          const s = rawVal.toUpperCase();
          if (s === 'CANCELLED') current.status = 'cancelled';
          else if (s === 'TENTATIVE') current.status = 'tentative';
          else current.status = 'confirmed';
          break;
        }
        case 'ATTENDEE': {
          const email = parseMailto(rawVal);
          const partstat = (params['PARTSTAT'] ?? '').toUpperCase();
          const rsvp =
            partstat === 'ACCEPTED'
              ? 'accepted'
              : partstat === 'DECLINED'
                ? 'declined'
                : partstat === 'TENTATIVE'
                  ? 'tentative'
                  : 'needs_action';
          current.attendees.push({
            email,
            displayName: params['CN'] ? unescape(params['CN']) : null,
            rsvp,
          });
          break;
        }
      }
    } catch {
      // Skip unparseable property, keep going.
    }
  }
  return events;
}
