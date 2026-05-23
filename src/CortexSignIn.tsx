"use client";

import { FormEvent, useState } from "react";
import { setAuthToken } from "./auth";

export interface CortexSignInUser {
  id: number;
  username: string;
  created_at: string;
}

export interface CortexSignInProps {
  /** Base URL of the Cortex Auth Server, no trailing slash. e.g. "https://cortex-auth.onrender.com" */
  cortexApiBase: string;
  /** localStorage key to store the token under, e.g. "canopy_auth_token" */
  tokenKey: string;
  /** Called after a successful Cortex login/register with the issued token and user. */
  onSuccess: (token: string, user: CortexSignInUser) => void;
  /** Called when the user clicks "use just this app" — show the local login form. */
  onLocalMode: () => void;
  /** App display name for the local fallback label, e.g. "Canopy". */
  appName: string;
  /** Overrides for container and sub-element class names. */
  classNames?: {
    root?: string;
    title?: string;
    subtitle?: string;
    field?: string;
    label?: string;
    input?: string;
    submitBtn?: string;
    toggleBtn?: string;
    divider?: string;
    localBtn?: string;
    error?: string;
  };
}

export function CortexSignIn({
  cortexApiBase,
  tokenKey,
  onSuccess,
  onLocalMode,
  appName,
  classNames: cx = {},
}: CortexSignInProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const endpoint = mode === "register" ? "/auth/register" : "/auth/login";
      const res = await fetch(`${cortexApiBase}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail ?? `Error ${res.status}`);
      }
      const data = await res.json();
      setAuthToken(tokenKey, data.token);
      onSuccess(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cx.root ?? ""}>
      <div>
        <p className={cx.title ?? ""} style={{ fontWeight: 600 }}>
          {mode === "register" ? "Create a Cortex account" : "Sign in with Cortex"}
        </p>
        <p className={cx.subtitle ?? ""} style={{ opacity: 0.65, fontSize: "0.8em", marginTop: 2 }}>
          One account works across Canopy, Chef, and Circuit.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
        <div className={cx.field ?? ""}>
          <label className={cx.label ?? ""} htmlFor="cx-username">Username</label>
          <input
            id="cx-username"
            className={cx.input ?? ""}
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your username"
            required
            autoComplete="username"
          />
        </div>
        <div className={cx.field ?? ""}>
          <label className={cx.label ?? ""} htmlFor="cx-password">Password</label>
          <input
            id="cx-password"
            className={cx.input ?? ""}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "register" ? "min 6 characters" : "your password"}
            required
            minLength={6}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
          />
        </div>

        {error && <p className={cx.error ?? ""} style={{ color: "red", fontSize: "0.8em" }}>{error}</p>}

        <button type="submit" disabled={loading} className={cx.submitBtn ?? ""}>
          {loading ? "Please wait…" : mode === "register" ? "Create Cortex account →" : "Sign in with Cortex →"}
        </button>

        <button
          type="button"
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
          className={cx.toggleBtn ?? ""}
          style={{ fontSize: "0.78em", opacity: 0.7, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}
        >
          {mode === "login" ? "No Cortex account? Create one" : "Already have a Cortex account? Sign in"}
        </button>
      </form>

      <div className={cx.divider ?? ""} style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}>
        <div style={{ flex: 1, height: 1, background: "currentColor", opacity: 0.15 }} />
        <span style={{ fontSize: "0.7em", opacity: 0.5, letterSpacing: "0.08em" }}>OR</span>
        <div style={{ flex: 1, height: 1, background: "currentColor", opacity: 0.15 }} />
      </div>

      <button
        type="button"
        onClick={onLocalMode}
        className={cx.localBtn ?? ""}
        style={{ fontSize: "0.82em", opacity: 0.6, background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        Use just {appName} →
      </button>
    </div>
  );
}
