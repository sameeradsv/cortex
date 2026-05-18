export function getAuthToken(tokenKey: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(tokenKey);
}

export function setAuthToken(tokenKey: string, token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(tokenKey, token);
  else localStorage.removeItem(tokenKey);
}
