import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { api, ApiError } from '@/lib/apiClient';
import { useLiveMailStore } from '@/store/useLiveMailStore';
import { avatarColors, cn, initials } from '@/lib/utils';

interface ContactSuggestion {
  id: string;
  name: string;
  email: string;
}
interface Chip {
  name?: string | undefined;
  email: string;
}

interface Props {
  /** Comma/semicolon-separated recipients, e.g. "Alice <alice@x.com>, bob@y.com" */
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  ariaLabel: string;
  /** Called when the input is submitted with Enter on empty — used to send. */
  onSubmitEmpty?: () => void;
  autoFocus?: boolean;
}

/**
 * Recipient input that renders selected addresses as chips and fetches
 * contact suggestions from /v1/contacts/search as the user types. The
 * external value shape is a plain string (comma-separated) so callers that
 * expect the historical Compose format keep working.
 *
 * Free-form typing is always allowed — the address doesn't need to exist as
 * a contact. Anything that looks like an email (contains an @) or has a
 * trailing separator (`,`, `;`, Enter, Tab) is committed as a chip.
 *
 * Debounce: 180 ms. In demo mode (unauthenticated), the search request will
 * simply 401 and we silently render zero suggestions rather than crashing.
 */
export function RecipientChipInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  onSubmitEmpty,
  autoFocus,
}: Props): JSX.Element {
  const chips = useMemo(() => parseChips(value), [value]);
  const [draft, setDraft] = useState('');
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [openSuggest, setOpenSuggest] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const liveMode = useLiveMailStore((s) => s.mode);

  // Debounced search. Skipped when live-mode isn't ready (we don't want to
  // spam the API from the pure-demo Phase-1 flow) or when the draft has no
  // meaningful text yet.
  useEffect(() => {
    const q = draft.trim();
    if (!q || q.length < 1 || liveMode !== 'ready') {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await api<{ results: ContactSuggestion[] }>(
          `/v1/contacts/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal } as RequestInit,
        );
        // Filter out contacts already chipped.
        const alreadyChipped = new Set(chips.map((c) => c.email.toLowerCase()));
        setSuggestions(r.results.filter((s) => !alreadyChipped.has(s.email.toLowerCase())));
        setHighlight(0);
        setOpenSuggest(true);
      } catch (err) {
        if (err instanceof ApiError) return; // silent — 401/etc. shouldn't disrupt typing
        /* AbortError etc. — ignore */
      }
    }, 180);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [draft, liveMode, chips]);

  // Close suggestion popover on outside click.
  useEffect(() => {
    if (!openSuggest) return;
    const handler = (e: MouseEvent): void => {
      if (!containerRef.current?.contains(e.target as Node)) setOpenSuggest(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openSuggest]);

  const commit = (add: Chip[]): void => {
    if (add.length === 0) return;
    const seen = new Set(chips.map((c) => c.email.toLowerCase()));
    const next = [...chips];
    for (const c of add) {
      if (c.email && !seen.has(c.email.toLowerCase())) {
        next.push(c);
        seen.add(c.email.toLowerCase());
      }
    }
    onChange(serialiseChips(next));
    setDraft('');
    setSuggestions([]);
    setOpenSuggest(false);
  };

  const removeChip = (i: number): void => {
    const next = chips.filter((_, idx) => idx !== i);
    onChange(serialiseChips(next));
    inputRef.current?.focus();
  };

  const acceptSuggestion = (s: ContactSuggestion): void => {
    commit([{ name: s.name, email: s.email }]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (openSuggest && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (h + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpenSuggest(false);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const s = suggestions[highlight];
        if (s) {
          e.preventDefault();
          acceptSuggestion(s);
          return;
        }
      }
    }
    if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === 'Tab') {
      const parsed = parseFreeText(draft);
      if (parsed.length > 0) {
        e.preventDefault();
        commit(parsed);
        return;
      }
      if (draft.trim() === '' && e.key === 'Enter' && onSubmitEmpty) {
        e.preventDefault();
        onSubmitEmpty();
      }
    }
    if (e.key === 'Backspace' && draft === '' && chips.length > 0) {
      e.preventDefault();
      removeChip(chips.length - 1);
    }
  };

  const handleBlur = (): void => {
    // Commit whatever is left in the draft when the user tabs away.
    const parsed = parseFreeText(draft);
    if (parsed.length > 0) commit(parsed);
  };

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-w-0"
      onClick={() => inputRef.current?.focus()}
    >
      <div
        role="group"
        aria-label={ariaLabel}
        className="flex flex-wrap items-center gap-1.5"
      >
        {chips.map((c, i) => (
          <span
            key={`${c.email}-${i}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 border border-brand-100 text-brand-800 pl-1 pr-2 py-0.5 text-[12.5px] dark:bg-brand-900/20 dark:border-brand-900/40 dark:text-brand-200"
          >
            <ChipAvatar name={c.name || c.email} email={c.email} />
            <span className="truncate max-w-[220px]">
              {c.name ? (
                <>
                  <span className="font-medium">{c.name}</span>
                  <span className="opacity-70"> &lt;{c.email}&gt;</span>
                </>
              ) : (
                c.email
              )}
            </span>
            <button
              type="button"
              aria-label={`Remove ${c.email}`}
              onClick={(e) => {
                e.stopPropagation();
                removeChip(i);
              }}
              className="text-brand-700 hover:text-brand-900 rounded-full p-0.5"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpenSuggest(true);
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={() => draft && setOpenSuggest(true)}
          placeholder={chips.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent text-[14px] outline-none placeholder:text-ink-muted dark:placeholder:text-dark-muted dark:text-dark-text py-0.5"
          aria-label={ariaLabel}
        />
      </div>

      {openSuggest && suggestions.length > 0 && (
        <div
          role="listbox"
          className="absolute z-30 left-0 right-0 top-full mt-1 rounded-xl border border-surface-border bg-white shadow-pop overflow-hidden animate-slide-up dark:bg-dark-card dark:border-dark-border"
        >
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              role="option"
              aria-selected={i === highlight}
              type="button"
              // Use mousedown, not click — click fires after blur which clears state.
              onMouseDown={(e) => {
                e.preventDefault();
                acceptSuggestion(s);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                'flex items-center gap-2.5 w-full px-3 py-2 text-left',
                i === highlight
                  ? 'bg-brand-50 dark:bg-brand-900/20'
                  : 'hover:bg-surface-hover dark:hover:bg-dark-hover',
              )}
            >
              <ChipAvatar name={s.name} email={s.email} />
              <span className="flex-1 min-w-0 leading-tight">
                <span className="block text-[13px] font-medium text-ink dark:text-dark-text truncate">
                  {s.name}
                </span>
                <span className="block text-[11.5px] text-ink-muted dark:text-dark-muted truncate">
                  {s.email}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── helpers ──────────────────────────────────────────────────── */

function ChipAvatar({ name, email }: { name: string; email: string }): JSX.Element {
  const c = avatarColors(email || name);
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-5 w-5 items-center justify-center rounded-full text-[9.5px] font-semibold shrink-0',
        c.bg,
        c.fg,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Parse a comma-separated recipient string into chips. Tolerant of "Name <addr>" and bare emails. */
function parseChips(csv: string): Chip[] {
  if (!csv) return [];
  return csv
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((raw) => {
      const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
      if (m) {
        const name = (m[1] ?? '').trim();
        const email = (m[2] ?? '').trim();
        return name ? { name, email } : { email };
      }
      return { email: raw };
    });
}

function serialiseChips(chips: Chip[]): string {
  return chips
    .map((c) => (c.name ? `"${c.name.replace(/"/g, '\\"')}" <${c.email}>` : c.email))
    .join(', ');
}

/** Parse whatever the user has typed into the draft into new chips. */
function parseFreeText(text: string): Chip[] {
  return text
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.replace(/[<>]/g, '')))
    .map((s) => {
      const m = s.match(/^([^<]*)<([^>]+)>$/);
      if (m) return { name: (m[1] ?? '').trim() || undefined, email: (m[2] ?? '').trim() };
      return { email: s };
    });
}
