# SUNN CLEAN — booking platform

Two websites and one shared engine.

| | What it is | Runs on |
|---|---|---|
| `apps/customer` | The public website customers book on | Railway service #1, port 3000 |
| `apps/admin` | The portal you run the business from | Railway service #2, port 3001 |
| `packages/shared` | Pricing + scheduling engine, Firestore access | imported by both |

**Nothing about your prices is hardcoded.** There are no service names, rates,
minimums or job durations anywhere in this code. Every one of them comes from
the Services & Add-ons page in the admin portal. Until you add at least one
service and one crew, the booking page politely tells visitors to call you.

---

## Getting it running

### 1. What you need

- The Firebase project `sunn-cleaning` (already created)
- A Railway account
- The GitHub repo

### 2. Firebase console — three things to switch on

1. **Firestore Database** → Create database → production mode
2. **Storage** → Get started
3. **Authentication** → Sign-in method → enable **Email/Password**
4. Upgrade the project to the **Blaze (pay-as-you-go)** plan.
   Set a **budget alert at $25/month** in the Google Cloud console. Your actual
   bill will almost certainly be a couple of dollars — the free allowances cover
   most of this — but set the alert anyway.

### 3. Your Web API key

Already supplied: `AIzaSyBWHMSO8RdQq0r0n6LYgdn_I99wuqLrYv4`

**One key, and only the admin service needs it.** The key belongs to the
Firebase *project*, not to a site — there is no second key for the second site.
And the customer site doesn't use it at all: `NEXT_PUBLIC_FIREBASE_API_KEY`
appears in exactly one file, the admin login screen. Customers never sign in,
so the customer app doesn't even have the Firebase browser SDK installed.

**It is not a secret.** It ships inside the login page's JavaScript, so anyone
can read it from their browser. It identifies your project; it grants nothing.
What protects the portal is the password, the `admin: true` claim, and
`ADMIN_ALLOWED_EMAILS`.

Worth doing once you have a domain: Google Cloud Console → APIs & Services →
Credentials → your browser key → add an **HTTP referrer restriction** for your
admin domain, so nobody else can spend your quota.

### 4. Environment variables

Copy `.env.example` to `.env` and fill it in. Both Railway services need the
shared block; only the admin service needs the `NEXT_PUBLIC_FIREBASE_*` block.

```
FIREBASE_PROJECT_ID=sunn-cleaning
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@sunn-cleaning.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY_BASE64=<see below>
FIREBASE_STORAGE_BUCKET=sunn-cleaning.firebasestorage.app

# ---- ADMIN SERVICE ONLY (not needed on the customer service) ----
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyBWHMSO8RdQq0r0n6LYgdn_I99wuqLrYv4
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=sunn-cleaning.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=sunn-cleaning

BUSINESS_TIMEZONE=America/New_York
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
NEXT_PUBLIC_ADMIN_URL=https://admin.yourdomain.com
ADMIN_ALLOWED_EMAILS=grace-s@the-culture-connection.com
```

To produce `FIREBASE_PRIVATE_KEY_BASE64` from your service-account JSON:

```bash
node -e "console.log(Buffer.from(require('./your-service-account.json').private_key).toString('base64'))"
```

> It's base64 because raw newlines get mangled by most environment-variable
> editors, and the resulting "invalid PEM" error is genuinely confusing to debug.

**The service-account JSON is a master key to your database.** It's already in
`.gitignore`. Don't email it or put it in a shared drive.

### 5. Install, seed, and grant yourself access

```bash
npm install
npm run build
npm run seed                                   # creates settings, one crew, defaults
npm run grant-admin grace-s@the-culture-connection.com
```

`grant-admin` prints a temporary password **once**. Save it, sign in, then
change it in the Firebase console under Authentication → Users.

There is deliberately no signup screen. Admin access is granted by running that
command, never by filling in a form.

> **You have to run this yourself** — I couldn't. Setting the `admin: true`
> claim needs a Google OAuth token, and the sandbox I built this in has no
> network route to Google's auth servers. It will work from your machine.
>
> Creating the user in the Firebase console instead is *not* enough on its own.
> The portal checks for the `admin: true` custom claim, which only this script
> sets. A user without it gets a clear "this account does not have admin
> access" message rather than a silent failure.

### 6. Run it locally

```bash
npm run dev:customer     # http://localhost:3000
npm run dev:admin        # http://localhost:3001
```

### 7. Deploy the security rules

```bash
npx firebase-tools deploy --only firestore:rules,storage
```

---

## Railway — two services, one repo

Create **two services** in one Railway project, both pointing at this GitHub repo.

|  | Customer site | Admin portal |
|---|---|---|
| Root directory | `/` (repo root) | `/` (repo root) |
| Build command | `npm ci && npm run build:customer` | `npm ci && npm run build:admin` |
| Start command | `npm run start:customer` | `npm run start:admin` |
| Watch paths | `apps/customer/**`, `packages/shared/**` | `apps/admin/**`, `packages/shared/**` |
| Domain | `yourdomain.com` | `admin.yourdomain.com` |
| `NEXT_PUBLIC_FIREBASE_*` | not needed | **required** |

> **`NEXT_PUBLIC_*` values are baked in when the service builds, not read when
> it runs.** If you add the API key to Railway after the admin service has
> already deployed, restarting won't pick it up — you need a redeploy. The login
> screen says exactly this if the key is missing, rather than showing a cryptic
> `auth/invalid-api-key`.

> **Why root directory is `/` and not `apps/customer`.** The two apps share the
> pricing and scheduling engine in `packages/shared`. If Railway's build context
> were scoped to `apps/customer`, that shared package wouldn't exist at build
> time. Setting the root to the repo and selecting the app in the build command
> keeps one copy of the engine, so the price a customer sees and the price on
> the invoice can never drift apart. Watch paths keep each service from
> rebuilding on the other's changes.

Both services need the shared block from step 4. Only the admin service needs
the `NEXT_PUBLIC_FIREBASE_*` values.

---

## First 15 minutes in the admin portal

1. **Crews** — set your operating hours and your hourly cost per cleaner
2. **Services & Add-ons** — add your real services with a rate per square foot,
   a minimum charge, and a coverage rate (square feet one cleaner covers per hour)
3. **Settings → Scheduling** — set *quoting crew size* to your **smallest** crew
4. **Settings → Invoicing** — payment terms and how customers should pay you
5. **Settings → Content** — your mission statement is already in there

### The one number worth getting right

The **coverage rate** on each service decides how long a job is scheduled for.
Guess it low and you'll be double-booked in practice even though the software
thinks it prevented it.

Best way to set it: take a job you remember. Divide the square footage by
(hours it took × number of cleaners). A 10,000 sq ft job that took 2 people
90 minutes is `10000 / (1.5 × 2)` ≈ **3,300 sq ft per cleaner-hour**.

Check it again after your first month against real times. The booking detail
page records actual start and end times for exactly this purpose.

---

## How the schedule protects itself

Three rules, each with a trap that a naive implementation falls into. All three
are covered by the test suite (`npm test`, 40 tests, no database required).

**1. The travel buffer is applied once between two jobs, not twice.**
The obvious implementation pads every job with an hour before *and* after, then
checks for overlaps — which silently produces a **two-hour** gap and costs about
a third of your capacity. The real test is symmetric:

```
conflict(A, B)  ⇔  A.start < B.end + 60min  AND  B.start < A.end + 60min
```

**2. Job length never depends on which crew gets assigned.**
Availability shows one end time per slot, but the crew is picked afterwards. If
duration varied by crew size, a customer could be quoted 08:00–09:45 and booked
08:00–11:00. Everything is quoted against one *quoting crew size*, which is why
it should be your smallest crew — a bigger crew just finishes early.

**3. The booking transaction always reads the day before and the day after.**
A job on Monday ending 23:00 doesn't cross midnight, so it's only recorded on
Monday. A 00:30 Tuesday booking that reads only Tuesday sees an empty calendar
and books, leaving a 90-minute violation.

**No double-booking, guaranteed by Firestore.** Each crew-day is a document with
a predictable name (`crewId_2026-09-15`), so the booking transaction reads known
documents rather than running a query. If any of them changes between read and
commit, Firestore retries. Verified against the live database: 8 simultaneous
requests for one slot produced exactly 1 success and 7 rejections.

**One source of truth.** Availability and the booking transaction both read the
same crew-day index. They cannot drift, because there is nothing to drift from.
Blocks are removed on cancel or reschedule only — never on a status change, so
marking a job complete at 2pm while the crew is still on site doesn't re-open
the slot.

---

## Money

Prices are recomputed on the server for every request. A price submitted by the
browser is display-only and never trusted.

**Order matters:** the minimum charge is applied *after* the property-type
multiplier, not before. The other way round, a warehouse at ×0.85 would price a
$175 floor down to $148.75 — so it wouldn't be a minimum.

**Admin adjustments are ordinary line items.** Adding one re-runs
subtotal → tax → total. If they were bolted on after the tax line, a $400
adjustment would be untaxed and your invoice would stop matching your books.

**Payments are not processed.** Marking a job complete raises "invoice needed"
on your dashboard. You generate the invoice, the portal writes the email for
you, you send it from your own inbox and mark it sent. Your sent message stays
in your real thread with the customer, and there's no email service to pay for.

Invoices render as a print-ready page — your browser's "Save as PDF" makes the
file. That avoids shipping a headless browser to Railway for a document you
produce a few times a week.

---

## Security

- The browser never writes to Firestore. Every change goes through a server
  route using the Admin SDK.
- Admin auth uses an httpOnly session cookie. **Middleware only checks the
  cookie is present** — it can't verify it, because middleware runs on the Edge
  runtime and the Firebase Admin SDK needs Node. Real verification happens in
  the portal layout *and independently in every API route*, because route
  handlers are directly addressable.
- Access instructions (alarm codes, key locations) are stored on the booking,
  shown only in the portal, never rendered on a public page and never exported.
- The public booking form has a honeypot field and a rate limit of 3 bookings
  per hour per IP. Without a payment step there's no natural friction.
- Review photos upload to a `quarantine/` path and only move to public storage
  when you approve the review.

> The rate limiter is in-memory, which is correct for a single Railway instance.
> If you ever scale either app to multiple replicas, move it to Firestore —
> otherwise each replica keeps its own counter and the real limit multiplies.

---

## Commands

```bash
npm run dev:customer     # customer site, localhost:3000
npm run dev:admin        # admin portal, localhost:3001
npm run build            # build everything
npm test                 # 40 scheduling + pricing tests, no database needed
npm run typecheck        # strict TypeScript across all three packages
npm run seed             # safe to re-run; never overwrites your edits
npm run grant-admin <email>
```

## Still to do before launch

- Run `npm run grant-admin` — the portal has no way in until you do
- Add your services and prices
- Write the Terms and Privacy pages, and have a lawyer read them
- Confirm with your accountant whether commercial cleaning is taxable in your
  state, then set the rate in Settings → Invoicing
- Add a second admin, so you're not the only person who can get in
