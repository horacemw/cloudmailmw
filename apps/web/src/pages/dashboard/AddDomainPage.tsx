import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { PageHeader } from './DashboardShell';
import { api, ApiError } from '@/lib/apiClient';

export function AddDomainPage(): JSX.Element {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ id: string }>('/v1/domains', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      navigate(`/dashboard/domains/${res.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add domain');
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader title="Add a domain" description="You'll get the exact DNS records you need on the next screen." />
      <div className="p-6 max-w-xl">
        <Link
          to="/dashboard/domains"
          className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-ink-muted hover:text-ink dark:text-dark-muted"
        >
          <ArrowLeft size={13} /> Back to domains
        </Link>
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-state-danger/30 bg-state-danger-soft px-3 py-2.5 text-[13px] text-state-danger">
              <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">
              Domain name
            </span>
            <input
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="example.com"
              className="w-full h-11 rounded-lg border border-surface-border bg-white px-3.5 text-[15px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text"
            />
            <p className="mt-1.5 text-[12px] text-ink-muted dark:text-dark-muted">
              Enter the apex domain (e.g. <code>example.com</code>, not <code>mail.example.com</code>).
            </p>
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-5 text-[14.5px] font-semibold text-white shadow-card hover:bg-brand-600 disabled:opacity-60"
          >
            {submitting && <Loader2 size={15} className="animate-spin" />}
            Continue
          </button>
        </form>
      </div>
    </>
  );
}
