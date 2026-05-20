# @shared/cortex

Shared auth and crypto primitives for Next.js apps in this monorepo (canopy, chef, circuit).

## What's in here

| Export | File | Description |
|--------|------|-------------|
| `AuthProvider`, `useAuth`, `AuthUser` | `src/AuthContext.tsx` | React context that validates a stored token against the backend on mount, exposes `user`, `loading`, `logout`, and `refetch` |
| `getAuthToken`, `setAuthToken` | `src/auth.ts` | `localStorage` token helpers keyed by a caller-supplied key |
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
import { AuthProvider } from "@/lib/AuthContext";

<AuthProvider apiBase={process.env.NEXT_PUBLIC_API_URL ?? ""} tokenKey="myapp_auth_token">
  {children}
</AuthProvider>
```

```tsx
// any page
import { useAuth } from "@/lib/AuthContext";

const { user, loading, logout, refetch } = useAuth();
```

`AuthProvider` props:
- `apiBase` — backend base URL, no trailing slash (e.g. `""` for dev proxy, `"https://api.example.com"` for production)
- `tokenKey` — `localStorage` key to read/write the bearer token
- `authPath` — optional, defaults to `"/api/auth"`; prefix for `/me` and `/logout` endpoints

### Token helpers

```ts
import { getAuthToken, setAuthToken } from "@shared/cortex";

const token = getAuthToken("myapp_auth_token");
setAuthToken("myapp_auth_token", null); // clears the token
```

### Encryption

```ts
import { encryptBlob, decryptBlob } from "@shared/cortex";

const encrypted = await encryptBlob(plaintext, passphrase); // returns Record<string, string>
const plaintext = await decryptBlob(encrypted, passphrase); // returns string
```

## Updating cortex

Edit the source in this repo, commit, and push. Then in each consuming repo:

```bash
npm install  # pulls the new commit SHA into package-lock.json
git add package-lock.json && git commit -m "chore: update @shared/cortex"
git push
```
