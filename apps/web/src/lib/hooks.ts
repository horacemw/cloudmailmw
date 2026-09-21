/**
 * Thin data hooks over the API. Kept intentionally simple — no react-query,
 * because Phase 1's Zustand pattern is already the app's convention.
 * `useResource` returns `{data, loading, error, refetch}`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/apiClient';

export interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useResource<T>(path: string | null, deps: unknown[] = []): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const req = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const my = ++req.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api<T>(path);
      if (my === req.current) {
        setData(res);
        setLoading(false);
      }
    } catch (err) {
      if (my !== req.current) return;
      setError(err instanceof ApiError ? err.message : 'Request failed');
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, ...deps]);

  return { data, loading, error, refetch: load };
}

export function useClipboard(): { copied: string | null; copy: (v: string, key?: string) => void } {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (v: string, key?: string): void => {
    void navigator.clipboard?.writeText(v).then(() => {
      setCopied(key ?? v);
      setTimeout(() => setCopied(null), 1400);
    });
  };
  return { copied, copy };
}
