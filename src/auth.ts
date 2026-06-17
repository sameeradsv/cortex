export function getAuthToken(tokenKey: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(tokenKey);
}

export function setAuthToken(tokenKey: string, token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(tokenKey, token);
  else localStorage.removeItem(tokenKey);
}

export function getCachedUser<T>(tokenKey: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${tokenKey}_user`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function setCachedUser<T>(tokenKey: string, user: T | null): void {
  if (typeof window === "undefined") return;
  if (user) localStorage.setItem(`${tokenKey}_user`, JSON.stringify(user));
  else localStorage.removeItem(`${tokenKey}_user`);
}
