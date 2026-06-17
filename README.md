# @shared/cortex

Shared auth and crypto primitives for Next.js apps in this monorepo (canopy, chef, circuit).

## What's in here

| Export | File | Description |
|--------|------|-------------|
| `AuthProvider`, `useAuth`, `AuthUser` | `src/AuthContext.tsx` | React context — optimistically restores auth state from cache on mount, then silently revalidates with the server |
| `CortexSignIn`, `CortexSignInProps`, `CortexSignInUser` | `src/CortexSignIn.tsx` | Drop-in sign-in form for Cortex accounts with a "use just this app" local-mode escape hatch |
| `getAuthToken`, `setAuthToken` | `src/auth.ts` | `localStorage` token helpers keyed by a caller-supplied key |
| `getCachedUser`, `setCachedUser` | `src/auth.ts` | `localStorage` user-object cache keyed by token key (used internally by `AuthProvider`) |
| `encryptBlob`, `decryptBlob` | `src/crypto.ts` | AES-GCM-256 encryption with PBKDF2-SHA256 (390k iterations), random salt+IV per encryption |

## Installing in a Next.js app

Add to `package.json`:

```json
"@shared/cortex": "github:sameeradsv/cortex"
```

Add to `next.config.ts` (required — package ships raw TypeScript source):

```ts
const nextConfig: NextConfig = {
  transpilePackages: ["@shared/cortex"],
  // ...
};
```

Run `npm install`, then commit the updated `package-lock.json`. When cortex is updated, re-run `npm install` in the consuming repo to pull the new commit.

## Usage

### Auth context

```tsx
// layout.tsx
import { AuthProvider } from "@shared/cortex";

<AuthProvider apiBase={process.env.NEXT_PUBLIC_API_URL ?? ""} tokenKey="myapp_auth_token">
  {children}
</AuthProvider>
```

```tsx
// any page
import { useAuth } from "@shared/cortex";

const { user, loading, logout, refetch } = useAuth();
```

`AuthProvider` props:
- `apiBase` — backend base URL, no trailing slash (e.g. `""` for dev proxy, `"https://api.example.com"` for production)
- `tokenKey` — `localStorage` key to read/write the bearer token
- `authPath` — optional, defaults to `"/api/auth"`; prefix for `/me` and `/logout` endpoints

**Optimistic auth:** on mount, `AuthProvider` immediately restores `user` and sets `loading: false` from a localStorage cache, then revalidates with the server in the background. Consuming apps render without waiting for a network round-trip. If the server rejects the token (expired/invalid), the user is redirected to `/login` after the background check completes. A network error during revalidation preserves the cached state rather than logging the user out. The background fetch is cancelled via `AbortController` if the component unmounts before it completes.

**Instant logout:** `logout()` clears the token, cache, and user state then redirects immediately — the UI responds without waiting for the server. The `DELETE /auth/logout` request fires in the background to invalidate the server-side session.

`loading` is only `true` on the very first visit (no cache yet). All subsequent validations — including `refetch()` — run silently without setting `loading: true`.

`refetch()` re-runs the background validation and updates `user` with a fresh server response. Call it after a successful login (e.g. inside `CortexSignIn`'s `onSuccess`) to sync auth state without a page reload.

### CortexSignIn component

Drop-in form that handles Cortex account login/register and exposes a "use just this app" escape hatch for local-mode auth.

```tsx
import { CortexSignIn } from "@shared/cortex";

<CortexSignIn
  cortexApiBase={process.env.NEXT_PUBLIC_CORTEX_URL ?? ""}
  tokenKey="myapp_auth_token"
  appName="Canopy"
  onSuccess={(token, user) => {
    // token already stored in localStorage by the component;
    // call refetch() from useAuth() or redirect to your app
  }}
  onLocalMode={() => {
    // switch to your local login form
  }}
/>
```

`CortexSignIn` props:

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `cortexApiBase` | `string` | ✓ | Base URL of the Cortex Auth Server, no trailing slash |
| `tokenKey` | `string` | ✓ | `localStorage` key to store the issued token under |
| `onSuccess` | `(token, user) => void` | ✓ | Called after a successful login or register |
| `onLocalMode` | `() => void` | ✓ | Called when the user clicks "Use just \<appName\>" |
| `appName` | `string` | ✓ | App display name shown in the local-mode label (e.g. `"Canopy"`) |
| `showHeader` | `boolean` | — | Show the built-in title/subtitle. Set to `false` when the parent page already has a heading. Defaults to `true`. |
| `autoFocus` | `boolean` | — | Focus the username field on mount. Defaults to `false` — leave it off on mobile as it immediately opens the on-screen keyboard. |
| `classNames` | `object` | — | Optional overrides for individual element class names (`root`, `title`, `subtitle`, `field`, `label`, `input`, `submitBtn`, `toggleBtn`, `divider`, `localBtn`, `error`) |

**Default responsive styles:** when no `classNames` overrides are provided, the component applies sensible mobile-first defaults — labels are block-level with a 4px bottom gap, inputs are full-width (`width: 100%`, `box-sizing: border-box`), and the submit button is full-width with a 44px minimum height (matching Apple/Google touch-target guidelines). Toggle and local-mode buttons have `12px` vertical padding for the same reason. Passing any of the corresponding `classNames` keys hands full styling control to the caller and removes the inline defaults for that element.

### Token helpers

```ts
import { getAuthToken, setAuthToken } from "@shared/cortex";

const token = getAuthToken("myapp_auth_token");
setAuthToken("myapp_auth_token", null); // clears the token
```

`getCachedUser` and `setCachedUser` are used internally by `AuthProvider` but are exported if you need to pre-populate or invalidate the cache manually (e.g. after a server-side session invalidation).

### Encryption

```ts
import { encryptBlob, decryptBlob } from "@shared/cortex";

const encrypted = await encryptBlob(plaintext, passphrase); // returns Record<string, string>
const plaintext = await decryptBlob(encrypted, passphrase); // returns string
```

`decryptBlob` also accepts blobs with `format: "canopy-encrypted-export"` (the legacy format used before this package was extracted from Canopy), so old encrypted data migrates without any conversion step.

## Auth server

The `server/` directory is a FastAPI identity service deployed to Render backed by a Neon PostgreSQL database.

- **Lifespan startup:** `Base.metadata.create_all` runs inside the FastAPI `lifespan` context, after uvicorn is ready to serve. The `/health` endpoint is available immediately on cold start while DB init completes in the background.
- **Connection resilience:** `pool_pre_ping=True` on the SQLAlchemy engine re-tests connections before use, preventing stale-connection errors after Neon's serverless pooler drops idle connections.
- **`/auth/me` response caching:** the endpoint sets `Cache-Control: private, max-age=30` so the browser reuses the response for 30 seconds. Multiple tabs opening at the same time hit the server once rather than once per tab.
- **Pool sizing:** `pool_size=2, max_overflow=3` — tuned for a single Render free-tier instance against Neon's connection limits. SQLite (local dev) uses default pool settings.
- **`created_at` format:** all API responses serialize `created_at` as ISO 8601 (`"2024-01-15T10:30:00"`) via Pydantic's `model_validate` — the `AuthUser.created_at: string` field on the frontend receives this directly.

## Viewing the Neon database

Each app (Canopy, Chef, Circuit) and the Cortex auth server each have their own Neon PostgreSQL database. Four ways to browse or query data:

### Getting the connection string

**From Render (quickest):** go to the app's Render service → **Environment** tab → copy `DATABASE_URL`. It has this shape:

```
postgresql://user:password@ep-xxxx-xxxx.region.aws.neon.tech/dbname?sslmode=require
                                                              ──────
                                                         ↑ database name
```

The database name is everything between the last `/` and the `?`. That name is also visible in the Neon console under **Connection Details**.

**From Neon directly:** [console.neon.tech](https://console.neon.tech) → open the project → **Connection Details** → copy the connection string.

---

### 1. Neon console SQL editor (no install)
[console.neon.tech](https://console.neon.tech) → open the project → **SQL Editor** tab. Run any query directly.

### 2. psql
```bash
psql "postgresql://user:password@ep-xxxx.neon.tech/dbname?sslmode=require"
# or if DATABASE_URL is already in your environment:
psql "$DATABASE_URL"
```

### 3. GUI client (TablePlus / DBeaver / pgAdmin)
Paste the connection string. TablePlus has a free tier and works well on Windows/Mac.

### 4. App export endpoint (no DB client needed)
Each app exposes a JSON dump of the current user's data:
```
GET /api/export
Authorization: Bearer <token>
```
Returns all records as JSON. Useful for quick data checks without a DB client. Requires a valid token in all environments.

---

### Example queries per app

**Cortex auth server** (`server/`)
```sql
-- all registered users
SELECT id, username, created_at FROM users ORDER BY created_at DESC;

-- active (non-expired) sessions
SELECT token, user_id, expires_at FROM auth_sessions
WHERE expires_at > NOW() ORDER BY expires_at DESC;
```

**Canopy** (people & interactions)
```sql
-- all people
SELECT id, name, relationship_type, created_at FROM people ORDER BY created_at DESC;

-- recent interactions
SELECT id, summary, occurred_at, person_id FROM interactions
ORDER BY occurred_at DESC LIMIT 20;

-- interactions for a specific person
SELECT i.summary, i.occurred_at FROM interactions i
JOIN people p ON p.id = i.person_id
WHERE p.name ILIKE '%alice%'
ORDER BY i.occurred_at DESC;
```

**Chef** (pantry & decisions)
```sql
-- current pantry
SELECT name, quantity, unit, expiry_date FROM ingredients
WHERE discarded_at IS NULL ORDER BY expiry_date ASC NULLS LAST;

-- expiring within 3 days
SELECT name, expiry_date FROM ingredients
WHERE discarded_at IS NULL AND expiry_date <= NOW() + INTERVAL '3 days'
ORDER BY expiry_date ASC;

-- recent decisions (timestamp = IST meal time; decision: cook | order | eat_out)
SELECT decision, recipe_name, restaurant_name, satisfaction, cost, timestamp
FROM cooking_history ORDER BY timestamp DESC LIMIT 20;

-- average satisfaction by decision type
SELECT decision, ROUND(AVG(satisfaction), 1) AS avg_sat, COUNT(*) AS count
FROM cooking_history WHERE satisfaction IS NOT NULL GROUP BY decision;
```

**Circuit** (tasks)
```sql
-- all incomplete tasks
SELECT id, text, tag, scheduled_at FROM tasks
WHERE completed = false ORDER BY scheduled_at ASC NULLS LAST;

-- tasks by tag
SELECT text, tag, completed FROM tasks WHERE tag = 'work' ORDER BY created_at DESC;
```

## Updating cortex

Edit the source in this repo, commit, and push. Then in each consuming repo:

```bash
npm install  # pulls the new commit SHA into package-lock.json
git add package-lock.json && git commit -m "chore: update @shared/cortex"
git push
```
