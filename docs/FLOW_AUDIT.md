# Hostiggo: Product Flow Audit & Requirements (for the React Native app)

**Source of truth:** the Hostiggo website (`hostiggo-full-website`, Next.js 16 App Router + Supabase), audited and hardened on 2026‑09‑30 / 2026‑10‑01 against `QA_AUDIT_REPORT.pdf` and `DESTINATION_DROPDOWN_REPORT.pdf`.
**Audience:** the team building or extending the Hostiggo React Native app (an Expo app, `hostiggo-frontend`, already exists and shares some contracts with the website, see §11).
**Database:** schema `hostiggo_testing_schema` is **final**. The app must not require schema changes.

This document describes **every user flow, business rule, API contract and integration** that exists today, what state each one is in, and what the mobile app must do to reach parity (or better).

---

## Contents

1. [Product summary](#1-product-summary)
2. [Status legend & overall readiness](#2-status-legend--overall-readiness)
3. [System architecture](#3-system-architecture)
4. [Identity, sign‑in & sessions](#4-identity-sign-in--sessions)
5. [Guest flows](#5-guest-flows)
6. [Host flows](#6-host-flows)
7. [Business rules (canonical)](#7-business-rules-canonical)
8. [Data model reference](#8-data-model-reference)
9. [API catalogue](#9-api-catalogue)
10. [Integrations & configuration](#10-integrations--configuration)
11. [Notifications contract (shared with the app)](#11-notifications-contract-shared-with-the-app)
12. [Status matrix: working / fixed / unverified / gaps](#12-status-matrix)
13. [React Native app requirements](#13-react-native-app-requirements)
14. [Acceptance checklist for the app](#14-acceptance-checklist-for-the-app)
15. [Open product decisions](#15-open-product-decisions)

---

## 1. Product summary

Hostiggo is an India‑first **homestay marketplace**. Guests discover and book homestays; hosts list properties and get paid.

| | Guest | Host |
|---|---|---|
| Core job | Find a stay, book & pay, manage the trip | List a property, take bookings, get paid |
| Money | Pays stay + GST + 8% Hostiggo service fee (+18% GST on it) in **INR** via Razorpay | Receives stay price − 5% commission − 1% TCS − 1% TDS via **Razorpay Route** |
| Trust | Verified reviews only, moderated chat, host identity KYC | KYC (PAN / Aadhaar / passport) + verified bank for payouts |
| Channels | Web, mobile app, in‑app inbox, push, WhatsApp, email | Same |

**Differentiators to protect in the app (vs Airbnb):** all‑in nightly price shown up front, exact dated refund deadlines on every booking, verified‑stay‑only reviews, WhatsApp booking updates, AI listing import from Airbnb/Booking.com/etc., iCal sync, transparent host earnings preview, Indian payments (UPI/cards via Razorpay), IST‑correct dates everywhere.

---

## 2. Status legend & overall readiness

| Mark | Meaning |
|---|---|
| ✅ | Working and verified (build, unit tests, or smoke test against a production build) |
| 🔧 | Was broken in the QA audit, **fixed** in this pass, verified |
| ⚠️ | Implemented but **not verified end‑to‑end** (needs live keys / real devices) |
| ❌ | Known gap, not built, or deliberately removed |

**Verification run (2026‑10‑01):** `next build` ✅ · `tsc --noEmit` ✅ · ESLint 0 errors ✅ · Vitest **78/78** ✅ · production smoke test **all pass** (16 private endpoints return 401 without a token, malformed input returns 400, rate limit returns 429, unknown property returns HTTP 404, search sorted correctly, security headers present, sitemap generated).

**Not verifiable without live credentials/devices:** Razorpay checkout & refunds, Razorpay Route payouts, SMS/email OTP delivery, Google OAuth, WhatsApp delivery, SurePass KYC, AI‑lister import, iCal service, real phone widths in Safari/Chrome.

---

## 3. System architecture

```
                ┌──────────────────────┐        ┌──────────────────────────┐
  Web (Next.js) │  React client pages  │        │  React Native (Expo) app │
                └─────────┬────────────┘        └────────────┬─────────────┘
                          │  HTTPS + Authorization: Bearer <Supabase access token>
                          ▼                                  ▼
                ┌─────────────────────────────────────────────────────────┐
                │  Next.js Route Handlers  /api/*   (the backend / BFF)   │
                │  - verifies token → user id (src/lib/auth-server.ts)    │
                │  - business rules, pricing, refunds, payouts, moderation│
                │  - service-role Supabase client (bypasses RLS)          │
                └───┬───────────┬──────────┬──────────┬──────────┬────────┘
                    ▼           ▼          ▼          ▼          ▼
               Supabase     Razorpay    Twilio     SurePass   AI-lister / iCal
          (Postgres+Auth+   (payments,  (WhatsApp)  (KYC)     microservices
           Storage+Realtime) Route)                            (Railway/Render)
```

**Key architectural rules (apply to the app too):**

- **The `/api/*` routes are the backend.** Pricing, availability, refunds, payouts, review eligibility, chat moderation and KYC live there. **The app must call these endpoints, not re-implement them client-side and not write those tables directly through Supabase.**
- **Identity = verified Supabase access token.** Every private endpoint derives the user from `Authorization: Bearer <access_token>`. A `userId` in a body or query string is ignored, or rejected with 403 if it doesn't match.
- **Supabase direct access from clients** is limited to: Auth (sign-in, session refresh), Realtime subscriptions (chat messages, notifications) and public reads already exposed via RLS. Everything else goes through `/api`.
- **Search** runs in-app from the `search_listings_by_state` RPC. The external Go search service is **opt-in** (`SEARCH_SERVICE_URL`). It was returning HTTP 500 for every request in Sept 2026.
- **Times:** stays are Indian calendar days. "Today", check-in and refund cutoffs are computed in **Asia/Kolkata**.

---

## 4. Identity, sign‑in & sessions

### 4.1 Sign‑in methods

| Method | Flow | Status |
|---|---|---|
| **Phone OTP** | Enter 10-digit Indian mobile (must match `^[6-9]\d{9}$`, sent as `+91…`) → `POST /api/auth/otp {action:"send", phone}` → 6-digit code → `POST /api/auth/otp {action:"verify", phone, token}` → returns `{user, session, profile}` | ✅ UI · ⚠️ SMS delivery |
| **Email OTP** | Enter email → Supabase `signInWithOtp` (email) → `/otp?mode=email` → verify | ✅ UI · ⚠️ email delivery |
| **Google OAuth** | Supabase OAuth (PKCE), redirect to `/auth/callback`; the post-login destination is stashed in sessionStorage | ⚠️ |

**No passwords.** Hostiggo is passwordless: there is no password sign-in, set/change password or forgot-password flow, and the app must not add one. Old `login_events` rows may still show method `password`.

After any sign-in the client **must** install the session in the Supabase client (`supabase.auth.setSession({access_token, refresh_token})`). That session is what refreshes and what counts as "signed in".

### 4.2 Onboarding (first sign-in)

`/onboarding?mode=phone|email|google`, required fields:
- Name
- Age
- Email (if they signed in by phone)
- Phone (if they signed in by email or Google; needed for WhatsApp booking updates)

Saved via `POST /api/users` (token must match `user_id`). Returning users with a name and age skip onboarding.

### 4.3 Session rules

- 🔧 Only a real Supabase session counts as signed in. A user id in local storage alone is cleared.
- 🔧 Every `/api/*` call carries the bearer token. On a **401** the client refreshes the session **once** and retries, so idle users aren't logged out mid-task.
- Tokens refreshed in the background (`TOKEN_REFRESHED`) replace the stored copy.
- Signing out calls `supabase.auth.signOut()` and clears all local auth keys. Other tabs follow via `SIGNED_OUT`.
- Account deactivation (`PATCH /api/users {action:"deactivate-account"}`) sets `users.is_active=false` and bans the auth user. Deactivated users get `?error=account_deactivated` at sign-in.

### 4.4 Safety controls

| Control | Detail | Status |
|---|---|---|
| Post-login redirect | Only same-origin relative paths are honoured (`safeRedirect`); `https://…`, `//…`, `/\…` and control characters are rejected | 🔧 BUG‑006 |
| Rate limits | OTP send: 10 per IP and 4 per target per 10 min. OTP verify: 10 per target per 10 min. Feedback: 5 per 10 min per IP. Responses are 429 with `Retry-After` | 🔧 BUG‑014 |
| Login activity | Each sign-in recorded in `login_events` (method, IP, user agent); visible at `/account/login-activity` | ✅ |

---

## 5. Guest flows

### 5.1 Discovery: home & search

**Home hero (`/`):**
- Destination box. It opens a panel with:
  - "Use current location"
  - Recent searches (last 3, stored locally)
  - Suggested destinations, ranked by real listing counts
  - City guides with popular areas
  - Free-text search via `GET /api/locations?q=` once 2 or more characters are typed
- Date range picker
- Guests (adults, children, rooms)
- "Popular choices" chips: ₹1000–3000, Breakfast, Free cancellation, Entire place, 5★, Above 3★, Lowest price
- Empty destination → "Please enter a destination"

Destination dropdown fixes 🔧:
- The panel is exactly as wide as its field.
- Escape closes the destination, date and guest panels.
- The list fits the viewport and scrolls into view.
- Location failures (denied, unsupported, lookup failed) show a message.
- Dialog roles and aria attributes are in place.

**Search results (`/search`):**

| Feature | Behaviour | Status |
|---|---|---|
| URL state | `destination`, `checkIn`, `checkOut` (YYYY‑MM‑DD), `adults`, `children`, `sort`, `view=map`, `area`. Refresh and shared links restore the same search | 🔧 BUG‑020 |
| Data | `POST /api/search {cursor, pageSize, sort, filters}`. Response: `{data, cursor, hasMore, totalCount, stateBounds}`. `cursor` is an **offset** into the fully sorted and filtered set | 🔧 |
| Sort | recommended, price_asc, price_desc, top_rated, most_popular, newest, best_value. Sorted **server-side across all matches** (cap 1,000) | 🔧 BUG‑009 |
| Filters (RPC) | price range, guest rating, amenity ids, property types, dates (excludes blocked or booked nights), total guests | ✅ |
| Filters (refined) | Stay type (Entire place / Private room / Shared room); free cancellation (Flexible or Moderate policy); breakfast available (add-on #1); WiFi, parking, AC (amenity names) | 🔧 BUG‑008 |
| Removed filters | Bed type, couple-friendly, family-friendly: no data exists for them | ❌ by design |
| Amenity labels | Must match the catalogue: WiFi, Kitchen, Air Conditioning, Heater, TV, Washing Machine, Free Parking, Swimming Pool, Gym, Hot Tub, Balcony, Smoke Alarm, Fire Extinguisher, First Aid Kit, Pet Friendly, BBQ Grill, Garden | 🔧 |
| States | Skeleton while loading; "No properties found" with "Clear all filters"; **error with "Try again"** on failure | 🔧 BUG‑010 |
| Infinite scroll | Next page via `cursor` | ✅ |
| Map view | Google Maps markers; state bounds used for framing | ⚠️ (needs a Maps key) |
| Result card | Cover photo, title, location, real rating and review count, all-in nightly price, wishlist heart | ✅ |
| Heart while signed out | Toast, then sign-in, then **back to the same results page** | 🔧 UX‑12 |

### 5.2 Property page (`/property/:id`)

Server-rendered wrapper: an unknown or inactive listing returns a **real HTTP 404** (🔧 BUG‑029). Each listing has its own `<title>`, description and Open Graph image.

**Sections:**
- Gallery with "Show all photos"
- Title, location, rating, share, save to wishlist (pick a list)
- Host line with avatar, verified badge and trips hosted
- Description
- Amenities (show all)
- **Availability and booking widget** (anchor `#availability`)
- Map
- Reviews preview, plus a full page at `/property/:id/reviews`
- Add-ons
- House rules
- Safety features
- Cancellation policy
- Suggested stays
- A sticky bar after scrolling past the gallery; its "Reserve" scrolls to `#availability` 🔧

**Booking widget flow:**
1. Pick dates (`?checkIn&checkOut` prefill supported) and guests.
2. Check availability: `GET /api/bookings/check-availability?listingId&startDate&endDate` returns `{available, reason}`.
3. A price breakdown appears. Nightly rates are weekend-aware; selected add-ons and every GST line are listed, with a total. Money always shows two decimals when there are paise (₹57.60) 🔧 BUG‑022.
4. **Book** (needs sign-in; returns to this page with the dates preserved) → see §5.3.

If bookings are paused (`BOOKINGS_OPEN=false`), a notice is shown **before** the guest picks dates and the CTA reads "Bookings are paused right now" 🔧 UX‑01.

### 5.3 Booking & payment (money flow)

```
Guest taps Book
  └─ POST /api/bookings/reserve {listingId, startDate, endDate, numAdults, numChildren, addonIds}
       server: verifies token, bookings open, dates valid (IST), ≤90 nights,
               re-checks availability, re-prices server-side (client amount ignored)
       ├─ payments ON  → creates Razorpay order (booking data in order.notes)
       │                 ← {razorpayOrderId, razorpayKeyId, amountPaise, currency}
       └─ unpaid mode  → (staging only) creates confirmed booking ← {paymentRequired:false, booking}
  └─ Razorpay Checkout (web: checkout.js · app: react-native-razorpay)
       ├─ script/SDK fails to load → explicit error "couldn't open the payment window" 🔧 BUG‑013
       └─ guest closes → nothing was created, can retry
  └─ POST /api/bookings/confirm-payment {razorpayOrderId, razorpayPaymentId, razorpaySignature}
       server: HMAC-verifies signature → finalizeBookingFromRazorpayOrder (idempotent on payment id)
       ├─ success → redirect to /booking-confirmation/:id
       └─ failure → client retries 3× (backoff); then "Payment received… don't pay again",
                    send guest to My Trips (the webhook finalizes independently) 🔧 BUG‑015
Razorpay webhook payment.captured → same finalize (backup path)
```

Kill switches, enforced on the server 🔧 OBS‑01:
- `NEXT_PUBLIC_BOOKINGS_DISABLED=true` returns 503 `BOOKINGS_PAUSED`.
- If payments are off and `NEXT_PUBLIC_ALLOW_UNPAID_BOOKINGS` isn't set, bookings are **closed**. The old behaviour handed out free confirmed bookings.

On confirmation:
- An in-app notification, push and WhatsApp template go to the guest (`booking_confirmation_guest`) and the host (`booking_received_host`).
- A calendar block is created.
- A Razorpay Route transfer of the host payout is created if the host is onboarded.
- An invoice snapshot is stored in `bookings.invoice`.

### 5.4 Booking confirmation (`/booking-confirmation/:id`) 🔧 BUG‑004 (rebuilt)

Visible only to the booking's guest or the listing's host (`GET /api/bookings/details?id=`).

States:
- Loading
- Signed out (sign in, then return here)
- Not found or no permission
- Error with retry
- Ready: **never sample data**

Ready view:

| Area | Content |
|---|---|
| Status banner | Confirmed (reference `invoice_number` or `HG-<id>`, paid date) / Waiting for payment ("don't pay again") / Cancelled (refund amount and status) |
| Photos | Up to 3 |
| Actions | Download PDF receipt (jsPDF, real line items); Add to calendar (.ics in IST); View listing; Share |
| Your stay | Check-in and check-out dates with the listing's times, nights, guests, booker name. **Full address and "Get directions" only when confirmed.** "Change dates, guests or cancel" deep-links to `/my-memories?manage=<id>` |
| The place | Bedrooms, beds, bathrooms, max guests, amenities, house rules, "carry a government photo ID" |
| Payment | Stored invoice line items (or rebuilt with the same rules), GST, total paid, refund line |
| Cancellation policy | **Dated schedule in IST** that matches the server refund engine exactly (unit-tested); past cutoffs struck through; refund-scope note |
| Your host | Avatar or initials, verified badge, hosting since, about, **Message host**, **host phone only after confirmation** |
| Footer | "Report an issue with this booking" → `/report-issue?booking=<id>` |

### 5.5 My Trips (`/my-memories`)

- Tabs: Upcoming / Completed / Cancelled (`GET /api/bookings?role=guest&label=…`).
- Manage sheet (deep link `?manage=<bookingId>`):
  - Change dates (availability re-checked)
  - Change guests (capped at the listing maximum)
  - Cancel with refund preview (`GET /api/bookings/refund-preview`), then `POST /api/bookings/cancel-with-refund`
- Add-ons view: `/my-memories/addons`.

### 5.6 Cancellation & refunds

| Who cancels | Refund |
|---|---|
| Guest | Per listing policy (§7.5). Refund = stay + add-on amount; **GST and the Hostiggo service fee are never refunded**. Razorpay refund issued automatically |
| Host | **Full refund** of what the guest paid |
| Any, after the host payout was already released | No automatic refund. A row goes into `manual_settlement_flags` for the team |

Refund windows are measured from the **listing's real check-in time on the first day, in IST** 🔧. Before, they used 05:30 IST, which made every cutoff 8.5 hours earlier than guests were told.

Notifications go to both sides (`booking_cancelled_guest` / `booking_cancelled_host`).

### 5.7 Reviews 🔧 BUG‑005

- **Eligibility, enforced on the server:** a confirmed booking at this listing that has checked out (IST), and at most **one review per completed stay**. Otherwise 403 "You can review a stay once you've checked out" or "You've already reviewed this stay".
- Submitted via `POST /api/reviews` (or `PATCH /api/bookings {action:"review"}`, same rules). Rating must be a whole number 1–5; comment up to 2000 characters.
- Display: reviewer **first name and photo only**, month and year, newest first. The reviews page has a real average, a 5→1 breakdown (click to filter), sort (recent, highest, lowest), "show more", and an honest empty state.
- No stock faces anywhere: missing photos show initials (`UserAvatar`).

### 5.8 Wishlists (`/wishlist`)

- Named lists (`categories`) plus the default "Saved"; a listing can be in several lists.
- API: `GET /api/wishlist?resource=items|ids|categories|listings|listing-categories`; `POST` (`add` or `create-category`); `PATCH` (rename); `DELETE` (remove item or list). The list id must belong to the caller 🔧.
- "Recently viewed" (local, recorded when a property page loads).
- Signed out: sign-in prompt only, no edit controls 🔧 UX‑05.

### 5.9 Chat (`/chat`, host `/host/chat`) 🔧

- Threads are keyed by the guest's user id and the host's user id (`chat_messages.user_id` / `host_id`).
- `GET /api/chat` returns the caller's threads (newest first, participant name and avatar). `GET /api/chat?hostUuid=` resolves a listing's host to their chat id and name (public).
- `POST /api/chat {recipientId, text, senderType}` rules:
  - Guests may message any host.
  - Hosts may only message guests who wrote to them or booked with them.
  - Text is 1–4000 characters.
- **Off-platform contact moderation:** phone numbers (including spaced and spelled-out digits), emails, UPI ids and WhatsApp/Telegram/Instagram links are blocked with 422 `CONTACT_SHARING_BLOCKED` and logged to `chat_moderation`. Contact details are shared automatically once a booking is confirmed.
- Live updates via Supabase Realtime on `chat_messages` (one binding each for `user_id=eq.<me>` and `host_id=eq.<me>`).
- A failed send keeps the typed text and shows the server's message.

### 5.10 Notifications inbox (`/notifications`)

- `GET /api/notifications`; `PATCH /api/notifications` to mark one or all read.
- An unread badge appears in the navbar.
- Display tiers and routing are in §11.

### 5.11 Account

| Screen | Function | Status |
|---|---|---|
| `/account/profile` | Name (2–80), email, phone (Indian mobile), age (18–120), emergency contact (text containing a valid mobile, ≤100), photo upload (JPG/PNG/WEBP ≤8 MB). Inline field errors; only changed fields are sent | 🔧 BUG‑017 |
| `/account/settings` | Notification toggles (messages, email, WhatsApp, marketing), mirrored into `notification_preferences` for the app. Privacy toggles (show profile to hosts, include in search, activity status). Links to personal info, login activity, **profile verification**, **report an issue**. Delete account (confirm dialog) | 🔧 BUG‑023 |
| `/account/login-activity` | Last 20 sign-ins | ✅ |
| `/account/verification` | Identity documents | ✅ |
| `/account/password` | **Removed**: Hostiggo is passwordless (OTP and Google only) | ❌ by design |
| Language / currency | **Removed.** The platform is English + INR (payments settle in INR) | ❌ by design (BUG‑012) |

### 5.12 Support, help & legal

| Screen | Behaviour |
|---|---|
| `/support` | Four cards: report issue, suggest improvement, share experience, referral → `POST /api/feedback`. Referral was silently failing on an invalid enum value; fixed 🔧 |
| `/report-issue` | Category (technical, payment or booking, safety or grievance) → **submitted in-app** with a reference `HG-R<id>`; email is an optional fallback 🔧 BUG‑028. `?booking=<id>` prefills |
| `/help` + 6 guides | add-ons, chat guidelines, delisting, payouts, refunds, verify identity |
| `/faq` | 14 items, single-open accordion |
| Legal | terms, privacy, cookies, cancellation, shipping-policy, safety, about, contact |
| `/become-a-host` | Marketing page; the sample earnings card is labelled "Illustrative example" 🔧 UX‑09 |
| `/refer`, `/refer/dashboard` | Referral landing; the dashboard requires sign-in |

---

## 6. Host flows

### 6.1 Becoming a host

"List your property" → `/host/list/method`. A `host` row is created automatically for the user (`POST /api/host/profile`). Every host page shows a sign-in gate when signed out.

### 6.2 Listing wizard (13 steps, draft kept in `ListingDraftContext`)

| # | Step | Rules |
|---|---|---|
| 0 | Method | Manual, or AI import (§6.3) |
| 1 | Property type | One of 19 (`property_types`) |
| 2 | Stay type | Entire Property / Private Room / Shared Space |
| 3 | Location | City and state; finds or creates a canonical `locations` row (`location_id` is never null) |
| 4 | Address | Line 1–2, landmark, pincode, map pin (lat/lng) |
| 5 | Capacity | Guests 1–50, bedrooms 0–50, beds 1–50, bathrooms 0–50 🔧 BUG‑019 |
| 6 | Amenities | Catalogue ids |
| 7 | Add-ons | Catalogue add-on + price + what's included + timings |
| 8 | Photos | Upload (JPG/PNG/WEBP ≤8 MB) to the `homestay photos` bucket; choose a cover (exactly one cover per listing) |
| 9 | Details | Title ≤50, description ≤500 (wizard limits) |
| 10 | Pricing | Weekday (**Sun–Thu nights**) and weekend (**Fri–Sat nights**) prices, **₹100–₹5,00,000**, whole rupees. Live preview of the guest's all-in nightly price and host earnings, using the real billing functions 🔧 UX‑10 |
| 11 | Discounts | New listing (20%), weekly (7+ nights), monthly (28+ nights): **1–90%**, Next blocked while invalid 🔧 |
| 12 | Cancellation policy | Flexible / Moderate / Strict (strict partial % configurable) |
| 13 | House rules | Check-in and check-out **time pickers** (30-minute slots, default 2 PM / 11 AM) 🔧; smoking, pets, parties, quiet hours (10 PM–8 AM) |
| — | Identity prompt | KYC is suggested and can be deferred |
| — | Publish | `POST /api/host/listings`. The server re-validates: title ≤120, description ≤5000, price bounds, guests 1–50, valid times, discounts ≤90% |

### 6.3 AI import ("List with AI")

1. `/host/list/ai/setup`: paste an Airbnb, Booking.com, Agoda, MakeMyTrip or Goibibo URL and confirm ownership.
2. `POST /api/host/ai-import/jobs`, then poll `GET /api/host/ai-import/jobs/:id` every ~1.5 s on `/processing`.
3. `/review`: edit the parsed fields. Photos are copied into our bucket (`POST /api/host/ai-import/rehost-photos`, max 40, one bad image never fails the batch).
4. `/publish`: goes through the same `createListing`. AI-lister's own commit endpoint is **never** used.
5. Tracked in `listing_imports` / `import_batches` (status, stage, coverage, recommendations, iCal, FX).

⚠️ Needs `AI_LISTER_URL`.

### 6.4 Listing management (`/host/listings`, `/host/listings/manage`)

All endpoints are **owner-only**: the token's user must own the listing's host row 🔧 BUG‑001.

| Action | Endpoint |
|---|---|
| List own listings (incl. inactive) | `GET /api/host/listings?offset&limit` (limit ≤100) |
| Edit core fields | `PATCH /api/host/listings/update`: same bounds as publish 🔧 |
| Pause / resume | `PATCH /api/host/listings/toggle`: blocked while a delist request is pending |
| Photos | `GET/POST/PATCH(make-cover)/DELETE /api/host/listings/:id/photos`; `PATCH …/cover` |
| Amenities | `GET/PATCH …/amenities` |
| Add-ons | `GET/POST …/addons`, `PATCH/DELETE …/addons/:id` |
| Discounts | `GET/POST …/discounts`, `PATCH/DELETE …/discounts/:id` (DB check: 0 < % ≤ 100) |
| House rules | `GET/PATCH …/house-rules` |
| Safety features | `GET/POST …/safety-details`, `PATCH/DELETE …/safety-details/:id` |
| **Delist** | `GET/POST/DELETE …/delist`. Non-destructive request; takes effect via pg_cron (every 15 min) only when the request is ≥24 h old **and** no stay is pending or ongoing. Until then the listing stays live and bookable |

### 6.5 Calendar & iCal (`/host/calendar`)

- `GET /api/host/calendar?listingId&start&end` returns daily entries and bookings.
- `PATCH /api/host/calendar {listingId, date, price?, isAvailable?}` sets one day's price (0–1 crore) or blocks it.
- Daily calendar prices **override** base prices (§7.1).
- iCal sync with Airbnb, Google, Booking.com etc.: `POST /api/host/calendar/register {listingId, icalUrl, action: add|update|deactivate}`; `GET …/status`. The external service is at `ical-production.up.railway.app`; feeds are in `listing_ical_feeds`. ⚠️

### 6.6 Bookings (`/host/bookings`)

- Today / upcoming / past lists (`GET /api/bookings`, host role).
- `/host/bookings/details?id=` shows the guest card (photo or initials, name, phone, verified), dates, guests, add-ons and amounts.
- `/host/bookings/cancel?id=`: a host cancellation gives the guest a **full refund** (§5.6).

### 6.7 Earnings & payouts

- `/host/earnings`: totals, confirmed vs pending revenue, a 12-month chart, the booking table, and a **PDF earnings statement** (jsPDF). Data from `GET /api/host/payment-history`.
- **Payout setup** (`/host/settings` → payouts, `GET/PATCH /api/host/payout-methods`):
  1. Verify PAN (`POST /api/verify/pan`, SurePass).
  2. Verify the bank account (`POST /api/verify/bank`, penny-drop, name cross-check with PAN).
  3. Automatic **Razorpay Route onboarding** (`maybeAutoOnboardHostToRoute`; manual retry via `POST /api/host/create-linked-account`). Four idempotent, resumable steps: Linked Account → Stakeholder → Product config → settlement bank details.
  4. Status in `host_payout_methods.status`: submitted → onboarding → active / rejected.
- **Per booking:** on payment confirmation a Route transfer (`transfer:<bookingId>` idempotency key) sends the host payout. Webhooks `transfer.processed` and `settlement.processed` update `transfer_status`, `settlement_id`, `settlement_status` and `utr`, and notify the host.
- Settlement estimate: T+2 working days, ~1 PM IST (weekends skipped, not holidays).
- Hosts without Route setup: `transfer_status` stays null until they onboard.

### 6.8 Identity (KYC)

| Doc | Endpoint | Stored |
|---|---|---|
| PAN | `POST /api/verify/pan` | `kyc_requests` + `pan_verifications` (masked) |
| Aadhaar (eAadhaar) | `POST /api/verify/aadhaar` (multipart) | `kyc_requests` |
| Passport | `POST /api/verify/passport` | `kyc_requests` + `passport_verifications` |
| Bank | `POST /api/verify/bank` | `kyc_requests` + `bank_verifications` (hash + last 4) |

- Status: `GET /api/kyc/status` returns none / verified / rejected (with reason) / unknown. **The server is the source of truth.** The local "submitted" flag is used only when the server can't be reached.
- 🔧 BUG‑011: a successful verification that fails to save now returns an error rather than "verified".
- Any one of PAN, Aadhaar or passport counts as identity; **payouts need a verified PAN**.

### 6.9 Host reviews, chat, settings

- `/host/reviews`: every review across the host's listings (`GET /api/host/reviews`).
- `/host/chat`: same chat rules as §5.9, sending as host.
- `/host/settings`, `/host/account`: profile ("about" ≤2000 characters), stats (real rating, review count, listings), payouts, identity. The photo is changed via the account profile (the old disabled "coming soon" button was removed) 🔧.

---

## 7. Business rules (canonical)

> Pure functions in `src/lib/billing/*`, `src/lib/format.ts` and `src/lib/notificationRules.ts` are the single source of truth and are unit-tested. **Share or port them; don't re-derive.**

### 7.1 Nightly price resolution (`pricing.ts`)

1. If `listing_calendar.price > 0` for that date, it wins.
2. Otherwise `price_weekend` for **Friday and Saturday nights**, `price_weekday` for the rest.
3. Then apply the **single best** (highest %) applicable discount. It must be enabled, within `valid_from`/`valid_to`, and the stay must be at least `min_stay_nights`.

### 7.2 Guest invoice (`invoice.ts`)

| Line | Rate |
|---|---|
| Property price | Sum of nightly prices |
| GST on property | **5%** if the check-in night's rate is ≤ ₹7,500, else **18%** (based on one night's tariff, never the total) |
| Hostiggo service fee | **8%** of the property price |
| GST on the service fee | 18% |
| Breakfast add-ons | price + 5% GST |
| Other add-ons | price + 18% GST |
| **Grand total** | sum, rounded to paise |

The "all-in nightly price" on cards is the grand total for one night.

### 7.3 Host payout (`payout.ts`)

`payout base = property + breakfast + other add-ons` (excludes the service fee and all GST)
`net payout = base − 5% commission − 1% TCS − 1% TDS`

### 7.4 Booking constraints

- Dates are `YYYY-MM-DD`. Check-out must be after check-in. Check-in can't be before **today in IST**. Maximum 90 nights.
- Adults 1–30, children 0–30, capped at the listing's `num_guests` when modifying.
- Up to 20 add-on ids. Add-on prices are always looked up on the server.
- Coupons (`hostiggo_coupons`: percent or fixed, expiry, usage limit, minimum amount) exist in the backend (`validateCoupon`) ❌ but are **not exposed in any UI**.

### 7.5 Cancellation policies (`refund.ts`, `policyTimeline.ts`)

Measured from **check-in = first day at the listing's check-in time, IST** (default 2 PM). Percentages apply to the **refundable base = grand total − all GST − Hostiggo service fee**.

| Policy | Schedule |
|---|---|
| Flexible | 100% until 24 h before check-in, then 0% |
| Moderate (default) | 100% until 5 days before; 50% until 24 h before; then 0% |
| Strict | Host-set % (default 50%) until 7 days before; then 0% |

- Host cancels → 100% of what was paid.
- Payout already released → manual settlement.
- "Free cancellation" in search = Flexible or Moderate.

### 7.6 Booking status ids

`booking_status`: **1 pending · 2 confirmed · 3 cancelled**. Listing status: `lisiting_status` (sic) 1 active, 3 delisted.

### 7.7 Trust & safety rules

- Reviews: verified completed stay only, one per stay (§5.7).
- Chat moderation (§5.9). The host's phone and the exact address are only revealed after a booking is confirmed.
- Reviewer privacy: first name only; no contact details.
- Uploads require sign-in and go under the user's own folder (`avatars/<userId>`, `listings/uploads/<userId>`).

### 7.8 Formatting rules (`format.ts`)

- Money: `₹4,000` / `₹4,577.60` (Indian grouping; two decimals only when there are paise). PDFs use `Rs.` because their fonts lack ₹.
- Times: `2:00 PM`. Dates: `Fri, 25 Dec 2026`. Review dates: `March 2026`.
- Plurals: "1 Adult", "2 Children", "1 night".

---

## 8. Data model reference

Schema `hostiggo_testing_schema` (final). The tables the app touches, grouped:

| Domain | Tables |
|---|---|
| People | `users` (profile + privacy/notification flags), `host` (`host_uuid`, `user_id`, photo, about, verified), `login_events` |
| Listings | `listings`, `listing_media`, `listing_amenities`, `amenities`, `listing_addons`, `addons`, `listing_discounts`, `listing_house_rules`, `listing_safety_details`, `safety_features`, `listing_bedrooms`, `property_types`, `stay_types`, `locations` |
| Availability | `listing_calendar` (daily price / availability), `listing_ical_feeds`, `calendars`, `calendar_events` |
| Bookings & money | `bookings` (amount_paise, invoice jsonb, invoice_number, razorpay ids, refund, transfer, settlement, utr), `booking_addons`, `booking_status`, `manual_settlement_flags`, `razorpay_webhook_events`, `hostiggo_coupons`, `pricing_rules` |
| Payouts & KYC | `host_payout_methods`, `host_bank_details`, `payouts`, `payout_items`, `kyc_requests`, `pan_verifications`, `passport_verifications`, `bank_verifications`, `aadhaar_kyc` |
| Social | `review` (note: `reviewd_at`), `wishlists` (PK user + listing + category), `categories` (named lists), `chat_messages`, `chat_moderation` |
| Notifications | `notifications`, `notification_templates`, `notification_preferences` (`channels` {in_app, push, email, whatsapp, sms}, `categories` {bookings, account, marketing}), `message_log` (WhatsApp) |
| Imports | `listing_imports`, `import_batches`, `external_taxonomy_map` |
| Ops | `feedback` (type enum: report_issue / suggest_improvement / share_experience; category enum: bookings, payments_payouts, referral_program, listing_management, account_security, app_performance, others), `admin_alerts` |

Column quirks to respect: `lisiting_status`, `reviewd_at`, `nom_guests`, `payment_gatway_id`.

---

## 9. API catalogue

Auth: **user** = `Authorization: Bearer <Supabase access token>` required (401 without it, 403 if a supplied userId differs). **public** = no auth. **sig** = verified by signature. **secret** = server-to-server bearer secret.
Error shape everywhere: `{ "error": string, "code"?: string }`. Success: `{ "data": … }`. The exception is `/api/search`, which returns `{data, cursor, hasMore, totalCount, stateBounds}` at the top level.

### Auth & account
| Endpoint | Methods | Auth | Notes |
|---|---|---|---|
| `/api/auth/otp` | POST | public (rate-limited) | `{action:"send"\|"verify", phone\|email, token}` |
| `/api/auth/log-login` | POST | user | `{method}` |
| `/api/auth/login-events` | GET | user | last 20 |
| `/api/users` | GET, POST, PATCH | user | GET own profile; POST onboarding upsert; PATCH `update-profile` / `deactivate-account` |
| `/api/user/phone` | GET, POST | user | contact phone only (never the auth phone) |
| `/api/account/upload-photo` | POST | user | multipart `file` → `{url}` |
| `/api/notifications` | GET, PATCH | user | |
| `/api/notification-preferences` | GET, POST | user | shared with the app |
| `/api/kyc/status` | GET | user | |
| `/api/verify/{pan,aadhaar,passport,bank}` | POST | user | SurePass |
| `/api/feedback` | POST | public (rate-limited; attributed if signed in) | enums validated |

### Discovery (public)
| Endpoint | Methods | Notes |
|---|---|---|
| `/api/search` | POST | §5.1 |
| `/api/locations` | GET | `?q=` / `?popular=1&limit=` |
| `/api/hotels` | GET | teasers / `?ids=1,2,3` |
| `/api/hotels/:id` | GET | full listing incl. host, enriched reviews, rules, safety, add-ons, discounts |
| `/api/amenities`, `/api/addons`, `/api/room-types` | GET | catalogues |
| `/api/calendar` | GET | public availability (no guest data) |
| `/api/bookings/check-availability` | GET | |
| `/api/billing/preview` | GET | invoice preview |
| `/sitemap.xml` | GET | static pages + live listings |

### Bookings & payments
| Endpoint | Methods | Auth | Notes |
|---|---|---|---|
| `/api/bookings/reserve` | POST | user | §5.3 (503 `BOOKINGS_PAUSED`) |
| `/api/bookings/confirm-payment` | POST | sig (Razorpay HMAC) | 502 `CONFIRMATION_PENDING` = paid, still finalizing |
| `/api/bookings` | GET, PATCH | user | GET guest/host lists; PATCH `dates` / `guests` / `review` |
| `/api/bookings/details` | GET | user | guest or host only |
| `/api/bookings/refund-preview` | GET | user | |
| `/api/bookings/cancel-with-refund` | POST | user | |
| `/api/bookings/cancel` | POST | user | |
| `/api/reviews` | POST | user | §5.7 |
| `/api/wishlist` | GET, POST, PATCH, DELETE | user | §5.8 |
| `/api/chat` | GET, POST, DELETE | user (GET `?hostUuid` public) | §5.9 |

### Host
| Endpoint | Methods | Auth |
|---|---|---|
| `/api/host/profile`, `/api/host/profile-info` | POST/PATCH, GET | user |
| `/api/host/listings` | GET, POST | user |
| `/api/host/listings/:id` | GET | public |
| `/api/host/listings/update`, `/toggle` | PATCH | user (owner) |
| `/api/host/listings/:id/{photos,cover,amenities,addons,discounts,house-rules,safety-details,delist}` | various | user (owner) |
| `/api/host/upload` | POST | user |
| `/api/host/calendar`, `/calendar/register`, `/calendar/status` | GET/PATCH, POST, GET | user (owner) |
| `/api/host/reviews` | GET | user |
| `/api/host/payment-history` | GET | user |
| `/api/host/payout-methods` | GET, PATCH | user |
| `/api/host/create-linked-account` | POST | user |
| `/api/host/onboarding-status` | GET | user |
| `/api/host/ai-import/jobs`, `/jobs/:id`, `/rehost-photos` | POST, GET, POST | user |

### Server-to-server
| Endpoint | Auth | Purpose |
|---|---|---|
| `/api/webhooks/razorpay` | sig | `payment.captured` (finalize booking), `payment.failed`, `transfer.processed`, `settlement.processed`; every event logged idempotently |
| `/api/webhooks/twilio`, `/twilio-status` | sig | WhatsApp delivery status → `message_log` |
| `/api/cron/retry-whatsapp` | secret (`CRON_SECRET`) | retry transient WhatsApp failures |
| `/api/test/whatsapp` | secret | manual template send |
| `/api/admin/message-log` | secret (`ADMIN_SECRET`) | WhatsApp log viewer |
| `/api/dev/demo-session` | dev only (404 in production) | demo host session |

---

## 10. Integrations & configuration

| Service | Used for | Env | Status |
|---|---|---|---|
| Supabase | DB, Auth (phone/email OTP, Google), Storage (`homestay photos`), Realtime | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | ✅ |
| Razorpay | Checkout, refunds, Route payouts, webhooks | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_ACCOUNT_NUMBER`, `NEXT_PUBLIC_PAYMENTS_ENABLED=true` | ⚠️ |
| Twilio WhatsApp | Booking templates (guest and host), delivery status | `TWILIO_*`, template SIDs | ⚠️ (Meta 63112 "account disabled" was seen) |
| Expo push | Device notifications for the app | `EXPO_ACCESS_TOKEN`; tokens in auth `user_metadata.expo_push_tokens` | ⚠️ |
| SurePass | PAN / Aadhaar / passport / bank KYC | `SUREPASS_API_KEY`, `SUREPASS_BASE_URL` | ⚠️ |
| Google Maps | Maps, Places, Geocoding | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | ⚠️ |
| AI-lister (Railway) | Listing import | `AI_LISTER_URL` | ⚠️ |
| iCal service (Railway) | Calendar sync | `NEXT_PUBLIC_ICAL_SERVICE_URL` | ⚠️ |
| Go search service | Optional search proxy | `SEARCH_SERVICE_URL` (leave unset) | ❌ down in Sept 2026; not used by default |

Booking switches: `NEXT_PUBLIC_BOOKINGS_DISABLED` (freeze), `NEXT_PUBLIC_PAYMENTS_ENABLED` (live checkout), `NEXT_PUBLIC_ALLOW_UNPAID_BOOKINGS` (**staging only**).

Security headers on every response: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, HSTS, `Permissions-Policy` (geolocation and payment allowed for self). The `X-Powered-By` header is removed. A CSP is ❌ not yet added (it needs a report-only rollout for Maps and Razorpay).

---

## 11. Notifications contract (shared with the app)

`src/lib/notificationRules.ts` **must stay in step** with the app's `hostiggo-frontend/src/shared/notifications/deviceNotifications.ts` and `notificationRouting.ts`. Both read the same `notifications` rows over the same Realtime channel.

**Row:** `{id, user_id, template_id, title, message, type, metadata (snake_case), is_read, created_at}`

| `type` | Tier | Hidden for | Web route | App route (equivalent) |
|---|---|---|---|---|
| `booking_guest` | important (toast) | 0 | `/booking-confirmation/:booking_id`, else `/my-memories` | Booking detail / Trips |
| `booking_host` | important | 0 | `/host/bookings/details?id=:booking_id` | Host booking detail |
| `host_onboarding` | general | 120 s **and** until its listing is live | `/host/listings` | Host listings |
| `wishlist_nudge` | general | 1 h | `/property/:listing_id`, else `/wishlist` | Property / wishlist |
| legacy `bookings` | important | 0 | by `metadata.role` | — |
| legacy `account` | general | 120 s | `/host/earnings` | Earnings |

- Important = `booking*`, `pay*`, `payment`, `payout`, `refund`.
- Metadata ids accept legacy camelCase keys (`bookingId`, `listingId`).
- **Dedup:** server `notify()` skips a second row with the same `template_id` for the same booking.
- Templates used: `booking_cancelled_guest`, `booking_cancelled_host`, plus the WhatsApp `booking_confirmation_guest` and `booking_received_host`.
- Channels honour `notification_preferences` (in_app, push, email, whatsapp) and category toggles (bookings, account, marketing).
- Push: the app registers its Expo token into `user_metadata.expo_push_tokens`. The server drops `DeviceNotRegistered` tokens automatically.

---

## 12. Status matrix

### Working (verified) ✅
Home, search, property and reviews pages render · in-app search on live data (40 Bhopal stays, sorted correctly) · location autocomplete · server-side pricing, invoice, payout and refund maths (unit-tested) · wishlists · My Trips · notifications · onboarding · account settings · help, FAQ and legal · host wizard steps · host dashboard pages · delisting · all private APIs enforce auth (smoke-tested) · sitemap · security headers.

### Fixed in this pass 🔧 (QA ids)
| Area | Items |
|---|---|
| Security | BUG‑001, 002, 003 (token identity on every route), 006 (open redirect), 014 (rate limits), 016 (token refresh), 025 (400 not 500), TC158 (fake session), unauthenticated uploads, cover-photo ownership, priced add-on injection endpoint removed, `/api/user/phone` no longer changes the auth phone |
| Money | OBS‑01 (server kill switch), free-booking hole, BUG‑013, BUG‑015, OBS‑04 (IST), refund cutoff timing, BUG‑022 (two decimals), real wizard earnings preview |
| Fake data | BUG‑004 (confirmation page), BUG‑005 (reviews), stock avatars, "promotional placeholder" box, "Hosting since {this year}", UX‑09 example label |
| Search | Live search outage (proxy now opt-in), BUG‑008, 009, 010, 020, amenity label mismatches, filter-tag removal, UX‑03 grammar |
| Dropdown report | E1 width, E2 Escape, E3 viewport fit, E4 location errors, E5 accessibility |
| Forms | BUG‑017 (profile), BUG‑019 (wizard bounds and time pickers), BUG‑026 (Indian mobiles), UX‑07 (superseded: no passwords), UX‑10 |
| Auth UX | BUG‑007 (mobile clipping), BUG‑018 (superseded: password sign-in removed, passwordless only), BUG‑024 (URL), UX‑02 (single "Sign in or sign up"), UX‑04 (toast stacking), UX‑06 (CTA wording) |
| Misc | BUG‑011 (KYC save), BUG‑021 (reviews overflow), BUG‑023 (settings rows), BUG‑027 (accessible names), BUG‑028 (in-app report), BUG‑029 (real 404), UX‑05, UX‑08, UX‑12, referral feedback enum, OBS‑03 headers, F121 sitemap and per-listing titles |

### Implemented but unverified ⚠️
Razorpay checkout, refund and Route transfers end-to-end · webhooks against real Razorpay · OTP SMS and email delivery · Google OAuth · WhatsApp delivery · Expo push · SurePass KYC · AI import · iCal sync · Google Maps views · real-device layout at 320–414 px and in Safari.

### Known gaps ❌
| Gap | Impact | Suggested fix |
|---|---|---|
| **Changing booking dates doesn't re-price** | A guest can lengthen a paid stay without paying the difference | Price the change; collect the difference via Razorpay or refund it; or restrict changes to the same or fewer nights |
| Coupons exist in the backend but have no UI | Unused promo capability | Add a coupon field at checkout (server already validates) |
| No CSP header | Defence in depth | Report-only CSP for Maps, Razorpay and Supabase, then enforce |
| Rate limiter is per server instance | Weaker on serverless | Move to Redis / Upstash or Supabase-backed counters |
| Host response rate and time | Not in schema; hidden rather than faked | — (schema is final) |
| i18n and multi-currency | Removed; English + INR only | Revisit with real translations and FX if expanding abroad |
| Bed-type filters, couple/family-friendly | No data | — (schema is final) |
| ~100 ESLint warnings | Mostly hook-dependency hints | Clean up incrementally |

---

## 13. React Native app requirements

### 13.1 Must-have parity (MVP)

**Guest:**
- Sign-in with phone OTP, email OTP and Google (no passwords)
- Onboarding
- Home with the destination search (recents, suggestions, current location)
- Search results with filters and sorting
- Property page with gallery, availability and price breakdown
- Booking and Razorpay payment
- Confirmation with receipt and add-to-calendar
- My Trips: manage, cancel with refund preview, review
- Wishlists with named lists
- Chat with moderation messages
- Notifications inbox and push
- Account profile and settings, login activity, verification
- Support and report an issue
- Help and legal (webviews acceptable)

**Host:**
- Listing wizard: the 13 steps, plus camera and gallery uploads
- AI import
- Listing management (photos, cover, amenities, add-ons, discounts, rules, safety, pause, delist)
- Calendar day editing and iCal
- Bookings (today, upcoming, past), details, host cancel
- Earnings with statement
- Payout setup (PAN → bank → Route status)
- KYC
- Host reviews and chat

### 13.2 Platform rules (how the app must be built)

1. **Use the website's `/api/*` as the backend.** Send `Authorization: Bearer <access_token>` on every call. On 401, call `supabase.auth.refreshSession()` once and retry; if that fails, sign out. Never send or trust a `userId` for identity.
2. **Store tokens in `expo-secure-store`**, not AsyncStorage. Use the Supabase client with `autoRefreshToken: true` and a SecureStore-backed storage adapter.
3. **Payments:** use `react-native-razorpay` with the **same** `reserve` → checkout → `confirm-payment` sequence (§5.3):
   - Treat a payment-SDK init failure as "couldn't open payment".
   - After a successful payment, **never show Pay again**. Retry confirm three times, then show "Payment received, don't pay again" and route to Trips.
   - Handle 503 `BOOKINGS_PAUSED` and 502 `CONFIRMATION_PENDING`.
4. **Show `BOOKINGS_OPEN` before date selection.** Drive it from a config endpoint or the same env values; don't hardcode it.
5. **Dates:**
   - Send `YYYY-MM-DD` built from local calendar parts (never `toISOString()` on a local date).
   - Compute "today" in IST.
   - Render refund deadlines with `cancellationTimeline()` (port or share `policyTimeline.ts`).
6. **Money:** use the integer-paise maths from `src/lib/billing/*`. Display with `formatINR` rules (two decimals only when there are paise). Never compute charges client-side for anything beyond a preview.
7. **Shared pure modules to reuse verbatim** (no I/O, already unit-tested): `billing/invoice.ts`, `billing/payout.ts`, `billing/refund.ts`, `billing/policyTimeline.ts`, `billing/reconstructInvoice.ts`, `billing/settlement.ts`, `format.ts`, `notificationRules.ts`, `chatModeration.ts` (client-side pre-check only; the server stays authoritative), `utils.safeRedirect` (for deep-link params).
8. **Deep links** (universal links on `hostiggo.com`, plus a `hostiggo://` scheme):

   | Web path | App screen |
   |---|---|
   | `/property/:id` | Property |
   | `/property/:id/reviews` | Reviews |
   | `/search?destination&checkIn&checkOut&adults&children&sort` | Search with the same params |
   | `/booking-confirmation/:id` | Booking detail |
   | `/my-memories?manage=:id` | Trips → manage sheet |
   | `/chat?hostId=:hostUuid` | Chat thread |
   | `/host/bookings/details?id=:id` | Host booking detail |
   | `/wishlist`, `/notifications`, `/account/*`, `/host/*` | Matching screens |
   | `/report-issue?booking=:id` | Report issue, prefilled |
   | `/auth/callback` | OAuth return |

9. **Push:** register the Expo token into `user_metadata.expo_push_tokens`. Route taps using the §11 table. Respect `notification_preferences`.
10. **Realtime:** subscribe to `chat_messages` with two filters (`user_id=eq.me` and `host_id=eq.me`; Realtime doesn't support `or`). Subscribe to `notifications` for the user. Unsubscribe on sign-out and on background where appropriate.
11. **Uploads:** multipart `file` (JPG/PNG/WEBP ≤8 MB). Compress on device before upload (target ≤2 MB, longest side 2048 px). Show per-photo progress and retry.
12. **Maps:** `react-native-maps` (Google provider). Request location only when the user taps "near me" and handle denial with a message (the same rules as dropdown fix E4).
13. **States on every screen:** loading skeleton, empty, error with retry, signed-out gate. **Never sample or fake data.** Use initials avatars, never stock faces.
14. **Accessibility:** every icon button has `accessibilityLabel`; minimum tap target 44×44; supports dynamic type; screen-reader order matches the visual order.
15. **Validation mirrors the server:** Indian mobile `^[6-9]\d{9}$`, name 2–80, age 18–120, price ₹100–₹5,00,000, discounts 1–90%, guests 1–50, title ≤50 (wizard), description ≤500 (wizard). Always also display the server's error message.
16. **Offline:** cache last-seen trips, wishlist and inbox for read-only offline use. Queue nothing that moves money.

### 13.3 "Better than Airbnb" requirements for the app

- All-in price everywhere (cards, map pins, totals). No surprise fees at checkout.
- A dated refund schedule on the booking screen, plus a reminder push 24 h before each cutoff (uses `cancellationTimeline`).
- Trip timeline: check-in reminder, directions, host contact unlocked after payment, check-out reminder, review prompt after check-out (eligibility already enforced on the server).
- WhatsApp and push parity, with per-channel opt-outs.
- Host: earnings preview while pricing; a payout tracker (transfer → settlement → UTR); AI import from a pasted link; iCal sync to avoid double bookings.
- Trust: verified-stay reviews only; moderated chat; KYC badge.

---

## 14. Acceptance checklist for the app

Each item must pass on iOS and Android, on a small phone (360 × 640) and a large one.

**Auth**
- [ ] Phone OTP rejects `1234567890` and 5-digit numbers; double-tap sends one OTP
- [ ] OTP verify installs the session; killing and relaunching the app stays signed in
- [ ] Token expiry (wait more than 1 h) → API calls refresh silently; no sign-out mid-task
- [ ] No password field, set-password or forgot-password screen exists anywhere
- [ ] A 429 shows "Too many attempts" with no crash

**Search**
- [ ] Destination search: recents, suggestions, current location (allowed, denied, unsupported)
- [ ] Price high-to-low puts the most expensive of **all** results first
- [ ] Every visible filter changes the results; an API failure shows error and retry
- [ ] A deep link with dates and guests restores them

**Booking**
- [ ] Bookings paused: the notice appears before date selection; reserve returns 503 and is handled
- [ ] The price breakdown equals the server invoice to the paisa
- [ ] Payment success → confirmation screen with real data, receipt and calendar export
- [ ] Payment success but confirm fails → no Pay button; "don't pay again"; booking appears after the webhook
- [ ] Payment SDK fails to load → explicit message
- [ ] Cancel: the refund preview matches the dated schedule; the refund amount matches
- [ ] Review allowed only after check-out; a second review for the same stay is rejected

**Social**
- [ ] Wishlist: add to several lists, rename, delete; signed-out heart → sign in → back to the same screen
- [ ] Chat: a message with a phone number, email, UPI id or WhatsApp link is blocked with an explanation and the text is kept
- [ ] A notification tap routes per §11; the important tier shows immediately, general after its delay

**Host**
- [ ] Wizard rejects price <₹100 or >₹5,00,000, discount 0% or >90%, guests >50; time pickers only
- [ ] Publish creates a listing visible in search (when active)
- [ ] A photo upload over 8 MB or not JPG/PNG/WEBP is rejected with a message
- [ ] Calendar block makes those dates unavailable in search and booking
- [ ] Delist request: the listing stays live until it's 24 h old and there are no pending stays
- [ ] PAN → bank → payout status reaches "active" (staging keys)
- [ ] A host cancel refunds the guest 100%

**Security**
- [ ] No request contains a client-chosen identity; a proxy capture shows `Authorization: Bearer` on private calls
- [ ] Tokens are not stored in AsyncStorage
- [ ] Deep-link `redirect` params pointing off-domain are ignored

---

## 15. Open product decisions

1. **Booking modifications:** should date changes be re-priced and charged or refunded, restricted, or turned into a request to the host? (Today: availability-checked, **not re-priced**.)
2. **Coupons:** launch the existing coupon engine at checkout?
3. **Multi-currency and Hindi:** out of scope for now (INR/English). Revisit with real FX and translations.
4. **Instant book vs request to book:** `listings.booking_mode` exists. All bookings are currently instant once paid.
5. **Search service:** keep in-app search (works) or fix and re-enable the Go service via `SEARCH_SERVICE_URL`?
6. **Rate limiting at scale:** move to a shared store (Redis/Upstash) before marketing pushes.
7. **CSP rollout** timing.

---

*Generated from the codebase as of 2026‑10‑01. Endpoints, limits and rules above are taken from the source (`src/app/api/**`, `src/lib/billing/**`, `src/lib/*.ts`) and the verification run in §2. When the code changes, update this file in the same PR.*
