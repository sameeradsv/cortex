# CLAUDE.md — Cortex

This file provides guidance to Claude Code when working with code in this repository.

## Commands

```bash
# TypeScript library (consumed by canopy, chef, circuit, conduit)
npm install
npm run build        # tsc compile check (no emit — consumers transpile via Next.js)

# Auth server
cd server
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8004
```

Dev env (`.env` in `server/`):
```bash
DATABASE_URL=sqlite:///./data/cortex.db   # Postgres in production (Neon)
CORS_ORIGINS=http://localhost:3000        # dev only; never add localhost to Vercel project env
INIT_DB_ON_STARTUP=true                   # local default; set false in Vercel after schema init
```

## What's in this repo

| Part | Path | Description |
|------|------|-------------|
| Shared TS library | `src/` | Auth context, sign-in form, token helpers, AES-GCM crypto |
| FastAPI auth server | `server/` | Identity service — users, sessions, password reset |

### TypeScript exports (`src/index.ts`)

| Export | File | Description |
|--------|------|-------------|
| `AuthProvider`, `useAuth`, `AuthUser` | `AuthContext.tsx` | Optimistic auth — restores from localStorage cache on mount, revalidates silently |
| `CortexSignIn`, `CortexSignInProps`, `CortexSignInUser` | `CortexSignIn.tsx` | Drop-in sign-in form with local-mode escape hatch |
| `getAuthToken`, `setAuthToken`, `getCachedUser`, `setCachedUser` | `auth.ts` | localStorage token/user helpers keyed by caller-supplied key |
| `encryptBlob`, `decryptBlob` | `crypto.ts` | AES-GCM-256 + PBKDF2-SHA256 (390k iterations); decryptBlob reads stored `blob.iterations` for legacy compatibility |

### Auth server endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/auth/status` | — | `{ has_users: boolean }` |
| `POST` | `/auth/register` | — | 3/min rate limit; username `[a-z0-9_.-]+`; min 6-char password |
| `POST` | `/auth/login` | — | 5/min rate limit |
| `GET` | `/auth/me` | Bearer | `Cache-Control: private, max-age=30` |
| `DELETE` | `/auth/logout` | Bearer | Invalidates current session |
| `DELETE` | `/auth/account` | Bearer | Deletes account + all sessions |
| `POST` | `/auth/request-reset` | — | 3/hour; stores `PasswordResetToken` (1h TTL); same response whether user exists or not |
| `POST` | `/auth/reset-password` | — | 5/min; validates token, rehashes password, invalidates all sessions |

**Password reset note**: email delivery not implemented — retrieve token via Neon SQL editor (`SELECT token FROM password_reset_tokens WHERE expires_at > NOW();`).

## Key invariants

**Optimistic auth**: `AuthProvider` immediately restores user from localStorage cache on mount (`loading: false`), then revalidates in the background. Network errors preserve cached state rather than logging out. `loading` is only `true` on the very first visit. Call `refetch()` after login to sync without a page reload.

**Instant logout**: `logout()` clears token/cache/user and redirects immediately; `DELETE /auth/logout` fires in the background.

**`CortexSignIn` error extraction**: FastAPI's `detail` field is a string for `HTTPException` responses but an array of `{loc, msg, type}` objects for Pydantic 422 validation errors. `CortexSignIn` checks the type: strings are used directly; arrays have `.msg` extracted from each item and joined with `"; "`. Do not simplify this to `detail?.detail` — that coerces arrays to `[object Object]`.

**Crypto**: `encryptBlob` always uses 390k PBKDF2 iterations. `decryptBlob` reads `blob.iterations` if present so legacy blobs with different iteration counts decrypt correctly.

**Username format**: `[a-z0-9_.-]+`, lowercase, enforced on both register and login (`.strip().lower()`).

**Session model**: `auth_sessions` table; `AuthSession.user_id` and `PasswordResetToken.user_id` both have `index=True` for O(1) DELETE WHERE user_id queries during password reset and session cleanup.

**CORS**: `CORS_ORIGINS` env var required; no localhost fallback in `main.py` or deployment config. Add `http://localhost:3000` to a local `.env` file for development.

**Vercel**: backend deploys from `server/` with `server/api/index.py` importing `app.main:app`. Set `INIT_DB_ON_STARTUP=false` in Vercel after the database schema exists. For one-shot schema init/migrations, run `cd server && DATABASE_URL="postgresql://..." python -m app.database`.

**Rate limiting**: uses `slowapi` with `get_remote_address` key. Register: 3/min. Login: 5/min. Request-reset: 3/hour. Reset-password: 5/min.

**`slowapi` + FastAPI body injection incompatibility**: `@limiter.limit` wraps the route function, hiding Pydantic model type annotations from FastAPI's dependency injector — FastAPI treats the parameter as a query param and returns 422 "Field required". Using `= Body()` as default is worse: FastAPI injects the raw `FieldInfo` object, causing `AttributeError` that escapes past `CORSMiddleware` to `ServerErrorMiddleware` (outside CORS) → 500 with no CORS headers → "Failed to fetch" in browser. **Fix**: all rate-limited endpoints that take a JSON body must use `async def` + `await request.json()` + `Model.model_validate()` via the `_parse_body` helper. Never add a typed Pydantic parameter to a `@limiter.limit`-decorated route.

## Installing in a consuming app

```json
"@shared/cortex": "github:sameeradsv/cortex"
```

```ts
// next.config.ts
const nextConfig: NextConfig = {
  transpilePackages: ["@shared/cortex"],
};
```

When cortex is updated, run `npm install` in each consuming repo to pull the new commit SHA.

## Consuming apps

| App | Token key | Cortex auth URL env var |
|-----|-----------|------------------------|
| canopy | `canopy_auth_token` | `NEXT_PUBLIC_CORTEX_URL` |
| chef | `chef_auth_token` | `NEXT_PUBLIC_CORTEX_URL` |
| circuit | `circuit_auth_token` | `NEXT_PUBLIC_CORTEX_URL` |
| conduit | `conduit_auth_token` | `NEXT_PUBLIC_CORTEX_URL` |

Each app uses `CortexSignIn` as the primary sign-in path, with a "Use just this app" escape hatch for local-mode auth.

## UI & Responsive Standards

All UI changes to `CortexSignIn` and any future auth UI must work correctly across every view:

| View | Width | Notes |
|------|-------|-------|
| Mobile portrait | ≤ 430 px | Primary design target |
| Mobile landscape | ≤ 932 px, short viewport | No horizontal scroll; critical controls visible |
| Tablet / iPad | 768–1024 px | Component is typically embedded in a page; respond to container width |
| Laptop / desktop | ≥ 1025 px | Full layout |

**Touch targets**: 44 × 44 px minimum on all buttons (submit, toggle, local-mode). Already enforced via `min-height: 44px` on the submit button and `padding: 12px` on toggle/local buttons.

**`autoFocus`**: off by default — passing `autoFocus={true}` opens the on-screen keyboard immediately on mobile; leave it off unless the page has no other focusable content above the fold.

**No localhost**: never add `localhost` or `127.0.0.1` to production `CORS_ORIGINS`, Vercel project env, or Pydantic config defaults. Dev origins belong in `.env` only.
