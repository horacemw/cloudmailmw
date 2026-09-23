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
  isPlatformAdmin: boolean;
  mfaEnabled: boolean;
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
    // Two-phase: (1) silent refresh via cm_rt cookie to acquire an access
    // token, (2) /me to hydrate user + tenants. If phase 1 fails, the user
    // has no session — render them anonymous. If phase 2 fails after phase 1
    // succeeded, RETRY /me a couple times before giving up: a transient
    // network hiccup should not evict a valid session on page reload.
    const apiBase = import.meta.env.VITE_API_URL ?? '';
    let refreshOk = false;
    try {
      const refresh = await fetch(`${apiBase}/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (refresh.ok) {
        refreshOk = true;
        const { accessToken } = (await refresh.json()) as { accessToken: string };
        setAccessToken(accessToken);
      } else if (refresh.status !== 401) {
        // 401 = no/expired refresh cookie (normal for anonymous or stale user).
        // Anything else is unexpected — surface it in the console so the
        // customer's DevTools has a hint we can debug against.
        console.warn('[auth.bootstrap] refresh returned unexpected status', refresh.status);
      }
    } catch (err) {
      console.warn('[auth.bootstrap] refresh network error', err);
    }

    if (refreshOk) {
      // /me hydration with 2 retries + short backoff. Only retries on
      // NETWORK/5xx failures; a 401 here means the token we just minted is
      // already invalid, which is a real logout and shouldn't be retried.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const me = await api<{ user: CurrentUser; tenants: TenantSummary[] }>('/v1/auth/me');
          const active = me.tenants[0] ?? null;
          if (active) setCurrentTenant(active.slug);
          set({ user: me.user, tenants: me.tenants, activeTenant: active });
          break;
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            console.warn('[auth.bootstrap] /me returned 401 after successful refresh — token likely revoked');
            break;
          }
          if (attempt === 2) {
            console.warn('[auth.bootstrap] /me failed after 3 attempts', err);
            break;
          }
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
    }

    set({ ready: true });
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
