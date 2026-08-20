# SUNN CLEAN — Booking Website Specification

**Version:** 1.1
**Date:** August 15, 2026
**Prepared for:** Grace S., SUNN CLEAN
**Status:** Draft for review

---

## 1. Overview

### 1.1 What we're building

A booking website for SUNN CLEAN, a commercial cleaning company. The site lets business customers request and schedule a cleaning without creating an account, and gives SUNN CLEAN staff an admin portal to manage the schedule, crews, pricing, invoicing, payouts, reviews, and certifications.

### 1.2 Guiding principle

**Keep it simple.** This is a small-business site, not a SaaS platform. Every feature below earns its place by directly serving one of two goals: a customer can book a job without calling, or an admin can run the day without a spreadsheet. Anything else is deferred to Phase 2.

### 1.3 Core decisions (locked)

| Decision | Choice |
|---|---|
| Service type | Commercial only |
| Pricing model | By square footage + property type + add-ons |
| Customer accounts | None — guest booking with a lookup link |
| Payment processing | **None.** Admin emails invoices manually from their own inbox |
| Notifications | In-portal only. No outbound transactional email in Phase 1 |
| Reviews | Open submission by anyone + verified badge for real customers; all moderated |
| Before/after gallery | Yes — comparison sliders, publishable straight from a completed job |
| Double-booking prevention | Crew-slot capacity + 1-hour travel buffer between jobs |
| App hosting | Railway |
| Data, files, background jobs | Firebase (Firestore, Storage, Cloud Functions, Auth) |

### 1.4 Explicit non-goals for Phase 1

- Online payment collection (Stripe, card-on-file, deposits)
- Customer login accounts or booking history
- SMS or automated customer email
- Route optimization or distance-based travel time
- Automatic recurring booking generation
- Crew mobile app
- Accounting software sync (QuickBooks, Xero)

---

## 2. Architecture

### 2.1 The split

```
┌────────────────────────────────────────────────────────────┐
│  RAILWAY                                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Next.js app (App Router, TypeScript)                │  │
│  │                                                      │  │
│  │  /              Public marketing + mission           │  │
│  │  /book          Booking flow                         │  │
│  │  /reviews       Public reviews + open submission     │  │
│  │  /gallery       Before & after comparison sliders    │  │
│  │  /certifications Public certifications               │  │
│  │  /booking/[token]  Customer booking lookup           │  │
│  │  /admin/*       Admin portal (auth required)         │  │
│  │  /api/*         Server routes (firebase-admin SDK)   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────┬──────────────────────────────────┘
                          │ firebase-admin (service account)
                          ▼
┌────────────────────────────────────────────────────────────┐
│  FIREBASE                                                  │
│                                                            │
│  Firestore        All application data                     │
│  Storage          Certification PDFs, invoice PDFs,        │
│                   job photos, logos                        │
│  Auth             Admin users only (email + password,      │
│                   custom claim `admin: true`)              │
│  Cloud Functions  Scheduled + trigger-based background work│
└────────────────────────────────────────────────────────────┘
```

### 2.2 Where logic lives — and why

This is the one architectural decision worth being deliberate about, because the natural instinct is to put everything in Cloud Functions and it will make the project slower to build.

**Next.js API routes on Railway handle everything request/response.** Availability lookup, booking creation, price calculation, admin CRUD, invoice PDF generation. These need to be fast and synchronous, they need the request context, and keeping them in the same codebase as the UI means one deploy, one set of types, one place to debug. They talk to Firestore through the `firebase-admin` SDK using a service account, which bypasses security rules entirely.

**Firebase Cloud Functions handle everything that isn't triggered by a user request:**

| Function | Type | What it does |
|---|---|---|
| `flagJobsNeedingCompletion` | Scheduled, hourly | Finds `confirmed` bookings whose end time has passed; creates an in-portal notification prompting admin to confirm completion |
| `checkCertificationExpiry` | Scheduled, daily | Flags certifications expiring within 60 / 30 / 7 days |
| `flagOverdueInvoices` | Scheduled, daily | Flags invoices past their due date |
| `onReviewCreate` | Firestore trigger | Creates the "review awaiting moderation" notification |

**Idempotency requirement.** These scheduled functions re-run on a fixed cadence over the same data. Every notification they create **must use a deterministic document ID** so a re-run overwrites rather than duplicates:

```
needs_completion_{bookingId}
overdue_{invoiceId}_{YYYY-MM-DD}
cert_expiring_{certId}_{thresholdDays}
```

Write with `set({ merge: true })` and never touch the `read` flag on an existing document. Without this, one overdue invoice generates a new notification every single day and the feed becomes useless within a week.

**Backups:** use Firestore's built-in scheduled backups / point-in-time recovery in the Firebase console. Do not write a custom export function — it is strictly worse than the managed feature.

**Dashboard counters:** compute them with direct queries. At this volume (a handful of bookings a day) aggregation queries are instant, and denormalized rollup counters maintained by a Firestore trigger introduce a class of drift bugs for no benefit.

**Note on cost:** Cloud Functions require the Firebase **Blaze (pay-as-you-go)** plan. For this volume the monthly bill will be very small — likely a few dollars — but it does require a credit card on the project, and you should set a budget alert. Firestore and Storage on Blaze still include the free tier allowances.

### 2.3 Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | Server components for public pages, server actions or route handlers for mutations |
| Styling | Tailwind CSS + shadcn/ui | Fast to build, consistent, easy to brand |
| Forms | react-hook-form + Zod | One Zod schema shared between client and server validation |
| Dates | Luxon or date-fns-tz | **Do not use raw `Date` arithmetic.** DST will break the scheduler |
| Admin calendar | react-big-calendar, or a custom crew-column grid | FullCalendar's resource-timeline view is a **paid** premium plugin — avoid unless you want that license |
| PDF generation | `@react-pdf/renderer` | Lighter than Puppeteer on Railway; no headless Chrome to install |
| Client Firebase SDK | Admin login only | Public pages never touch Firestore from the browser |

### 2.4 Environment variables (Railway)

```
# Firebase Admin (server-side)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY_BASE64=        # base64-encoded to survive Railway's env editor
FIREBASE_STORAGE_BUCKET=

# Firebase Web SDK (admin login screen only)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# App
NEXT_PUBLIC_SITE_URL=https://sunnclean.com
SESSION_COOKIE_SECRET=
BUSINESS_TIMEZONE=America/New_York
ADMIN_ALLOWED_EMAILS=grace-s@...,ops@...   # allowlist for who can be granted admin
```

Store the private key base64-encoded and decode at boot. Newlines in Railway env vars are a recurring source of "invalid PEM" errors.

### 2.5 Environments

- **Production** — Railway service on `main`, Firebase project `sunnclean-prod`
- **Staging** — Railway service on `develop`, Firebase project `sunnclean-staging`

Two separate Firebase projects. Do not share a Firestore database between staging and production — it is very easy to test-book onto a real crew's real calendar.

### 2.6 Timezone handling

All timestamps are stored in Firestore as UTC. The business timezone lives in `settings/business.timezone`. Every render and every scheduling calculation converts explicitly. Availability is always computed in business-local time, then converted to UTC for storage. This matters twice a year and it matters a lot.

---

## 3. Scheduling engine

This is the most important part of the build. Get it right and everything else is CRUD.

### 3.1 The rules in plain language

1. SUNN CLEAN has some number of crews. Admin sets this — add, remove, or deactivate crews in the portal.
2. A crew can do one job at a time.
3. Between the end of one job and the start of the next job for the same crew, there must be at least **60 minutes** of travel time.
4. A job's length is estimated from square footage, service type, and crew size.
5. A time slot is offered to a customer if **at least one** crew can take it.
6. Two customers must never be able to book the same crew into overlapping time.

### 3.2 Duration estimation

```
productionRate  = sq ft one cleaner covers per hour (set per service type)
quotingHeadcount = settings.business.quotingCrewHeadcount

cleaningMinutes = (squareFeet / (productionRate × quotingHeadcount)) × 60
setupMinutes    = 20                       # load in, load out, walkthrough
addOnMinutes    = sum of each add-on's time cost

rawDuration     = cleaningMinutes + setupMinutes + addOnMinutes
duration        = max(roundUpTo15(rawDuration), minJobMinutes)

if duration > maxJobMinutes:
    return NO_SLOTS, reason = "requires_manual_quote"
```

**Duration must not depend on which crew is assigned.** This is a deliberate simplification and it matters. If duration were derived from each crew's individual headcount, the same 08:00 slot would end at 09:45 on a 3-person crew and 11:00 on a 2-person crew — but availability returns one end time per slot, and crew assignment happens later by priority order. The customer would be quoted one window and booked into another.

So: quote and validate against a single `quotingCrewHeadcount` in business settings. **Set it to the size of your smallest active crew** so every estimate is conservative — a larger crew simply finishes early, which never causes a conflict. If your crews vary widely in size, that's a signal to revisit this in Phase 2 rather than to complicate Phase 1.

`minJobMinutes = 120` (a hard floor — you don't dispatch a crew for less). `maxJobMinutes = 600`. A job estimated over the maximum returns **zero slots** with a "please contact us for a quote" message rather than being silently clamped down to 10 hours and scheduled.

**Default production rates (editable in admin — these are starting points, tune them against your actual job times):**

| Service | sq ft per cleaner-hour |
|---|---|
| Standard janitorial / recurring | 3,500 |
| Deep clean | 1,500 |
| Post-construction cleanup | 650 |
| Move-in / move-out | 1,200 |
| Floor care (strip & wax) | 800 |

**Worked example:** 32,000 sq ft office, standard janitorial, quoting headcount 3, plus 4 restroom add-ons.

```
cleaning  = 32,000 / (3,500 × 3) × 60  = 182.9 min
setup     = 20 min
add-ons   = 4 × 15                     = 60 min
raw       = 262.9 min
roundUp15 = 270 min
max(270, 120)                          = 270 min  → 4h 30m
```

A smaller job, 12,000 sq ft with no add-ons: `68.6 + 20 = 88.6` → rounds to `90` → floored to **120 minutes** by `minJobMinutes`. The floor applies, and the customer is quoted a 2-hour window.

### 3.3 The travel buffer — and the trap to avoid

**The trap:** the obvious implementation is to pad every booking with 60 minutes before *and* 60 minutes after, then check for overlaps. This produces a **two-hour** gap between consecutive jobs, not one hour, because each job contributes its own hour to the same gap. Crews sit idle and capacity drops by a third. Do not do this.

**The correct rule.** Two jobs `A` and `B` on the same crew conflict if and only if:

```
A.start < B.end + BUFFER   AND   B.start < A.end + BUFFER
```

where `start` / `end` are the actual on-site service times and `BUFFER = 60 minutes` (configurable via `settings/business.travelBufferMinutes`).

This is symmetric and produces exactly one 60-minute gap regardless of which job comes first.

**Verification:**

| Job A | Job B | Gap | Conflict? |
|---|---|---|---|
| 09:00–11:00 | 12:00–14:00 | 60 min | No ✅ |
| 09:00–11:00 | 11:45–13:00 | 45 min | Yes ✅ |
| 09:00–11:00 | 06:00–08:00 | 60 min | No ✅ |
| 09:00–11:00 | 06:00–08:30 | 30 min | Yes ✅ |
| 09:00–11:00 | 10:00–12:00 | overlap | Yes ✅ |

### 3.4 Availability lookup

**Endpoint:** `GET /api/availability?date=2026-09-14&serviceId=std&squareFeet=12000&addOns=restrooms:4`

**Algorithm:**

1. Validate the date is within `[today + minLeadTimeHours, today + maxHorizonDays]`. Defaults: 24 hours lead time, 60-day horizon.
2. Reject if the date is in `blackouts` or falls outside business operating days.
3. Compute `duration` per §3.2. It is crew-independent by design. If it exceeds `maxJobMinutes`, return zero slots with `reason: "requires_manual_quote"`.
4. Load all active crews and their working hours for that weekday (crews may have individual hours; default comes from `settings/business.hours`).
5. **Load occupancy from `crewDays/{crewId}_{date}` for `date - 1`, `date`, and `date + 1`.** Adjacent days are required because a 22:00–02:00 job and the 60-minute buffers around any job can cross midnight.
6. Generate candidate start times on a **30-minute grid** across each crew's working window.
7. For each candidate start `S` on crew `c` with duration `d`, the slot is valid if:
   - `S >= crew.dayStart` and `S + d <= crew.dayEnd` — the *service* fits inside working hours; the travel buffer is allowed to extend beyond. Working hours are stored as minutes-from-local-midnight and may exceed 1440 for overnight shifts (§7.3), so this comparison must be done on resolved local timestamps, not clock strings
   - For every existing booking `E` on crew `c`: `NOT (S < E.end + 60 AND E.start < S + d + 60)`
   - The crew is not on a per-crew blackout
8. Union the valid start times across all crews. Return the distinct sorted list.
9. Do **not** return crew identity to the customer. Crew assignment happens server-side at booking time.

**Single source of truth.** Availability reads `crewDays`, and so does the booking transaction (§3.5). Never compute availability by querying the `bookings` collection — two independent occupancy sources will drift, and drift here means a real double-booking.

This also avoids a subtler bug: filtering bookings by status. A job marked `completed` at 14:00 while the crew is still packing up would drop out of a status-filtered query and get re-offered to a customer. Blocks in `crewDays` are removed on **cancel or reschedule only** — never in response to a status change.

**Response shape:**

```json
{
  "date": "2026-09-14",
  "timezone": "America/New_York",
  "estimatedDurationMinutes": 120,
  "slots": [
    { "start": "08:00", "end": "10:00" },
    { "start": "08:30", "end": "10:30" },
    { "start": "13:00", "end": "15:00" }
  ]
}
```

Also useful: `GET /api/availability/month?month=2026-09&...` returning `{ "2026-09-14": 6, "2026-09-15": 0, ... }` so the date picker can grey out full days before the customer clicks.

### 3.5 Preventing the race condition

Two customers loading the same slot list and submitting within the same second must not both get the slot. Availability lookup is advisory; the booking write is authoritative.

**Design: a deterministic per-crew-per-day index document.**

```
crewDays/{crewId}_{YYYY-MM-DD}
{
  crewId: "crew-a",
  date: "2026-09-14",
  blocks: [
    { bookingId: "bk_123", start: <Timestamp>, end: <Timestamp>, status: "confirmed" }
  ],
  updatedAt: <Timestamp>
}
```

Because the document ID is deterministic, a Firestore transaction can read a **single known document** rather than running a query. That is the strongest and simplest concurrency guarantee available here.

**Booking transaction:**

```
POST /api/bookings

1.  Validate payload with Zod.
2.  Recompute price server-side from settings/pricing.
      NEVER trust a price submitted by the client.
3.  Recompute duration server-side (§3.2, crew-independent).
4.  Pick a target crew: iterate active crews in priority order.
5.  BEGIN TRANSACTION
6.    Read crewDays/{crewId}_{d} for every day d touched by
        [serviceStart − buffer, serviceEnd + buffer].
        This is ALWAYS at least {date−1, date, date+1}.
7.    Re-run the §3.3 conflict test against every block in those docs.
8.    If conflict → abort this crew.
9.    Create bookings/{bookingId}.
10.   Append the block to crewDays for every day the job's
        service window touches (create docs if absent).
11.   Create notifications/{id}  type: "new_booking".
12. COMMIT
```

If step 8 aborts, retry against the next crew in priority order. Only return 409 with a refreshed slot list when every crew is exhausted.

**Step 6 is easy to get wrong.** It is tempting to read only the booking's own day, or to add `date + 1` solely when the job crosses midnight. That misses this case: an existing job on `date − 1` running 21:00–23:00 does not cross midnight, so its block lives only in the `date − 1` document. A new 00:30 booking on `date` that reads only `date` and `date + 1` sees an empty calendar and books — leaving a 90-minute buffer violation. **Always read the day before and the day after.** It costs two extra document reads.

**On write throughput:** Firestore allows roughly one write per second per document. With a handful of crews this is nowhere near a constraint. If SUNN CLEAN ever scales past that, the fix is sharding by crew — which this design already is.

**Midnight-crossing jobs:** a job running 22:00–02:00 writes a block to both days' index documents. Both writes happen in the same transaction. The conflict check must consult both.

### 3.6 Reschedules and cancellations

- **Reschedule** runs the exact same transaction: remove the old block, validate the new one, write the new block. If the crew changes, two `crewDays` documents are touched.
- **Cancellation** removes the block from `crewDays` and sets `booking.status = "cancelled"`. The slot immediately becomes bookable again.
- Both actions are admin-initiated and both write to `auditLog`.
- Customers can request cancellation from their lookup page, which sets `cancellationRequested: true` and raises an admin notification — it does **not** auto-cancel. Same for reschedule requests. This keeps a human in the loop for commercial contracts.

### 3.7 Acceptance tests for the scheduler

Write these as automated tests before writing the UI. They are the spec.

1. Booking a slot removes it and all slots within 60 min on either side from that crew's availability.
2. With 2 crews, the same time slot can be booked twice, and a third attempt is rejected.
3. Two concurrent POSTs for the last remaining slot: exactly one 201, exactly one 409.
4. A job ending at 11:00 makes 12:00 available and 11:59 unavailable on the same crew.
5. A job starting at 09:00 makes a 2-hour job at 06:00 available and at 06:30 unavailable.
6. Deactivating a crew removes its slots from future availability but leaves existing bookings intact and visible.
7. Increasing crew count from 2 to 3 immediately increases available slots.
8. Changing `travelBufferMinutes` from 60 to 90 widens gaps on newly computed availability without altering existing bookings.
9. A booking spanning 22:00–02:00 blocks the correct window on both calendar days.
10. **A job on day D−1 ending at 23:00 blocks a 00:30 start on day D.** (This is the bug §3.5 warns about — the existing job does not cross midnight, so a naive implementation misses it.)
11. Availability across both DST boundaries produces no duplicated or missing hour.
12. Cancelling a booking makes its slot immediately available again.
13. A blackout date returns zero slots.
14. A slot cannot be booked inside the minimum lead time window.
15. A job marked `completed` at 14:00 does **not** free its 13:00–16:00 slot for a new booking.
16. A request whose estimated duration exceeds `maxJobMinutes` returns zero slots with `reason: "requires_manual_quote"` — not a clamped 10-hour job.
17. A `pending` (not yet confirmed) booking holds its slot against a second customer.

---

## 4. Pricing model

### 4.1 Formula

```
rawBase       = squareFeet × service.ratePerSqFt
modifiedBase  = rawBase × propertyTypeModifier × frequencyModifier
base          = max(modifiedBase, service.minimumCharge)     ← minimum applied LAST

addOnsTotal   = Σ (addOn.unitPrice × addOn.quantity)

surcharges    = Σ (surcharge.type == "percent"
                     ? (base + addOnsTotal) × surcharge.value
                     : surcharge.value)

discounts     = Σ discount amounts
adjustments   = Σ admin adjustment line items          (§4.5, zero at booking time)

subtotal      = base + addOnsTotal + surcharges − discounts + adjustments
tax           = subtotal × taxRate
total         = subtotal + tax
```

**Order matters.** Applying the minimum charge before the modifiers means it isn't a minimum: a warehouse (×0.85) on a monthly contract (×0.95) would price a $175 floor down to $141.31. Apply modifiers first, then floor.

Every component is stored on the booking as an itemized line so the breakdown can be re-rendered exactly as quoted, even if rates change later. **Snapshot the rates onto the booking at creation time.** Never recompute a historical booking's price from current settings.

The same function computes the estimate at booking time and the final total at invoice time — the only difference is that adjustment line items exist by then. There is no second pricing code path.

### 4.2 Default rate table (all editable in admin)

**Service base rates:**

| Service | $ / sq ft | Minimum |
|---|---|---|
| Standard janitorial | 0.10 | $175 |
| Deep clean | 0.18 | $350 |
| Post-construction | 0.32 | $500 |
| Move-in / move-out | 0.22 | $400 |
| Floor care (strip & wax) | 0.30 | $450 |

**Property type modifier:**

| Type | × |
|---|---|
| Office | 1.00 |
| Retail | 1.05 |
| Warehouse / industrial | 0.85 |
| Medical / dental | 1.25 |
| Food service / restaurant | 1.20 |
| Gym / fitness | 1.15 |
| Educational | 1.10 |
| Other | 1.00 |

**Frequency modifier:**

| Frequency | × |
|---|---|
| One-time | 1.00 |
| Monthly | 0.95 |
| Bi-weekly | 0.90 |
| Weekly | 0.85 |
| 2–5× per week | 0.80 |

**Important Phase 1 caveat.** Selecting a recurring frequency books **only the first visit** — there is no contract and no generated series yet. So the recurring discount must not apply automatically, or a customer clicks "weekly" and gets 15% off a single one-time job.

Phase 1 behavior: selecting a recurring frequency prices at the **one-time rate**, shows the customer "Recurring service available — we'll contact you with contract pricing," and raises a `recurring_lead` admin notification. Admin applies the discount as an adjustment once a contract is agreed. The multiplier table above is wired up and ready for Phase 2, just not customer-triggerable.

**Add-ons (per-unit):**

| Add-on | Unit | Price | Time cost |
|---|---|---|---|
| Restroom deep sanitize | per restroom | $25 | 15 min |
| Interior window cleaning | per 100 sq ft glass | $35 | 20 min |
| Carpet extraction | per 1,000 sq ft | $120 | 45 min |
| Hard floor buff | per 1,000 sq ft | $90 | 30 min |
| Refrigerator / breakroom appliance | per unit | $40 | 20 min |
| Trash haul-away | flat | $75 | 20 min |
| Supply restocking | flat | $30 | 10 min |

**Surcharges:**

| Surcharge | Value |
|---|---|
| After hours (before 07:00 or after 18:00) | +15% |
| Weekend | +10% |
| Holiday | +25% |
| No elevator, 2+ floors | +$50 |

**Deliberately not automated: distance/zone surcharges.** Pricing by service-area zone would require a ZIP-to-zone mapping table, an admin UI to maintain it, and validation that a submitted address is actually in the claimed ZIP. That's real complexity for a rule you'll apply a handful of times a month. Phase 1 handles it as a manual admin adjustment (§4.5) with a "Travel surcharge" label. Revisit if it becomes frequent.

### 4.3 Tax

`taxRate` is a single configurable field in `settings/pricing`, defaulting to `0`. **Whether commercial cleaning services are taxable varies by state**, and in some states it varies by the type of cleaning. Confirm your state's treatment with your accountant before setting this, and keep the field editable. The invoice template should show tax as a separate line even when the rate is zero.

### 4.4 What the customer sees

The booking flow shows a live-updating breakdown as the customer fills out the form:

```
Standard Janitorial — 32,000 sq ft            $3,200.00
  Office rate                                     ×1.00
  One-time service                                ×1.00
Restroom deep sanitize (4)                      $100.00
After hours service                       +15%  $495.00
                                              ──────────
Estimated subtotal                            $3,795.00
Tax                                               $0.00
                                              ══════════
Estimated total                               $3,795.00
```

Label it **"Estimate"** everywhere, with this note under it:

> This is an estimate based on the details provided. Your final invoice may be adjusted after our on-site walkthrough. We'll confirm any change before work begins.

That single sentence is what makes it safe to quote automatically without a site visit.

### 4.5 Admin adjustment

On the booking detail page, admin can add adjustment line items (positive or negative) with a label and a reason — extra scope discovered on site, a travel surcharge, a goodwill credit, a negotiated contract discount.

**Adjustments are ordinary line items**, appended to `pricing.lineItems` with `type: "adjustment"`. Adding one re-runs the §4.1 formula from `subtotal` down, so tax recalculates correctly. This is the whole reason they aren't a separate array: with a non-zero tax rate, a +$400 adjustment bolted on after the tax line is a +$400 untaxed line, and your invoice totals stop matching your books.

The original `estimateTotal` is frozen at booking time and displayed alongside `finalTotal` so you can see the delta and tune your rate table against reality.

---

## 5. Customer-facing site

### 5.1 `/` — Home

- Hero: company name, one-line value proposition, primary CTA "Book a Cleaning"
- **Mission section** — the mission statement, prominently placed, editable from the admin content panel without a deploy. Placeholder copy until Grace supplies final text.
- Services overview: card per service with a one-line description and "starting at" price
- Trust row: certification badges (pulled live from the certifications collection), years in business, insured & bonded callout
- Reviews teaser: aggregate star rating + 3 featured reviews, linking to `/reviews`
- Service area statement
- Footer: contact, hours, address, links

### 5.2 `/services` — Services

One section per active service: description, what's included checklist, typical use cases, starting price, "Book this service" CTA that deep-links into the booking flow with the service preselected.

### 5.3 `/book` — Booking flow

Four steps, one page each, with a persistent progress indicator and a live price panel from step 2 onward.

**Step 1 — Service & property**
- Service type (radio cards)
- Property type (select)
- Square footage (number, with a "not sure?" helper offering a rough size guide)
- Number of floors
- Is there an elevator? (only shown when floors ≥ 2 — feeds the no-elevator surcharge)
- Number of restrooms
- Frequency (one-time / recurring interest — see §4.2)

**Step 2 — Add-ons**
- Checkboxes and quantity steppers, price updates live
- Free-text "anything else we should know" field

**Step 3 — Date & time**
- Month calendar, unavailable days greyed out
- On date select, fetch and show available start times
- Display estimated duration and estimated end time
- Note that a 1-hour buffer is reserved around the job (framed to the customer as "we schedule travel time so your crew arrives on time")

**Step 4 — Contact & site details**
- Business name, contact name, email, phone
- Service address (street, unit, city, state, ZIP)
- Access instructions (alarm code handling, key/fob, loading dock, parking)
- Preferred contact method
- Review the full estimate breakdown
- Checkbox: agree to terms + the estimate disclaimer
- Submit → booking created

**Confirmation page**
- Booking number (`SC-2026-0142`)
- Full summary: service, date, time window, address, estimate breakdown
- **A unique lookup link** (`/booking/{token}`) with clear instructions to save it — this is the customer's only way back to the booking, since there are no accounts and no confirmation email in Phase 1
- "Add to calendar" .ics download
- Phone number for questions

**Anti-abuse:** honeypot field, Cloudflare Turnstile or hCaptcha on submit, and a per-IP rate limit of 3 bookings per hour. Without payment as a friction point, an open booking form will eventually get spammed.

### 5.4 `/booking/[token]` — Customer booking lookup

Read-only view of the booking with a random 32-character token in the URL. Shows status, date/time, service details, estimate, and site address. Two actions: **Request reschedule** and **Request cancellation** — both create an admin notification rather than acting directly. Once the job is complete and invoiced, this page also shows invoice status and a download link for the invoice PDF.

Store a hash of the token, not the token itself.

### 5.5 `/reviews` — Reviews

- Aggregate rating with a 1–5 star distribution bar chart
- Total review count
- Filter by service type; sort by newest / highest / lowest
- Each review: stars, title, body, reviewer display name, business type (e.g. "Medical office, Brooklyn"), service, date, and an "Verified customer" badge when linked to a real completed booking
- Optional owner response displayed beneath a review
- Paginated, 10 per page
- Only `status: approved` reviews are ever served

**Two ways to leave a review.** Both land in the same moderation queue; the difference is only whether the review earns a Verified badge.

1. **Open submission.** A "Write a Review" button on `/reviews` opens a form available to anyone — no booking required. This matters because a happy long-term client who books by phone has no other way to review you, and because volume of reviews is what makes the page persuasive.
2. **Invited submission.** A tokenized link at `/review/{token}`, surfaced on the customer's booking lookup page once the job is marked complete, and copyable from the admin portal to send however you like.

**Form fields (identical for both):** 1–5 stars, headline, body, display-name preference (business name / first name + initial / anonymous), service selection, optional photos, and email (never published).

**Verification.** A review is marked `verified: true` when it arrives through a valid `/review/{token}` link, **or** when its submitted email matches the `customer.email` of a booking with status `completed`. Verified reviews carry a "✓ Verified Customer" badge on the public page; unverified ones display "Unverified" rather than nothing, so the badge means something.

**Photo uploads.** Up to 4 images per review, JPEG/PNG/WebP, 8 MB each before compression. Resize and compress client-side (longest edge 1600px, quality 0.82) before uploading to Firebase Storage — this keeps storage costs near zero and makes uploads work on a phone. Photos are held in a quarantine path and only moved to the public path on approval. Video is deliberately not supported: transcoding, storage and moderation cost far more than the benefit at this size.

**Anti-abuse on the open form.** This is the one endpoint where an open form invites junk. CAPTCHA (Turnstile), a per-IP rate limit of 2 reviews per day, a minimum body length of 40 characters, and a hashed-IP record shown to admin in the moderation queue so repeat submitters are visible.

**Moderation is mandatory for both paths.** Nothing appears publicly until an admin approves it. The guidance to build into the admin UI: reject spam, not criticism — a published 3-star review with a thoughtful owner response builds more trust than a wall of 5s.

Add `Review` and `AggregateRating` structured data for SEO. Note that Google restricts star-rating rich results for self-serving first-party reviews, so treat the markup as a nice-to-have rather than a traffic strategy.

### 5.6 `/gallery` — Before &amp; After

For a cleaning company this is the single most persuasive page on the site, so it gets first-class treatment rather than being a photo dump.

- Each entry is a **pair**: one before image, one after image, shown in a draggable comparison slider (a divider the visitor drags left/right to reveal the after shot). Works with mouse, touch, and keyboard arrows.
- Caption, service tag, property size and job length under each pair.
- Filterable by service type.
- Featured pairs also appear on the homepage.

**Image handling.** Compress client-side on upload (longest edge 2000px, quality 0.85). Store the pair plus a generated thumbnail in Firebase Storage. Serve with `loading="lazy"` and explicit width/height to avoid layout shift — a gallery of full-size photos is the fastest way to make a small-business site feel slow.

**The workflow that makes this actually get used:** crews already upload photos when marking a job complete (§6.4). The job detail page gets a "Publish this pair to the gallery" button that promotes two of those photos directly, with the caption pre-filled from the booking. No re-uploading, no separate process — which is the difference between a gallery that stays current and one that has four photos from launch week.

**Data model — `galleryPairs/{pairId}`:**

```ts
{
  beforePath: string, afterPath: string, thumbPath: string,
  caption: string,               // "Medical office · 8,400 sq ft"
  serviceId: string, serviceName: string,
  jobLengthLabel?: string,       // "6 hours"
  sourceBookingId?: string,      // set when promoted from a completed job
  published: boolean, featured: boolean, order: number,
  createdAt, updatedAt
}
```

**Consent.** Get written permission before publishing photos of a client's space, and never publish an image showing signage, documents, screens, or anything that identifies a third party without asking. Add a consent checkbox to the admin upload form and store `consentConfirmedBy` on the pair.

### 5.7 `/certifications` — Certifications

Grouped by category:
- **Insurance & bonding** — general liability, workers' comp, janitorial bond
- **Safety & compliance** — OSHA, bloodborne pathogen, HAZCOM
- **Industry credentials** — ISSA CIMS, BSCAI, IICRC
- **Environmental** — Green Seal, EPA-registered disinfectant training
- **Personnel** — background check policy, E-Verify

Each card: badge image, credential name, issuing organization, credential ID, issue date, expiry date, short description, and an optional downloadable PDF (e.g. certificate of insurance). Expired credentials are hidden from the public page automatically and flagged to admin.

### 5.8 `/about`, `/contact`, `/terms`, `/privacy`

Standard static pages. `/about` carries the longer-form mission and story; `/contact` has a simple contact form that writes to the notifications feed.

### 5.9 Design & accessibility baseline

- Mobile-first; the booking flow must be comfortable one-handed on a phone
- WCAG 2.1 AA: 4.5:1 text contrast, visible focus states, full keyboard operability on the calendar and steppers, form errors announced to screen readers
- Lighthouse target: ≥90 performance, ≥95 accessibility on public pages
- Real `<label>` elements on every field — not placeholder-only

---

## 6. Admin portal

All routes under `/admin`, protected by Firebase Auth with a session cookie verified in middleware. Users must carry the `admin: true` custom claim.

### 6.1 `/admin` — Dashboard

- **Today's schedule** — crew-by-crew list of today's jobs with status chips
- **Action needed** — the notification feed, unread first. This is the heart of the portal:
  - `new_booking` — a customer booked
  - `job_needs_completion` — a job's end time has passed and it's still marked confirmed
  - `invoice_needed` — a job was marked complete and has no invoice yet
  - `invoice_overdue` — invoice past due date
  - `reschedule_requested` / `cancellation_requested`
  - `review_pending` — a review awaits moderation
  - `certification_expiring`
  - `recurring_lead` — a customer expressed interest in a recurring contract
  - `contact_form` — someone used the contact form
- **KPI row** — jobs this week, revenue booked this week, outstanding invoice total, unassigned jobs, average job value
- **Unassigned or at-risk** — anything without a crew, or tomorrow's jobs missing access instructions

### 6.2 `/admin/calendar` — Schedule

- Day and week views, **one column per crew**
- Each job block shows time, customer, address, and status color
- The 60-minute travel buffer renders as a hatched/greyed band adjacent to each job so the schedule visually explains itself
- Click a job → detail drawer
- Drag to reschedule or reassign → confirmation modal → runs the full §3.5 transaction → rejects with a clear message if it would conflict
- Toggle: show/hide cancelled

### 6.3 `/admin/bookings` — Bookings list

Table with filters (status, date range, crew, service) and search (booking number, business name, email, phone, address). Sortable. CSV export. Bulk status update.

### 6.4 `/admin/bookings/[id]` — Booking detail

The main working screen. Sections:

- **Header** — booking number, status, quick actions
- **Customer & site** — contact details, address with a map link, access notes
- **Schedule** — date, time, duration, assigned crew, with reschedule and reassign controls
- **Price breakdown** — the full itemized estimate exactly as quoted, plus an "Add adjustment" control. Shows original estimate, adjustments, and final total side by side
- **Completion** — "Mark job complete" with actual start/end times, crew notes, and photo upload to Firebase Storage
- **Invoice** — see §6.5
- **Payout** — computed crew cost, editable, with payout status
- **Activity log** — every status change, edit, and admin action with timestamp and user

**Status lifecycle:**

```
pending ──► confirmed ──► completed
   │            │             │
   │            ├─────────────┴──► cancelled
   │            └──► no_show
   └──► cancelled
```

That is the complete set. Five statuses, no more.

Two things were deliberately removed. **`in_progress`** had no action that set it and no function that read it — a job either hasn't happened or has. **`invoiced` and `paid`** are not booking statuses; they are *invoice* statuses. A booking that is `completed` with an attached invoice in state `sent` is fully described. Duplicating invoice state onto the booking gives you two fields that disagree the first time someone voids an invoice.

The admin UI displays a derived label — "Completed · Invoice sent" — computed from `booking.status` plus `invoice.status`. One source of truth each.

`pending` exists for bookings admin wants to review before committing. Set `settings.scheduling.autoConfirmBookings` to skip it. Note that a `pending` booking **still holds its slot** in `crewDays` — otherwise two customers could both land in the pending queue for the same time.

### 6.5 Invoice workflow (no payment processing)

This follows exactly what you described: the system prepares everything, the admin sends it from their own inbox.

1. Admin marks the job **complete** (from the calendar, the booking detail page, or via an optional tokenized crew link — see §6.10). A `invoice_needed` notification appears in the feed.
2. Admin opens the booking and clicks **Generate Invoice**. The server:
   - assigns a sequential invoice number (`INV-2026-0087`) via a Firestore counter transaction
   - renders a PDF: SUNN CLEAN letterhead, bill-to, service address, service date, itemized lines, subtotal, tax, total, payment terms, remit-to instructions, and your certifications footer
   - uploads it to `invoices/{invoiceId}.pdf` in Firebase Storage (private)
   - creates the `invoices/{invoiceId}` document
3. The booking page now shows **Preview PDF**, **Download PDF**, and **Prepare Email**.
4. **Prepare Email** opens a panel with:
   - a pre-written subject line: `SUNN CLEAN — Invoice INV-2026-0087 for service on Sept 14`
   - a pre-written email body with the totals, due date, and payment instructions
   - a **Copy to clipboard** button for subject and body
   - a `mailto:` link that opens the admin's own email client with recipient, subject, and body pre-filled
   - a reminder to attach the downloaded PDF
5. Admin sends from their own inbox, returns, and clicks **Mark as Sent** → status `invoiced`, `sentAt` recorded, `dueDate` set from configurable terms (default Net 15).
6. When payment arrives, admin clicks **Mark as Paid** with amount, method (check / ACH / cash / other), and date → status `paid`.

**Why `mailto:` rather than sending server-side:** it keeps the sent message in your own inbox thread with the customer, means no email service to configure or pay for in Phase 1, and avoids deliverability problems entirely. The trade-off is that the admin must attach the PDF manually. If that becomes tedious, Phase 2 adds a transactional email provider and a one-click send.

### 6.6 `/admin/invoices` — Invoices

List of all invoices with status, amount, days outstanding. An **aging summary**: current / 1–30 / 31–60 / 60+ days. Filter by unpaid. Total outstanding shown prominently. CSV export for your bookkeeper.

### 6.7 `/admin/payouts` — Payouts

"Payout" here means what SUNN CLEAN owes its crews — **tracked, not processed**. This is a reporting screen, not a payroll system.

Per completed job:
```
payout = actualLaborHours × crew.hourlyCostPerCleaner × crew.headcount
```

The value is computed and displayed, editable inline with an optional note. One payout model, not two — pick hourly or add revenue-share in Phase 2 if you actually need it.

**The screen:**
- Grouped by pay period (weekly, configurable start day) and by crew
- Per crew per period: jobs completed, total hours, computed payout, and a **single "Paid" checkbox** with a date
- A totals row per period
- Alongside each period: revenue booked, payout total, and gross margin % — the one number that tells you whether your rate table is right
- CSV export for your bookkeeper

No `pending → approved → paid` approval workflow. With one or two people running this, an approval chain is ceremony. A checkbox and a date is the whole feature.

### 6.8 `/admin/crews` — Crews

Add, edit, activate, deactivate. Per crew:
- Name and display color (used on the calendar)
- Headcount (feeds the duration estimate)
- Active toggle
- Working hours per weekday, overriding business defaults
- Per-crew blackout dates (vacation, training)
- Hourly cost per cleaner
- Priority order for auto-assignment
- Optional notes (equipment, certifications, service area)

**Deactivating a crew** never deletes or reassigns existing bookings — it only removes the crew from future availability. Existing jobs stay on the calendar and admin is prompted to reassign them.

### 6.9 `/admin/settings` — Settings

- **Business** — name, address, phone, email, timezone, operating days and hours, service area description
- **Scheduling** — travel buffer minutes (default 60), quoting crew headcount (§3.2), minimum lead time hours, maximum booking horizon days, minimum and maximum job minutes, slot grid granularity, whether new bookings auto-confirm
- **Blackout dates** — company-wide closures
- **Pricing** — full rate table editor: services, base rates, minimums, production rates, property modifiers, frequency modifiers, add-ons, surcharges, tax rate
- **Invoicing** — payment terms, remit-to instructions, invoice footer text, invoice number prefix
- **Content** — mission statement, hero headline, about copy, service descriptions. Editing these updates the live site without a deploy
- **Users** — list of admins, invite by email, revoke

Changing a rate never alters an existing booking's stored price.

### 6.10 `/admin/reviews` — Review moderation

Queue of pending reviews with approve / reject / feature actions, an optional owner response field, and a "request changes" note. Approved reviews go live immediately. Featured reviews appear on the homepage. Rejections require a reason, stored in the audit log.

### 6.11 `/admin/gallery` — Before &amp; After management

Upload a before/after pair, add a caption and service tag, publish or unpublish, drag to reorder, mark as featured. Includes the consent checkbox described in §5.6.

The important control here is the **"Publish this pair to gallery"** button on the job detail page, which promotes crew photos from a completed job without re-uploading. Build that path, not just the standalone uploader — it is the difference between a gallery that stays current and one that doesn't.

### 6.12 `/admin/certifications` — Certification management

Add, edit, publish/unpublish, reorder. Fields: name, issuing organization, category, credential ID, issue date, expiry date, description, badge image upload, document PDF upload. Expiry warnings appear in the notification feed at 60, 30, and 7 days out.

### 6.13 Optional: tokenized crew completion link

A low-effort quality-of-life addition worth including if time allows. Each job gets a `/crew/{token}` URL — no login — showing the job's address, access notes, and scope. One button: **Mark job complete**, plus fields for actual end time, notes, and photo upload. This creates the `invoice_needed` notification without the crew needing portal access. Token expires 24 hours after the scheduled end time.

---

## 7. Data model (Firestore)

### 7.1 Collections

```
settings/business          singleton
settings/pricing           singleton
settings/content           singleton — mission, hero, about copy
settings/counters          singleton — bookingSeq, invoiceSeq

crews/{crewId}
services/{serviceId}
addOns/{addOnId}
blackouts/{blackoutId}

bookings/{bookingId}
crewDays/{crewId}_{YYYY-MM-DD}     scheduling index — see §3.5
invoices/{invoiceId}
payouts/{payoutId}

reviews/{reviewId}
certifications/{certId}
galleryPairs/{pairId}

notifications/{notificationId}
auditLog/{entryId}
adminUsers/{uid}
contactMessages/{messageId}
```

### 7.2 `bookings/{bookingId}`

```ts
{
  bookingNumber: "SC-2026-0142",
  status: "pending" | "confirmed" | "completed" | "cancelled" | "no_show",
  // Invoice state lives on the invoice document, not here. See §6.4.

  customer: {
    businessName: string,
    contactName: string,
    email: string,
    phone: string,
    preferredContact: "email" | "phone",
  },

  site: {
    address1: string, address2?: string,
    city: string, state: string, zip: string,
    accessNotes?: string,
    parkingNotes?: string,
  },

  property: {
    type: "office" | "retail" | "warehouse" | "medical"
        | "food_service" | "gym" | "educational" | "other",
    squareFeet: number,
    floors: number,
    restrooms: number,
    hasElevator: boolean,
  },

  service: {
    serviceId: string,
    serviceName: string,             // snapshot
    frequency: "one_time" | "monthly" | "biweekly" | "weekly" | "multi_weekly",
    isRecurringLead: boolean,
    customerNotes?: string,
  },

  schedule: {
    serviceStart: Timestamp,         // UTC
    serviceEnd: Timestamp,           // UTC
    estimatedDurationMinutes: number,
    travelBufferMinutes: number,     // snapshot, default 60
    quotingHeadcountAtBooking: number,   // snapshot, for auditing estimates
    crewId: string,
    timezone: "America/New_York",
  },

  pricing: {
    // Adjustments are line items with type "adjustment" — NOT a separate
    // array. Adding one re-runs subtotal → tax → finalTotal. See §4.5.
    lineItems: [
      { key, label, type: "base"|"modifier"|"addon"|"surcharge"|"discount"|"adjustment",
        quantity?, unitPrice?, multiplier?, amount, note?, byUid?, at? }
    ],
    rateSnapshot: { /* the pricing config used, frozen at booking time */ },
    subtotal: number,               // recomputed on every adjustment
    taxRate: number,
    taxAmount: number,              // recomputed on every adjustment
    finalTotal: number,             // recomputed on every adjustment
    estimateTotal: number,          // frozen at booking time, never recomputed
    currency: "USD",
  },

  completion: {
    markedCompleteAt?: Timestamp,
    markedCompleteBy?: string,
    actualStart?: Timestamp,
    actualEnd?: Timestamp,
    actualLaborHours?: number,
    crewNotes?: string,
    photoPaths?: string[],
  },

  invoiceId?: string,
  payoutId?: string,
  reviewId?: string,

  requests: {
    cancellationRequested: boolean,
    rescheduleRequested: boolean,
    requestNote?: string,
    requestedAt?: Timestamp,
  },

  meta: {
    lookupTokenHash: string,         // SHA-256, for /booking/{token}
    reviewTokenHash?: string,        // SHA-256, minted on completion, for /review/{token}
    crewTokenHash?: string,          // SHA-256, for the optional /crew/{token} link (§6.13)
    createdAt: Timestamp,
    updatedAt: Timestamp,
    source: "web" | "admin" | "phone",
    createdByUid?: string,
  }
}
```

**Indexes required:**
- `status` ASC + `schedule.serviceStart` ASC
- `schedule.crewId` ASC + `schedule.serviceStart` ASC
- `customer.email` ASC + `meta.createdAt` DESC
- `status` ASC + `meta.createdAt` DESC

These serve the admin list and calendar views. **Availability never queries this collection** — it reads `crewDays` by document ID (§3.4).

### 7.3 `crews/{crewId}`

```ts
{
  name: "Crew A",
  color: "#2563eb",
  active: true,
  headcount: 3,
  priority: 1,

  // Minutes from local midnight. end > 1440 means the shift runs past
  // midnight into the next day. A "22:00 to 02:00" overnight shift is
  // { start: 1320, end: 1560 }.
  // Do NOT store these as "HH:MM" strings — that representation cannot
  // express an overnight window, and §3.5 / acceptance test 9 require it.
  workingHours: {
    mon: { start: 420, end: 1140, enabled: true },   // 07:00–19:00
    // ... per weekday
  },
  blackoutDates: ["2026-11-26"],
  hourlyCostPerCleaner: 24.00,
  notes: "",
  createdAt, updatedAt
}
```

### 7.4 `invoices/{invoiceId}`

```ts
{
  invoiceNumber: "INV-2026-0087",
  bookingId: string,
  bookingNumber: string,
  status: "draft" | "sent" | "paid" | "void",
  amount: number,
  taxAmount: number,
  lineItems: [...],                  // snapshot at generation
  pdfPath: "invoices/INV-2026-0087.pdf",
  issuedAt: Timestamp,
  sentAt?: Timestamp,
  sentByUid?: string,
  dueDate?: Timestamp,
  terms: "Net 15",
  paidAt?: Timestamp,
  paidAmount?: number,
  paymentMethod?: "check" | "ach" | "cash" | "card_offline" | "other",
  paymentReference?: string,
  notes?: string,
  createdAt, updatedAt
}
```

### 7.5 `reviews/{reviewId}`

```ts
{
  bookingId?: string,                // present = verified customer
  rating: 1..5,
  title: string,
  body: string,
  displayName: string,
  displayNameMode: "business" | "first_name" | "anonymous",
  businessTypeLabel?: string,        // "Medical office, Brooklyn"
  serviceId?: string,
  photoPaths?: string[],
  status: "pending" | "approved" | "rejected",
  featured: boolean,
  ownerResponse?: { body: string, at: Timestamp, byUid: string },
  moderation?: { byUid, at, reason },
  submittedAt: Timestamp,
}
```

### 7.6 `certifications/{certId}`

```ts
{
  name: "General Liability Insurance",
  issuer: "…",
  category: "insurance" | "safety" | "industry" | "environmental" | "personnel",
  credentialId?: string,
  issueDate: Timestamp,
  expiryDate?: Timestamp,
  description: string,
  badgeImagePath?: string,
  documentPath?: string,
  published: boolean,
  order: number,
  createdAt, updatedAt
}
```

### 7.7 `notifications/{notificationId}`

```ts
{
  // Document ID is DETERMINISTIC for anything a scheduled function
  // creates, so hourly/daily re-runs overwrite instead of duplicating.
  // e.g. needs_completion_{bookingId}, overdue_{invoiceId}_{YYYY-MM-DD}
  type: "new_booking" | "job_needs_completion" | "invoice_needed"
      | "invoice_overdue" | "reschedule_requested" | "cancellation_requested"
      | "review_pending" | "certification_expiring" | "contact_form"
      | "recurring_lead",
  severity: "info" | "action" | "warning",
  title: string,
  body: string,
  link: string,                      // deep link into the portal
  relatedId?: string,
  read: boolean,
  readByUid?: string,
  readAt?: Timestamp,
  createdAt: Timestamp,
}
```

---

## 8. Security

### 8.1 Firestore rules

The posture is simple: **the browser never writes to Firestore, and reads almost nothing.** All mutations go through Next.js API routes using the Admin SDK, which bypasses rules. This means the rules only need to protect the small set of public reads.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /reviews/{id} {
      allow read: if resource.data.status == 'approved';
      allow write: if false;
    }
    match /certifications/{id} {
      allow read: if resource.data.published == true;
      allow write: if false;
    }
    match /galleryPairs/{id} {
      allow read: if resource.data.published == true;
      allow write: if false;
    }
    match /services/{id} {
      allow read: if resource.data.active == true;
      allow write: if false;
    }
    match /settings/content {
      allow read: if true;
      allow write: if false;
    }

    // Everything else: server-only
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Even these public reads are better served through the Next.js server for caching. The rules above are a safety net, not the access path.

### 8.2 Storage rules

```
service firebase.storage {
  match /b/{bucket}/o {
    match /public/{allPaths=**} {         // badges, approved review photos,
      allow read: if true;                //   published gallery pairs
      allow write: if false;
    }
    match /quarantine/{allPaths=**} {      // unmoderated review photo uploads
      allow read, write: if false;
    }
    match /{allPaths=**} {                // invoices, job photos, cert PDFs
      allow read, write: if false;        // signed URLs only, minted server-side
    }
  }
}
```

Invoice PDFs and job photos are served through short-lived signed URLs generated by the server after checking authorization.

### 8.3 Admin authentication

- Firebase Auth, email + password, with an `admin: true` custom claim set by a CLI script or the Admin SDK (never self-serve)
- Sign-in exchanges the ID token for an HTTP-only, secure, SameSite=Lax session cookie
- Session lifetime 5 days, refreshed on activity
- An `ADMIN_ALLOWED_EMAILS` allowlist as a second gate

**Where verification actually happens — this trips people up.** Next.js middleware runs on the Edge runtime, and `firebase-admin` needs Node APIs, so `verifySessionCookie` **cannot run in middleware** as normally configured. Do this instead:

- **Middleware:** cheap presence-and-shape check on the cookie. Redirect to `/admin/login` if it's missing. This is a UX convenience, not a security boundary.
- **`/admin` server layout:** real `verifySessionCookie()` call, plus the `admin` claim check. Every admin page renders beneath it.
- **Every `/api/admin/*` route handler:** the same real verification, independently. Never rely on the layout having run — API routes are directly addressable.

(The alternative is opting middleware into the Node runtime, but per-route verification is the more robust pattern regardless.)

**MFA** is worth enabling given this portal holds customer addresses and alarm codes. Note that Firebase Auth MFA requires upgrading the project to **Identity Platform** — it is not a simple toggle, and it has its own pricing. Decide before launch rather than retrofitting.

### 8.4 Other

- Zod validation on every API route, server-side, with no exceptions
- Rate limiting on `/api/bookings`, `/api/reviews`, `/api/contact`
- CAPTCHA (Turnstile) on public forms
- Lookup and review tokens: 32 bytes of `crypto.randomBytes`, stored as a SHA-256 hash
- No PII in logs — scrub email, phone, address from error reporting
- Audit log entry for every admin mutation

### 8.5 Data protection note

The `site.accessNotes` field will in practice contain alarm codes and key locations. Treat it accordingly: never render it on a public page, never include it in a PDF that leaves your control, exclude it from CSV exports by default, and consider a retention policy that clears it 30 days after job completion.

---

## 9. Build phases

### Phase 1 — Foundations
Firebase projects (prod + staging), Railway services, Next.js scaffold, Tailwind + shadcn, admin auth with session cookies, Firestore rules, settings documents and their admin editors, crew CRUD.

### Phase 2 — The scheduling engine
Duration estimator, pricing calculator, availability endpoint, `crewDays` index, the booking transaction. **Write the §3.7 acceptance tests here, before any booking UI exists.** This phase is the project's technical risk; isolate it and prove it.

### Phase 3 — Customer booking flow
Four-step form, live price panel, calendar and slot picker, confirmation page, lookup page, CAPTCHA and rate limiting.

### Phase 4 — Admin operations
Dashboard and notification feed, crew-column calendar with drag-to-reschedule, bookings list and detail, price breakdown with adjustments, mark-complete flow.

### Phase 5 — Invoicing and payouts
Invoice numbering, PDF template and generation, Storage upload, prepare-email panel with `mailto:`, mark sent / mark paid, invoice list with aging, payout computation and pay-period views, margin report.

### Phase 6 — Public content
Home with mission, services, **before/after gallery with the comparison slider and the promote-from-job path**, reviews page with **both the open and invited submission flows**, review moderation, certifications page and management, about/contact/terms/privacy.

### Phase 7 — Background jobs and polish
Cloud Functions (completion flagging, expiry checks, overdue invoices, backups), SEO and structured data, accessibility audit, Lighthouse pass, error monitoring, staging soak test, production launch.

**Suggested sequencing note:** Phases 2 and 3 are the critical path. Phases 5 and 6 can run in parallel with 4 if more than one person is building.

---

## 10. Open decisions — what I need from you

These are the blanks in the spec. None of them block starting Phase 1, but they all need answering before launch.

| # | Question | Needed by |
|---|---|---|
| 1 | Final mission statement text | Phase 6 |
| 2 | Exact list of services you offer, and your real rates | Phase 2 |
| 3 | Your actual production rates — how long does a 10,000 sq ft standard clean take your crew? | Phase 2 |
| 4 | How many crews, and how many people per crew? (If they differ in size, the smallest sets `quotingCrewHeadcount` — see §3.2) | Phase 1 |
| 5 | Business operating hours and days | Phase 1 |
| 6 | Do you take after-hours / overnight jobs? (Affects midnight-crossing logic) | Phase 2 |
| 7 | Service area — which cities/ZIPs, and do you surcharge beyond a radius? | Phase 2 |
| 8 | Is commercial cleaning taxable in your state? (Confirm with your accountant) | Phase 5 |
| 9 | Invoice payment terms — Net 15, Net 30? And remit-to instructions | Phase 5 |
| 10 | Crew hourly cost per cleaner, and your pay period start day | Phase 5 |
| 11 | Should new bookings auto-confirm, or wait for your review? | Phase 2 |
| 12 | Which certifications do you actually hold, with documents? | Phase 6 |
| 12b | Before/after photos — at least 4 pairs, with written client consent to publish | Phase 6 |
| 13 | Domain name, and do you have a logo and brand colors? | Phase 1 |
| 14 | Do you want the tokenized crew completion link (§6.12)? | Phase 4 |

---

## 11. Phase 2 roadmap (after launch)

Ordered by likely value:

1. **Transactional email** — booking confirmations to customers, one-click invoice send, automated review requests. This is the single biggest upgrade and the most common thing to add first.
2. **Online payments** — Stripe invoice links or card-on-file, once you're comfortable with the volume.
3. **Recurring contracts** — auto-generate a series of bookings from a frequency, with the whole series manageable as one contract.
4. **Customer accounts** — booking history and one-click rebook for repeat commercial clients.
5. **SMS reminders** — day-before reminders to the site contact.
6. **Distance-aware travel time** — replace the flat 60 minutes with a maps API calculation between consecutive job addresses.
7. **Crew mobile view** — a fuller version of the tokenized link: today's route, checklists, photo capture.
8. **QuickBooks export** — invoice and payout sync.

---

## 12. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Buffer implemented on both sides of a job | Capacity silently drops ~33% | §3.3 spells out the correct rule; acceptance tests 4 and 5 catch it |
| Booking transaction reads only the job's own day | Real double-booking across midnight | §3.5 mandates reading D−1, D, D+1 always; acceptance test 10 catches it |
| Availability and booking read different occupancy sources | Slots offered that aren't free | Both read `crewDays` only; §3.4 |
| Minimum charge applied before modifiers | Jobs priced below your floor | §4.1 fixes the order |
| Scheduled functions duplicate notifications | Feed becomes unusable in a week | Deterministic notification document IDs; §2.2 |
| Duration estimates wrong for real jobs | Overlapping crews, angry customers | Tune production rates against actual times in the first month; the completion form captures actual start/end for exactly this |
| Race condition on the last slot | Double booking | Single-document transaction (§3.5) plus acceptance test 3 |
| DST transition breaks availability | Missing or duplicate hours twice a year | Luxon/date-fns-tz throughout, never raw `Date` math; acceptance test 10 |
| Spam bookings without payment friction | Junk on the calendar | CAPTCHA, rate limiting, optional admin-review-before-confirm |
| Open review form attracts spam or defamation | Reputational and legal exposure | Mandatory moderation before publish, CAPTCHA, per-IP limits, hashed-IP visible to admin (§5.5) |
| Publishing client photos without consent | Client relationship damage | Consent checkbox required on every gallery pair (§5.6) |
| Client-submitted price trusted | Underbilling | All pricing recomputed server-side; client price is display-only |
| Firebase Blaze plan surprise bill | Unexpected cost | Budget alerts on the GCP project; the workload is tiny but set the alert anyway |
| Access codes leaking | Security incident | §8.5 handling rules |

---

*End of specification.*
