# @shared/cortex

Shared auth and crypto primitives for Next.js apps in this monorepo (canopy, chef, circuit).

## What's in here

| Export | File | Description |
|--------|------|-------------|
| `AuthProvider`, `useAuth`, `AuthUser` | `src/AuthContext.tsx` | React context that validates a stored token against the backend on mount, exposes `user`, `loading`, `logout`, and `refetch` |
| `CortexSignIn`, `CortexSignInProps`, `CortexSignInUser` | `src/CortexSignIn.tsx` | Drop-in sign-in form for Cortex accounts with a "use just this app" local-mode escape hatch |
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
| `classNames` | `object` | — | Optional overrides for individual element class names (`root`, `title`, `subtitle`, `field`, `label`, `input`, `submitBtn`, `toggleBtn`, `divider`, `localBtn`, `error`) |

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

`decryptBlob` also accepts blobs with `format: "canopy-encrypted-export"` (the legacy format used before this package was extracted from Canopy), so old encrypted data migrates without any conversion step.

## Updating cortex

Edit the source in this repo, commit, and push. Then in each consuming repo:

```bash
npm install  # pulls the new commit SHA into package-lock.json
git add package-lock.json && git commit -m "chore: update @shared/cortex"
git push
```
