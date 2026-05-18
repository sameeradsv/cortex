"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { getAuthToken, setAuthToken } from "./auth";

export interface AuthUser {
  id: number;
  username: string;
  created_at: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  logout: async () => {},
});

interface AuthProviderProps {
  children: React.ReactNode;
  /** Base URL without trailing slash, e.g. "" (dev proxy) or "https://api.fly.dev" */
  apiBase: string;
  /** localStorage key for the auth token, e.g. "canopy_auth_token" */
  tokenKey: string;
}

export function AuthProvider({ children, apiBase, tokenKey }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = getAuthToken(tokenKey);
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${apiBase}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((u: AuthUser) => setUser(u))
      .catch(() => setAuthToken(tokenKey, null))
      .finally(() => setLoading(false));
  }, [apiBase, tokenKey]);

  const logout = useCallback(async () => {
    const token = getAuthToken(tokenKey);
    try {
      await fetch(`${apiBase}/api/auth/logout`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      // proceed even if server call fails
    }
    setAuthToken(tokenKey, null);
    setUser(null);
    router.push("/login");
  }, [apiBase, tokenKey, router]);

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
