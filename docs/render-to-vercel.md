# Render to Vercel FastAPI Migration

Use this playbook when moving one of the sibling app backends from Render free-tier web services to Vercel Hobby Python Functions.

The goal is consistent free-tier compute with faster perceived startup, while keeping the existing database and avoiding extra paid services.

## Applicability

Use this path for apps with this shape:

- FastAPI backend
- PostgreSQL via `DATABASE_URL`
- Static or separately hosted frontend
- No required always-on background worker
- Request/response or SSE-style streaming endpoints

Do not use this as-is for services that require durable local filesystem writes, long-running jobs, WebSockets, cron workers, or an always-warm process.

## Repository Changes

Create a Vercel Python entrypoint under the backend root:

```text
backend/
  api/
    index.py
```

`backend/api/index.py`:

```python
from app.main import app
```

Add `backend/.python-version`:

```text
3.12
```

Add `backend/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "api/index.py": {
      "maxDuration": 300,
      "excludeFiles": "{tests/**,**/__pycache__/**,**/*.pyc,*.db}"
    }
  },
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/api/index.py"
    }
  ]
}
```

Important: keep the configured function path under `api/`. Vercel rejects patterns like `app/index.py` in the `functions` block with:

```text
The pattern "app/index.py" defined in `functions` doesn't match any Serverless Functions inside the `api` directory.
```

## Startup Work

Render tolerated startup hooks that ran schema creation on each container boot. On Vercel, each cold function instance can pay that cost. Move schema setup out of the hot path.

Recommended setting:

```text
INIT_DB_ON_STARTUP=false
```

Keep the default enabled for local development, but disable it in Vercel after the database has been initialized.

For new databases, provide a one-shot command:

```bash
cd backend
DATABASE_URL="postgresql://..." python -m app.database
```

For existing production databases already used by Render, reuse the same `DATABASE_URL` and set `INIT_DB_ON_STARTUP=false`.

## Vercel Project Setup

Create one Vercel project per backend app.

Project settings:

```text
Framework Preset: Other
Root Directory: backend
Install Command: pip install -r requirements.txt
Build Command: blank/default
Output Directory: blank/default
```

Required environment variables:

```text
DATABASE_URL=postgresql://...
AUTH_REQUIRED=true
CORS_ORIGINS=https://<frontend-origin>
INIT_DB_ON_STARTUP=false
```

Optional/common variables:

```text
GROQ_API_KEY=<key>
CORTEX_AUTH_URL=https://<cortex-auth-host>
```

For apps using WebAuthn/passkeys:

```text
WEBAUTHN_RP_ID=<frontend-hostname-without-scheme>
WEBAUTHN_ORIGIN=https://<frontend-hostname>
WEBAUTHN_RP_NAME=<app-name>
```

After deploy, verify:

```text
https://<project>.vercel.app/api/health
```

Then update the frontend build variable for that app, for example:

```text
CANOPY_API_URL=https://canopy-api.vercel.app
NEXT_PUBLIC_CIRCUIT_API_URL=https://circuit-api.vercel.app
NEXT_PUBLIC_CHEF_API_URL=https://chef-api.vercel.app
CORTEX_AUTH_URL=https://cortex-auth.vercel.app
```

## Cleanup Checklist

After the Vercel backend is live:

- Remove `render.yaml` unless intentionally keeping a rollback path.
- Remove Render deploy-hook jobs from GitHub Actions.
- Remove `RENDER_DEPLOY_HOOK` secrets when no app uses them.
- Replace `onrender.com` examples with `vercel.app` examples.
- Replace Render-specific cold-start comments with generic serverless wording.
- Keep Neon/PostgreSQL documentation; only compute moved.
- Keep retry-on-network-error client behavior if it is already harmless.

## Validation

Run the backend test suite:

```bash
cd backend
pytest
```

Verify the Vercel entrypoint imports:

```bash
cd backend
python -c "from api.index import app; print(app.title)"
```

Smoke test deployed routes:

```text
GET /api/health
POST /api/auth/login or /api/auth/register
GET authenticated list endpoint
POST one write endpoint
SSE/chat endpoint, if the app has one
WebAuthn registration/login, if enabled
```

## Lessons From Canopy

- `functions` config must target `api/index.py`, not `app/index.py`.
- Keep `api/index.py` tiny; import the existing FastAPI `app`.
- Disable startup DB initialization on Vercel once schema exists.
- Do not use SQLite for Vercel production.
- WebAuthn needs explicit RP/origin variables after host changes.
- GitHub Pages/static frontends only need their API URL variable updated.
- A health check in the frontend deploy workflow should fail fast when the API URL is missing or unhealthy.
