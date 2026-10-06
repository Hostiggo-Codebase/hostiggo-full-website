'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  getStoredUserId,
  setStoredUserId,
  setStoredSession,
  clearStoredAuth,
  getBearerToken,
  type CurrentUser,
} from '@/lib/api';
import { supabase } from '@/lib/supabase';

interface AuthState {
  user: CurrentUser | null;
  userId: string | null;
  loading: boolean;
  isAuthenticated: boolean;
}

interface AuthActions {
  /** Persist the user id and load the profile (call after OTP verify or OAuth callback). */
  signIn: (userId: string) => Promise<void>;
  /**
   * Dev-only: establishes a REAL Supabase Auth session for the demo host via
   * /api/dev/demo-session, then calls signIn() for the local state. Unlike
   * plain signIn(), this is what the "Continue as demo host (dev)" button
   * should call -- without a real session, getBearerToken() (src/lib/api.ts)
   * has no access token to attach to authenticated requests, and anything
   * requiring real auth (KYC submission, listing creation, etc.) 401s.
   */
  signInAsDemoHost: (userId: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<(AuthState & AuthActions) | undefined>(undefined);

// Every same-origin /api/* call carries the caller's Bearer token, whether it
// goes through api.ts's request() or a component's own fetch(). Routes derive
// identity from that token (src/lib/auth-server.ts), so a call site that
// forgot the header would otherwise just 401. A 401 gets one silent session
// refresh + retry, so an access token that expired while the tab sat idle
// doesn't surface as "Please sign in again" mid-task.
let apiFetchInstalled = false;
const PROXIED_API_PATHS = ['/api/search', '/api/locations'];
const isInvalidRefreshTokenError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('Invalid Refresh Token') || message.includes('Refresh Token Not Found');
};

function installApiFetch() {
  if (apiFetchInstalled || typeof window === 'undefined') return;
  apiFetchInstalled = true;
  const nativeFetch = window.fetch.bind(window);

  const isOwnApi = (input: RequestInfo | URL) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    try {
      const url = new URL(raw, window.location.origin);
      // /api/search and /api/locations are rewritten to the external search
      // service (next.config.js) -- public data, and the session token must
      // never be forwarded off-platform.
      if (PROXIED_API_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) {
        return false;
      }
      return url.origin === window.location.origin && url.pathname.startsWith('/api/');
    } catch {
      return false;
    }
  };

  const withToken = (init: RequestInit | undefined, token: string | null): RequestInit => {
    const headers = new Headers(init?.headers);
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    return { ...init, headers };
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isOwnApi(input) || input instanceof Request) return nativeFetch(input, init);
    const explicitAuth = new Headers(init?.headers).has('Authorization');
    const token = explicitAuth ? null : await getBearerToken();
    const res = await nativeFetch(input, withToken(init, token));
    if (res.status !== 401 || !token || explicitAuth) return res;
    // A FormData/stream body can only be sent once; JSON strings are safe to resend.
    if (init?.body && typeof init.body !== 'string') return res;
    const { data } = await supabase.auth.refreshSession().catch(async (err) => {
      if (isInvalidRefreshTokenError(err)) {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        clearStoredAuth();
      }
      return { data: null };
    });
    const fresh = data?.session?.access_token;
    if (!fresh || fresh === token) return res;
    setStoredSession(fresh, data?.session?.refresh_token);
    return nativeFetch(input, withToken(init, fresh));
  };
}
installApiFetch();

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async (id: string) => {
    try {
      const profile = await api.getUser(id);
      setUser(profile ?? null);
    } catch (err) {
      console.error('[auth] failed to load user profile:', err);
      setUser(null);
    }
  }, []);

  // Resolve the session on mount. The real Supabase session is the only
  // thing that counts as "signed in" -- a bare user id in localStorage (which
  // anyone can type into devtools) used to be enough for the UI to treat the
  // visitor as that user. Every sign-in flow (Google, email/phone OTP,
  // dev demo host) establishes a Supabase session, so a stored id
  // with no session behind it is stale and gets cleared.
  useEffect(() => {
    let mounted = true;
    (async () => {
      let sessionUserId: string | null = null;
      try {
        const { data } = await supabase.auth.getSession();
        sessionUserId = data?.session?.user?.id ?? null;
      } catch (err) {
        if (isInvalidRefreshTokenError(err)) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          clearStoredAuth();
        }
        sessionUserId = null;
      }
      if (!mounted) return;
      if (!sessionUserId) {
        if (getStoredUserId()) clearStoredAuth();
        setLoading(false);
        return;
      }
      if (getStoredUserId() !== sessionUserId) setStoredUserId(sessionUserId);
      setUserId(sessionUserId);
      await loadUser(sessionUserId);
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [loadUser]);

  // Google OAuth, email OTP and phone OTP all now establish a real Supabase
  // Auth session client-side -- OTP verify happens server-side
  // (POST /api/auth/otp), so OTPPageContent.tsx and
  // signin/page.tsx explicitly call supabase.auth.setSession() with the
  // tokens that route returns, right after verifying. Without that, this
  // client never learns the session exists and autoRefreshToken has
  // nothing to refresh -- the access token would silently hard-expire
  // (~1hr) with no recovery short of signing in again, which was happening
  // until that fix. This listener keeps our locally-stored userId in sync
  // when one of those sessions ends outside our own signOut() call -- e.g.
  // token refresh failure after being idle, or signing out in another tab.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        clearStoredAuth();
        setUser(null);
        setUserId(null);
        return;
      }
      // Keep the fallback token copy in step with background refreshes, so
      // nothing ever sends a token that expired an hour ago.
      if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && session?.access_token) {
        setStoredSession(session.access_token, session.refresh_token);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(
    async (id: string) => {
      setStoredUserId(id);
      setUserId(id);
      setLoading(true);
      await loadUser(id);
      setLoading(false);
    },
    [loadUser],
  );

  const signInAsDemoHost = useCallback(
    async (id: string) => {
      const res = await fetch('/api/dev/demo-session', { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.error) {
        throw new Error(payload.error || `Failed to establish demo session: ${res.status}`);
      }
      const { access_token, refresh_token } = payload.data ?? {};
      if (!access_token || !refresh_token) {
        throw new Error('Demo session response missing tokens');
      }
      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) throw error;
      // Mirrors the pattern in signin/page.tsx and OTPPageContent.tsx: also
      // populate the AUTH_ACCESS_TOKEN_KEY fallback that getBearerToken()
      // (src/lib/api.ts) reads when supabase.auth.getSession() hasn't
      // resolved yet -- e.g. right after a fresh page load/navigation, while
      // the supabase-js client is still hydrating the session it just
      // persisted to localStorage. Without this, requests fired in that
      // window (like the bookings page's mount-time fetch) have no token at
      // all and 401 with "Missing or malformed Authorization header", even
      // though the real session was set correctly moments before.
      setStoredSession(access_token, refresh_token);
      await signIn(id);
    },
    [signIn],
  );

  const signOut = useCallback(async () => {
    // Invalidates the real Supabase session (Google/email OTP). Phone OTP
    // never has one client-side, so this is a harmless no-op for that case.
    // Skipping this used to leave a Google session alive after "sign out",
    // which the app would silently pick back up on the next session check.
    await supabase.auth.signOut().catch(() => {});
    clearStoredAuth();
    setUser(null);
    setUserId(null);
    router.push('/signin');
  }, [router]);

  const refresh = useCallback(async () => {
    if (userId) await loadUser(userId);
  }, [userId, loadUser]);

  return (
    <AuthContext.Provider
      value={{
        user,
        userId,
        loading,
        isAuthenticated: Boolean(userId),
        signIn,
        signInAsDemoHost,
        signOut,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
