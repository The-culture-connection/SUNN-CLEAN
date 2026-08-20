# Deploying to Railway

The repo is a monorepo. The deployable app lives in `WEBSITE/`, **not** at the repo
root. The repo root only contains docs and static HTML mockups — no `package.json`.

That is why builds failed with:

```
⚠ Script start.sh not found
✖ No start command detected.
```

Railpack was looking at the repo root, found no Node project, and had nothing to run.

## Required settings — per service

You need **two** Railway services (customer + admin), both pointing at this same repo.
For each one, under **Settings**:

| Setting | Customer service | Admin service |
| --- | --- | --- |
| Root Directory | `WEBSITE` | `WEBSITE` |
| Config-as-code path | `railway.customer.json` | `railway.admin.json` |

Setting **Root Directory** is the fix for the build error. The config path is what keeps
the two services running different apps out of one directory.

### If the config file isn't picked up

Some Railway projects resolve the config path from the repo root rather than the service
root. If the build log doesn't mention your config file, either set the path to
`WEBSITE/railway.customer.json` / `WEBSITE/railway.admin.json`, or skip config-as-code
entirely and set these two fields directly in **Settings → Build / Deploy**:

| | Customer | Admin |
| --- | --- | --- |
| Build Command | `npm run build:customer` | `npm run build:admin` |
| Start Command | `npm run start:customer` | `npm run start:admin` |

Do **not** put `npm ci` in the build command — Railway already runs an install step, and
repeating it roughly doubles build time.

## Ports

Both apps read `$PORT` (`next start -p ${PORT:-3000}`), which Railway injects. Leave the
port unset in Railway; don't hardcode 3000/3001.

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
