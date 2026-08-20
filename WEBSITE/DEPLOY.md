# Deploying to Railway

This is an npm-workspaces monorepo. The deployable apps live in `WEBSITE/`, **not** at the
repo root — the root only holds docs and static HTML mockups.

Two Railway services deploy from this one directory:

- **customer** → `@sunnclean/customer` (Next.js, port from `$PORT`)
- **admin** → `@sunnclean/admin` (Next.js, port from `$PORT`)

## Required settings — per service

Under each service's **Settings**:

| Setting | Customer service | Admin service |
| --- | --- | --- |
| Root Directory | `WEBSITE` | `WEBSITE` |
| Build Command | `npm run build:customer` | `npm run build:admin` |
| Start Command | `npm run start:customer` | `npm run start:admin` |

Set **Build Command** and **Start Command** explicitly in the Railway UI. Do not rely on
auto-detection, and do not rely on the `railway.*.json` files (see below).

### Why the commands must be explicit

Railpack auto-detects a start command by checking, in order:

1. a `start` script in `package.json`
2. a `main` field
3. `index.js` / `index.ts` in the project root
4. an Nx workspace

This repo matches none of them, by design. The root `package.json` deliberately has no
plain `start` script — it has `start:customer` and `start:admin`, because a single `start`
could only ever launch one of the two apps. Railpack cannot guess which app a given
service should run, so it fails with:

```
✖ No start command detected.
```

That error means "tell me which app", not "your build is broken".

### About railway.admin.json / railway.customer.json

Railway only auto-loads a config file named `railway.json` or `railway.toml`. These files
use custom names, so they are **not** read unless a config path is set per service — and
in practice that path setting has not resolved correctly alongside a Root Directory of
`WEBSITE`.

Treat these two files as documentation of intent. The Railway UI settings in the table
above are the source of truth. If you do get config-as-code working, try the path
`WEBSITE/railway.customer.json` (relative to the repo root, not the service root).

Do **not** put `npm ci` in the build command — Railway already runs an install step, and
repeating it roughly doubles build time.

## Ports

Both apps run `next start -p ${PORT:-3000}` and read `$PORT`, which Railway injects. Leave
the port unset in Railway; don't hardcode 3000/3001.

## Environment variables

Set these on **both** services (see `.env.example`):

```
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY_BASE64      # base64 of the service-account private key
FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
BUSINESS_TIMEZONE
NEXT_PUBLIC_SITE_URL             # the customer service's public URL
NEXT_PUBLIC_ADMIN_URL            # the admin service's public URL
ADMIN_ALLOWED_EMAILS
```

`NEXT_PUBLIC_*` values are inlined at build time, so changing one requires a redeploy,
not just a restart.

## Node version

`.nvmrc` pins Node 20; Railpack reads it automatically.

## Security note

Never commit service-account JSON. `FIREBASE_PRIVATE_KEY_BASE64` belongs in Railway's
variables, and the root `.gitignore` blocks `*firebase-adminsdk*.json`.
