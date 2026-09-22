import { create } from 'zustand';
import { api, ApiError, setAccessToken, setCurrentTenant } from '@/lib/apiClient';

/**
 * Auth session state. Access token lives in memory (never localStorage);
 * refresh cookie lives httpOnly. `bootstrap` runs on app start — it tries a
 * silent refresh via the refresh cookie so a returning user doesn't need to
 * re-log-in every session.
 */

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  lastLoginAt: string | null;
}

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  plan: string;
  status: string;
}

interface AuthState {
  ready: boolean;                 // initial bootstrap done
  loading: boolean;               // in-flight auth call
  user: CurrentUser | null;
  tenants: TenantSummary[];
  activeTenant: TenantSummary | null;
  error: string | null;
  mfaChallenge: string | null;    // present after login when MFA is required

  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ needsMfa: boolean }>;
  submitMfa: (code: string) => Promise<void>;
  cancelMfa: () => void;
  signup: (input: {
    email: string;
    password: string;
    name: string;
    organizationName: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  setActiveTenant: (t: TenantSummary) => void;
  setUser: (u: CurrentUser) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ready: false,
  loading: false,
  user: null,
  tenants: [],
  activeTenant: null,
  error: null,
  mfaChallenge: null,

  bootstrap: async () => {
    if (get().ready) return;
    try {
      // Try to refresh silently — server checks the cm_rt cookie.
      // Relative URL — served by nginx in prod, by Vite proxy in dev.
      // NEVER hard-code a localhost fallback in production; it triggers
      // Chrome's Local Network Access permission and breaks real users.
      const apiBase = import.meta.env.VITE_API_URL ?? '';
      const refresh = await fetch(`${apiBase}/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (refresh.ok) {
        const { accessToken } = (await refresh.json()) as { accessToken: string };
        setAccessToken(accessToken);
        const me = await api<{ user: CurrentUser; tenants: TenantSummary[] }>('/v1/auth/me');
        const active = me.tenants[0] ?? null;
        if (active) setCurrentTenant(active.slug);
        set({ user: me.user, tenants: me.tenants, activeTenant: active });
      }
    } catch {
      /* no session — user stays anonymous */
    } finally {
      set({ ready: true });
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null, mfaChallenge: null });
    try {
      const res = await api<
        | { accessToken: string; needsMfa?: undefined }
        | { needsMfa: true; challenge: string }
      >('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if ('needsMfa' in res && res.needsMfa) {
        set({ loading: false, mfaChallenge: res.challenge });
        return { needsMfa: true };
      }
      setAccessToken(res.accessToken);
      const me = await api<{ user: CurrentUser; tenants: TenantSummary[] }>('/v1/auth/me');
      const active = me.tenants[0] ?? null;
      if (active) setCurrentTenant(active.slug);
      set({ user: me.user, tenants: me.tenants, activeTenant: active, loading: false });
      return { needsMfa: false };
    } catch (err) {
      set({
        loading: false,
        error: err instanceof ApiError ? err.message : 'Sign-in failed. Please try again.',
      });
      throw err;
    }
  },

  submitMfa: async (code) => {
    const challenge = get().mfaChallenge;
    if (!challenge) throw new Error('no pending MFA challenge');
    set({ loading: true, error: null });
    try {
      const res = await api<{ accessToken: string }>('/v1/auth/mfa/challenge', {
        method: 'POST',
        body: JSON.stringify({ challenge, code }),
      });
      setAccessToken(res.accessToken);
      const me = await api<{ user: CurrentUser; tenants: TenantSummary[] }>('/v1/auth/me');
      const active = me.tenants[0] ?? null;
      if (active) setCurrentTenant(active.slug);
      set({
        user: me.user,
        tenants: me.tenants,
        activeTenant: active,
        loading: false,
        mfaChallenge: null,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof ApiError ? err.message : 'Verification failed.',
      });
      throw err;
    }
  },

  cancelMfa: () => set({ mfaChallenge: null, error: null }),

  signup: async ({ email, password, name, organizationName }) => {
    set({ loading: true, error: null });
    try {
      const res = await api<{ accessToken: string }>('/v1/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password, name, organizationName }),
      });
      setAccessToken(res.accessToken);
      const me = await api<{ user: CurrentUser; tenants: TenantSummary[] }>('/v1/auth/me');
      const active = me.tenants[0] ?? null;
      if (active) setCurrentTenant(active.slug);
      set({ user: me.user, tenants: me.tenants, activeTenant: active, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof ApiError ? err.message : 'Sign-up failed. Please try again.',
      });
      throw err;
    }
  },

  logout: async () => {
    try {
      await api('/v1/auth/logout', { method: 'POST' });
    } catch {
      /* proceed regardless */
    }
    setAccessToken(null);
    setCurrentTenant(null);
    set({ user: null, tenants: [], activeTenant: null });
  },

  setActiveTenant: (t) => {
    setCurrentTenant(t.slug);
    set({ activeTenant: t });
  },

  setUser: (u) => set({ user: u }),

  clearError: () => set({ error: null }),
}));
