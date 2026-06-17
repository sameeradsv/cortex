"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { getAuthToken, setAuthToken, getCachedUser, setCachedUser } from "./auth";

export interface AuthUser {
  id: number;
  username: string;
  created_at: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  /** Call after storing a new token (e.g. after login) to update auth state without a page reload. */
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  logout: async () => {},
  refetch: async () => {},
});

interface AuthProviderProps {
  children: React.ReactNode;
  /** Base URL without trailing slash, e.g. "" (dev proxy) or "https://myapp.onrender.com" */
  apiBase: string;
  /** localStorage key for the auth token, e.g. "canopy_auth_token" */
  tokenKey: string;
  /** Path prefix for auth endpoints, e.g. "/api/auth" (default) or "/auth" */
  authPath?: string;
}

export function AuthProvider({ children, apiBase, tokenKey, authPath = "/api/auth" }: AuthProviderProps) {
  // Start null/true to match SSR; useEffect applies cache before first paint.
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const validate = useCallback(async (signal?: AbortSignal) => {
    const token = getAuthToken(tokenKey);
    if (!token) {
      setCachedUser(tokenKey, null);
      setUser(null);
      setLoading(false);
      return;
    }
    // Apply cache immediately so the UI renders before the network round-trip.
    const cached = getCachedUser<AuthUser>(tokenKey);
    if (cached) {
      setUser(cached);
      setLoading(false);
    }
    let aborted = false;
    try {
      const res = await fetch(`${apiBase}${authPath}/me`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (res.ok) {
        const fresh: AuthUser = await res.json();
        setCachedUser(tokenKey, fresh);
        setUser(fresh);
      } else {
        setAuthToken(tokenKey, null);
        setCachedUser(tokenKey, null);
        setUser(null);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") aborted = true;
      // Network error — keep existing state rather than logging the user out.
    } finally {
      if (!aborted) setLoading(false);
    }
  }, [apiBase, authPath, tokenKey]);

  useEffect(() => {
    const controller = new AbortController();
    validate(controller.signal);
    return () => controller.abort();
  }, [validate]);

  const logout = useCallback(async () => {
    const token = getAuthToken(tokenKey);
    try {
      await fetch(`${apiBase}${authPath}/logout`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      // proceed even if server call fails
    }
    setAuthToken(tokenKey, null);
    setCachedUser(tokenKey, null);
    setUser(null);
    router.push("/login");
  }, [apiBase, authPath, tokenKey, router]);

  const refetch = useCallback(async () => {
    await validate();
  }, [validate]);

  return (
    <AuthContext.Provider value={{ user, loading, logout, refetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
