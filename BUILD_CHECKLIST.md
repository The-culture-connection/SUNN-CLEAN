# SUNN CLEAN — What I Need From You to Build This

**For:** Grace S.
**Date:** August 15, 2026
**Goal:** you set the stage, I build the site.

---

## How to use this

Everything below is grouped by **when it blocks me**, not by topic. Work top to bottom.

- **🔴 Section A** blocks me from writing the first line of code. There are 6 items.
- **🟡 Section B** blocks me from finishing the booking engine — the core of the site. 9 items.
- **🟢 Section C** blocks launch, not building. I'll build around placeholders and drop your real content in. 12 items.
- **⚪ Section D** are decisions I'll make for you unless you say otherwise. You can skip these entirely.

**You do not need to finish everything before I start.** Get me Section A and I begin. Section B can arrive while I'm building the foundations.

A fast way to do this: copy this file, fill in the blanks inline, and send it back.

---

## 🔴 SECTION A — Blocks the first line of code

### A1. Firebase project

Create a project at [console.firebase.google.com](https://console.firebase.google.com). Create **two**, actually — one for the real site, one for testing, so my test bookings never land on a real crew's calendar.

- [ ] Project created: `sunnclean-prod`
- [ ] Project created: `sunnclean-staging`
- [ ] In each: enable **Firestore Database** (start in production mode)
- [ ] In each: enable **Storage**
- [ ] In each: enable **Authentication** → Email/Password sign-in
- [ ] Upgrade **both** to the **Blaze (pay-as-you-go)** plan

> **On Blaze:** it needs a credit card, but for your volume the bill will likely be a few dollars a month — the free allowances cover most of it. It's required because Cloud Functions won't run on the free Spark plan. Set a **budget alert at $25/month** in the Google Cloud console so you're never surprised.

**Then send me, for each project:** Project settings → Service accounts → **Generate new private key**. That downloads a `.json` file.

> ⚠️ That JSON file is a master key to your database. Don't email it or put it in a shared drive. Send it through a password manager, an encrypted note, or by adding it directly to Railway yourself (I'll walk you through where).

- [ ] Service account JSON — prod
- [ ] Service account JSON — staging

### A2. Railway account

- [ ] Account created at [railway.app](https://railway.app)
- [ ] Payment method added (the Hobby plan at ~$5/month covers this comfortably)
- [ ] I have access — either you invite me to the project, or you add the env variables yourself while I guide you

### A3. GitHub repository

- [ ] A repo created (private) for the code
- [ ] I have push access, **or** you're comfortable with me delivering code you push yourself

> Railway deploys from GitHub automatically. Without this, every deploy is a manual file upload — worth the ten minutes to set up.

### A4. Domain name

- [ ] Domain purchased: `_______________________`
- [ ] Registrar: `_______________________` (Namecheap, GoDaddy, Google Domains, etc.)
- [ ] I can access DNS settings, or you can add two records I give you

> If you don't have one yet, `sunnclean.com` or `sunncleanservices.com` are the obvious first checks. Buy it before someone else does — it's ~$12/year.

### A5. How many crews, and how big?

This is the single most important number in the whole system. It sets your capacity.

| Crew | How many cleaners? | Notes |
|---|---|---|
| Crew 1 | ______ | |
| Crew 2 | ______ | |
| Crew 3 | ______ | |
| (add more) | ______ | |

- [ ] Filled in

> If your crews are different sizes, tell me — I quote job length against your **smallest** crew so estimates stay honest.

### A6. Operating hours

| Day | Open | Close | Closed? |
|---|---|---|---|
| Monday | ______ | ______ | ☐ |
| Tuesday | ______ | ______ | ☐ |
| Wednesday | ______ | ______ | ☐ |
| Thursday | ______ | ______ | ☐ |
| Friday | ______ | ______ | ☐ |
| Saturday | ______ | ______ | ☐ |
| Sunday | ______ | ______ | ☐ |

- [ ] **Do you take overnight jobs that run past midnight?** ☐ Yes ☐ No

> Say yes only if you actually do it. Overnight scheduling adds real complexity, and I'd rather not build it if you'll never use it.

---

## 🟡 SECTION B — Blocks the booking engine

### B1. Your actual services

The spec has five defaults. Cross out what you don't do, add what's missing.

| Service | Do you offer it? | Your price per sq ft | Your minimum charge |
|---|---|---|---|
| Standard Janitorial | ☐ | $______ | $______ |
| Deep Clean | ☐ | $______ | $______ |
| Post-Construction | ☐ | $______ | $______ |
| Move-in / Move-out | ☐ | $______ | $______ |
| Floor Care (strip & wax) | ☐ | $______ | $______ |
| _____________________ | ☐ | $______ | $______ |

- [ ] Filled in

> Don't overthink the exact numbers. They're editable in the admin portal in ten seconds, and you'll tune them once you see real jobs. I just need a starting point that isn't wildly wrong.

### B2. How long do jobs actually take you? ⭐

**This is the item people skip, and it's the one that breaks schedules.** If my estimate says 3 hours and your crew needs 5, you'll get double-booked in practice even though the software thinks it prevented it.

Think of a recent job you remember clearly:

- Square footage: ____________
- Service type: ____________
- How many cleaners: ______
- How long it took, start to finish: ______

Give me two or three of these across different service types and I'll calibrate from real numbers instead of industry averages.

- [ ] Provided

### B3. Add-on services and prices

| Add-on | Offer it? | Price | Roughly how much extra time? |
|---|---|---|---|
| Restroom deep sanitize | ☐ | $______ per restroom | ______ min |
| Interior window cleaning | ☐ | $______ per ______ | ______ min |
| Carpet extraction | ☐ | $______ per 1,000 sq ft | ______ min |
| Hard floor buff | ☐ | $______ per 1,000 sq ft | ______ min |
| Breakroom appliance clean | ☐ | $______ each | ______ min |
| Trash haul-away | ☐ | $______ flat | ______ min |
| _____________________ | ☐ | $______ | ______ min |

- [ ] Filled in

### B4. Surcharges

- [ ] After-hours (before 7am / after 6pm): ______% or ☐ none
- [ ] Weekend: ______% or ☐ none
- [ ] Holiday: ______% or ☐ none
- [ ] Any others: ____________________

### B5. Property type pricing

Do you charge more for harder property types? The defaults are: medical +25%, restaurant +20%, gym +15%, educational +10%, retail +5%, office baseline, warehouse −15%.

- [ ] These are fine as a starting point
- [ ] Change them to: ____________________

### B6. Service area

- [ ] Cities / neighborhoods you serve: ____________________
- [ ] Do you charge extra beyond a certain distance? ☐ No ☐ Yes — roughly $______ beyond ______ miles

> In Phase 1 a distance surcharge is a manual line item you add before invoicing. Automating it needs a maps API and a zone table — not worth it until you're doing it weekly.

### B7. Crew pay

- [ ] Hourly rate per cleaner: $______
- [ ] Do rates differ by crew? ☐ No ☐ Yes: ____________________
- [ ] Your pay period starts on: ____________________ (e.g. Monday)

> This only drives the payouts *report*. The site doesn't pay anyone — it just tells you what you owe.

### B8. Booking rules

- [ ] Minimum notice before a job: ☐ 24 hours ☐ 48 hours ☐ Other: ______
- [ ] How far ahead can people book: ☐ 60 days ☐ 90 days ☐ Other: ______
- [ ] Should new bookings **auto-confirm**, or wait for you to approve them?
      ☐ Auto-confirm ☐ I want to review each one first

> I'd suggest reviewing them for the first month, then switching to auto-confirm once you trust it. Either way it's a toggle you flip yourself.

### B9. Tax

- [ ] Is commercial cleaning taxable in your state? ☐ No ☐ Yes, at ______%  ☐ Need to ask my accountant

> **Please actually ask.** It varies by state and sometimes by cleaning type. I'll build the field either way, but getting this wrong on real invoices is a headache to unwind. I'm not able to advise on tax treatment — this one needs your accountant.

---

## 🟢 SECTION C — Blocks launch, not building

I'll build with clear placeholders and swap in your real content whenever it arrives.

### C1. Your mission statement ⭐

You said this matters most, so it sits high on the homepage where everyone sees it.

Two or three sentences on **why SUNN CLEAN exists**, who you serve, and what you refuse to compromise on. Write it how you'd say it out loud — the polished corporate version is always worse.

```
[ your mission statement ]
```

- [ ] Provided

Plus three short values or promises, one line each:

1. ____________________
2. ____________________
3. ____________________

### C2. Before & after photos ⭐

You asked for these and they're the most persuasive thing on the site. I need **pairs** — the same angle, before and after.

- [ ] At least 4 pairs (8 photos), ideally 6–8 pairs
- [ ] For each: a caption like "Medical office · 8,400 sq ft" and roughly how long the job took
- [ ] **Written permission from each client to publish photos of their space**

> That last one matters. Also check every photo for things that shouldn't be public — visible documents, computer screens, signage, anything identifying a third party. A quick look now avoids an awkward call later.

**Photo tips if you're taking new ones:** same spot, same angle, same lighting for both shots. Landscape orientation. Shoot the before *before* you start, not halfway through — the temptation to skip it is strong and the after shot is worthless without it.

### C3. Your certifications

For each credential you hold: name, issuing organization, credential/policy number, issue date, expiry date, and a PDF or photo of the certificate if you have one.

- [ ] General Liability Insurance — COI PDF
- [ ] Workers' Compensation
- [ ] Janitorial/surety bond
- [ ] OSHA training records
- [ ] Any industry memberships (ISSA, BSCAI, IICRC…)
- [ ] Any green/eco certifications
- [ ] Background check policy — a sentence describing what you do

> Only list what you actually hold. An unverifiable badge on a cleaning company's site is worse than no badge — commercial clients check these.

### C4. Contact details

- [ ] Business phone: ____________________
- [ ] Business email: ____________________
- [ ] Business mailing address: ____________________
- [ ] Legal business name (for invoices): ____________________
- [ ] EIN / tax ID for invoices, if you put it on them: ____________________

### C5. Invoice details

- [ ] Payment terms: ☐ Net 15 ☐ Net 30 ☐ Due on receipt ☐ Other: ______
- [ ] **Remit-to instructions** — exactly what you want customers to read on the invoice about how to pay you:

```
[ e.g. "Make checks payable to SUNN CLEAN LLC and mail to…"
       or "Zelle to (555) 010-2233" or your bank details ]
```

- [ ] Anything else on the invoice footer (late fee policy, thank-you note): ____________________

### C6. Social proof numbers

- [ ] Years in business: ______
- [ ] Roughly how many businesses served: ______
- [ ] Any existing reviews elsewhere (Google, Yelp, Facebook) I should seed the reviews page with? ☐ Yes ☐ No

> If you have Google reviews, don't copy them onto the site — link to them. Copied reviews read as fake even when they aren't. Better: send your best current clients the review link once the site is live.

### C7. Brand assets

- [x] **Logo** — got it, and I've pulled your colors from it:

| Color | Hex | Where it's used |
|---|---|---|
| Navy | `#003C60` | Headings, body text, primary buttons |
| Sun yellow | `#FCC00C` | Call-to-action buttons, accents |
| Bright blue | `#0C9CD8` | Links, highlights, icons |
| Pale blue | `#E9F5FC` | Section backgrounds, cards |

> I checked every text-on-background combination against WCAG AA contrast standards. The yellow is bright enough that it can only carry navy text, never white — that's already handled in the mockups.

- [ ] Logo as a **PNG with transparent background** or an **SVG**, if you have one (the JPEG works, but a transparent version looks sharper in the header)
- [ ] Any brand fonts you use: ____________________ ☐ No preference
- [ ] Photos of your crew at work, if you have any — real people beat stock photos every time

### C8. Legal pages

- [ ] Terms of Service — ☐ I have one ☐ I need one
- [ ] Privacy Policy — ☐ I have one ☐ I need one
- [ ] Cancellation policy — how much notice do you require, and is there a fee? ____________________

> I can draft plain-language starting versions of the terms and privacy policy, but **have a lawyer review them before launch**. I'm not able to give you legal advice, and boilerplate pulled off the internet often doesn't match how you actually operate.

### C9. A second admin account

- [ ] Email for a second admin: ____________________

> Right now you'd be the only person who can get into the portal. If you lose access, everything stops. Add one trusted person.

---

## ⚪ SECTION D — I'll decide these unless you object

You can skip this whole section. I'm listing them so nothing is a surprise later.

| Decision | What I'll do | Why |
|---|---|---|
| Travel buffer | 60 minutes between jobs | What you asked for |
| Job length floor | 2 hours minimum | Not worth dispatching a crew for less |
| Job length ceiling | 10 hours → routed to manual quote | Anything bigger needs a conversation, not a form |
| Availability granularity | 30-minute start times | 15 minutes is a wall of buttons; hourly is too coarse |
| Recurring bookings | Books the first visit only, flags you to follow up with contract pricing | Prevents someone clicking "weekly" and getting 15% off a one-time job |
| Review submission | Open to anyone, verified badge when the email matches a completed job, everything moderated before publishing | More reviews, still honest |
| Review attachments | Photos only, up to 4, no video | Video costs far more to store and moderate than it's worth here |
| Booking spam protection | CAPTCHA + rate limiting | No payment step means no natural friction |
| Access codes and alarm info | Encrypted, crew-only, excluded from exports, cleared 30 days after the job | You'll be storing real alarm codes |
| Customer confirmation email | **Not in Phase 1** — customers get a private link on the confirmation screen | You asked for portal-only notifications. This is the first thing I'd add in Phase 2 |

---

## What happens once you send Section A

1. I set up the repo, Railway and Firebase wiring, and get a blank deployed site live at your domain
2. I build the scheduling engine and write the automated tests that prove double-booking is impossible — **before** any pretty pages exist
3. I build the booking flow, then the admin portal
4. Invoicing, payouts, then the public content pages
5. You test on staging with fake bookings; we fix what's wrong
6. Launch

I'll send you working previews as each piece lands, so you're never waiting on a big reveal at the end.

---

## The three things that matter most

If you only do three things this week:

1. **Create the Firebase projects and the Railway account** (A1, A2) — nothing starts without them
2. **Tell me how many crews and how long jobs actually take** (A5, B2) — these two numbers determine whether the schedule works in real life or only on paper
3. **Take the before/after photos** (C2) — they take the longest to gather and they're the most persuasive thing on the site

Everything else can follow.
