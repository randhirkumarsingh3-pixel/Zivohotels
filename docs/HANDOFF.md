# Handoff: state of the ZivoHotels project (13 Nov 2026)

Written at the end of a long cloud session so a new session (running on the owner's Mac via
Remote Control) can continue without the earlier conversation. Read this first, then
`docs/GO_LIVE_CHECKLIST.md` and `backend/docs/database-migrations.md`.

## The project
Hotel booking platform:
- **Frontend:** React 18 + Vite 6 + Tailwind in `src/` (customer site, `/admin`, `/extranet`
  owner portal).
- **Backend:** Express + Prisma 5 + PostgreSQL in `backend/`.
- **Payments:** Razorpay. **Email:** Resend. **Files:** Google Cloud Storage or local disk.

## Git and pull requests
- **Merged:** [#1](https://github.com/randhirkumarsingh3-pixel/Zivohotels/pull/1) (security,
  correctness, CI, migrations, dependencies) and
  [#2](https://github.com/randhirkumarsingh3-pixel/Zivohotels/pull/2) (KYC upload, extranet fix).
- **Not merged yet, on branch `claude/lucid-newton-k8kr0z`:**
  - `13c51e7`: go-live checklist and `backend/scripts/createAdmin.js`
  - `e71f47c`: hide internal error details in production responses, and backend unit tests
  - this handoff note

  Open a pull request into `main` for these when the owner asks.
- **The repo owner merges PRs within minutes,** and GitHub Actions has **never run** on this
  repository, so nothing checks a PR automatically. Run the checks below locally before every push.
- **Don't push to `main` directly.** Work on a branch and open a PR only when asked.

## Local setup on the owner's Mac
- **Machine:** macOS 12 (Intel), Node 24, npm 11. The project is in `~/Documents/Zivohotels`.
- **Database:** Postgres.app (PostgreSQL 18) on `localhost:5432`, database `zivohotels`, user `randhir`,
  no password. Built with `db push` and then baselined, so it is now on migrations. Change the schema
  with `npx prisma migrate dev --name ...`.
- **`backend/.env`:**
  - `DATABASE_URL` and `DIRECT_URL` point to the local database.
  - `GOOGLE_APPLICATION_CREDENTIALS` should be **commented out**, so uploads stay on disk. Check the log
    says `LocalDiskProvider`.
  - The old cloud settings are in `backend/.env.cloud-backup` (git-ignored).
  - All available settings are documented in `backend/.env.example`.
- **Frontend `.env.local`:** `VITE_API_URL=http://localhost:5000/api/v1`
- **Run** (one terminal each; the backend restarts on file changes):
  ```bash
  cd backend && npm run dev     # API on :5000
  npm run dev                   # web on :5173 (from the repo root)
  ```
- **Fresh local data** (deletes everything; only works against localhost):
  `cd backend && npm run db:seed && node scripts/setup_trgm.js`.
  Destination search needs `setup_trgm.js`.
- **Test logins:**

  | Role | Email | Password |
  |---|---|---|
  | Admin | admin@zivohotels.com | admin123 |
  | Owner (extranet, at `/extranet/login`) | extranet@zivotechretreat.com | ZivoExtranet@2026 |
  | Customer | user@zivohotels.com | customer123 |

## Checks to run before pushing
```bash
npm run lint                        # 0 errors; at most 14 warnings (all react-hooks/exhaustive-deps)
npx vitest run                      # 10 frontend tests
npm run build
cd backend && npm run test:unit     # mocha unit tests
npm run test:smoke -- --url=http://localhost:5000   # needs the API running; 4 passing
```

## Conventions and decisions already made
- **Unused variables:** prefix with `_`. In destructuring use `name: _name`, so a `...rest` spread
  still excludes the field.
- **Public hotel visibility:** `backend/constants/hotelStatus.js` defines `PUBLIC_HOTEL_STATUSES = ['LIVE','ACTIVE']`.
  The go-live flow sets `LIVE`. Use the constant for anything public-facing.
- **`backend/middleware/responseFormatter.js`:**
  - wraps every JSON response
  - keeps arrays as arrays
  - in production, hides 5xx details and DB/Prisma internals (requestId is kept)

  Unit tests are in `backend/tests/unit/`.
- **`backend/config/env.js`** is the first import in `server.js`. The server refuses to start without
  `DATABASE_URL`, `JWT_SECRET` and the Razorpay keys.
- **KYC documents:**
  - `POST /api/v1/kyc/:hotelId/upload` takes a base64 data URL. PDF, JPG or PNG, checked by the file's
    leading bytes; max 10 MB.
  - Files are stored privately (`backend/services/kycStorage.js`): locally in `backend/private_uploads/`,
    in the cloud in `GCS_KYC_BUCKET`.
  - They are read only through `GET /api/v1/kyc/documents/:id/file`, by an admin or the hotel's owner.
  - The frontend helpers are in `src/services/kycApi.js`. The Documents step is step 8 in both wizards.
- **Extranet scope:** `hotelScopeGuard` lets an admin act on a hotel only when a `hotelId` is
  given. Without one, admins get 403, which the frontend handles by redirecting to onboarding.
- **Rate limits:** login counts only POSTs; the booking/payment limit is 5 per minute per IP; the
  Razorpay webhook is never limited.
- **First production admin:** `backend/scripts/createAdmin.js`. Never seed production.
- **Seed safety:** `prisma/seed.js` wipes data and refuses anything but localhost.

## Production and cloud status
- **Project:** Google Cloud `zivohotels-500807`, region `asia-south1`, Cloud Run service `zivohotels-api`
  (last deployed July 2026).
- **Billing is closed,** so nothing can be created or run. The cloud data is test data only.
- **The owner decided to finish everything locally first,** then follow `docs/GO_LIVE_CHECKLIST.md`.

## Next tasks (agreed order; ask the owner where a decision is marked)
1. ~~Approval rules~~ **Done:** the owner decided bank details and KYC are both required.
   `backend/services/propertyReadiness.js` is used by all three submit/approve endpoints. Submitting
   needs complete bank details plus PAN, cancelled cheque and (if there's a GSTIN) GST certificate
   uploaded and not rejected; approving needs those documents VERIFIED.
2. ~~Money as exact decimals~~ **Done:** 24 money columns (bookings, refunds, rate plans, occupancy
   pricing, coupons, tax thresholds, loyalty wallet) are `Decimal(12,2)`. `config/db.js` hands them to
   the app as plain numbers (list in `constants/moneyFields.js`), so the API and frontend are unchanged.
   `_sum` aggregates and `$queryRaw` still return `Prisma.Decimal`: wrap them with `toMoney()` /
   `moneyFieldsToNumbers()` from `utils/money.js`, and round computed amounts with `roundMoney()`.
3. **Login token:** currently in `localStorage` (`src/context/AuthContext.jsx`, `src/services/api.js`);
   move to an httpOnly cookie with CSRF protection.
4. **Promotions (decision needed):** `createPromotion` says "success" but saves nothing. Should
   promotions apply discounts, or just be stored and listed?
5. **Smaller items:**
   - react-router 6 → 7 (moderate advisory)
   - review the 14 hook-dependency warnings one by one (the ESLint config warns that mechanical fixes
     can cause infinite loops)
   - `backend/seed_automation_user.js` is broken (it uses `require` in an ES module); delete or fix it

## Booking pricing (decided and fixed)
- **Customers pay the price they were shown.** The owner chose this: booking uses the same pricing as
  the checkout preview and the hotel page (rate plan price, no dynamic surcharges). Dynamic pricing
  (`domains/dynamicPricingDomain.js`) is off at booking. If it's brought back, apply it to search,
  hotel page and preview at the same time. Its low-inventory rule uses the hotel's total rooms, not
  the rooms actually free, so fix that first.
- Bookings now save `baseAmount`, `taxAmount` and the charge breakdown (discounts in `metadata`), so
  invoices show the real GST. Settlements record that GST instead of a flat 12%.

## Hotel settlements and payouts (owner decisions, implemented)
- **Created at check-out**, not at booking (`settlementService.createForCheckout`, called from
  `bookingStateMachine` when a booking becomes COMPLETED). Cancelled or unpaid bookings never become
  money owed to a hotel.
- **Commission = the hotel's agreed rate** (`Agreement.commissionRate`, else
  `Hotel.dynamicCommissionRate`, else 15%) **x the pre-GST amount** (`booking.baseAmount`).
- **netPayable = collected online (paid - refunded) - commission.** Pay-at-hotel stays are negative:
  the hotel owes the commission, and it's netted against later payouts (`processPayout` refuses to pay
  out a zero or negative total).
- **Paid on the hotel's payout cycle after check-out** (`nextPayoutDate`): Weekly = next Wednesday,
  "15 days" = next 1st/16th, Monthly = 1st of next month, `T+N` = N days later. Stored in
  `Settlement.holdUntil`; the finance worker marks due settlements READY hourly.
- **Booking statuses:** `CHECKED_IN` and `NO_SHOW` were added; `COMPLETED` is the checked-out state
  (the extranet's "Check out" sends `CHECKED_OUT`, an alias). Revenue/booking counts use
  `constants/bookingStatus.js`.

## Cancellations, no-shows and deductions (owner decisions, implemented)
- **Cancellation policy:** each property's choice at onboarding (free until check-in / 24h / 48h /
  72h before, or non-refundable) is now saved in `CancellationPolicy.policyCode` and used for guest
  refunds (`utils/refundCalculator.js`). No saved policy = free until 24h before.
- **One cancel path** (`services/cancellationService.js`) for the customer endpoint, the extranet and
  admin status changes:
  - guest cancels -> refund per the property's policy; any amount kept becomes a `CANCELLATION`
    settlement for the hotel;
  - hotel or admin cancels -> the guest gets everything paid back (the hotel hasn't been paid; payouts
    follow check-out) and the owner is notified in-app and by email that the refund is being made.
- **No-show:** what was paid online is kept and becomes a `NO_SHOW` settlement.
- **Deductions on every settlement** (`constants/finance.js`): GST 18% on commission (CGST 9% +
  SGST 9% when ZivoHotels and the hotel are in the same state, else IGST 18%; set `ZIVO_GSTIN`),
  TCS 0.5% of the pre-GST value collected online (GST-registered hotels only), TDS 0.1% (194-O) of
  the pre-GST value. netPayable = collected online - commission - GST on it - TCS - TDS.
- **Commission is admin-only:** owners could previously set their own rate through the API.
- **Owners can enter legal and bank details while onboarding** (draft / information requested); they
  lock once submitted. Before, the form locked them for owners, so owners could never submit.

## End-to-end review (Nov 2026)
The whole flow was driven in a real browser: owner onboarding (8 steps) -> submit -> admin review,
KYC verification, approval -> owner signs agreement -> admin go-live -> customer search, hotel page,
checkout, pay-at-hotel booking, My Bookings, cancellation -> owner check-in / check-out ->
settlement. Fixed along the way:
- **Blockers:** owner submission always failed with a false "modified by another user" conflict;
  signing the agreement returned a 500; search only matched status ACTIVE, so no hotel taken live
  (LIVE) ever appeared; guests could not choose December dates on the home page (calendar behind
  the destination cards) and picking a new check-in silently booked a stay from today.
- **Data leaks (no login needed):** `GET /hotels/:id` returned the hotel's bank account, PAN,
  agreement and owner contact; `GET /hotels` returned PAN, GSTIN, owner/manager contacts,
  commission and credit score of every live hotel; search returned commission rates. Public
  responses now use an allow list (`PUBLIC_HOTEL_FIELDS`); admins and the owner get the full record.
  `PUT /extranet/property` is an allow list too (it let owners change PAN, payout cycle, compliance).
- **Wizard:** progress survives reloads and is saved to the server at every step; the cancellation
  policy row is clickable; the fake document upload in step 7 is gone (step 8 is the real one);
  year selects store what they show; the admin wizard has its own storage keys.
- **Payments:** a Razorpay error (e.g. bad keys) no longer logs the guest out (401 passed through);
  non-GET requests aren't auto-retried; a booking whose payment can't start is released; unpaid
  bookings expire automatically every 5 minutes (`services/bookingExpiryService.js`).
- **Honest UI:** no invented "was" prices, no hard-coded pool/gym amenities, real meal plan,
  cancellation terms on the hotel page, a refund preview that follows the property's policy
  (`GET /bookings/:id/cancel-preview`), real property status on the owner dashboard.
- **Rules:** owners can't mark check-in / check-out / no-show before the check-in date (admins can).

### Checkout and vouchers (Nov 2026)
- **Guest details:** logged-in users pick "I'm the guest" (filled from `GET /auth/me`, now profile
  fields only) or "Someone else". Optional **company name / GSTIN / address** are stored on the
  booking (`guestCompany*`), validated (GSTIN format) and used on the invoice and vouchers.
- **Back to the hotel** from checkout keeps the dates and the chosen room / rate plan.
- **Photos:** hotel page and checkout use the hotel's `media` (they read non-existent fields and
  showed stock or broken images).
- **Vouchers:** `GET /bookings/:id/voucher?type=guest|hotelier` renders a PDF
  (`services/voucherService.js`). Guest voucher: stay, price, payment, cancellation deadline,
  company billing. Hotelier voucher (owner/admin only): night-wise breakup and the settlement
  calculation (commission, GST on commission, TCS, TDS, payable), provisional until check-out.
  Download from the confirmation screen, My Bookings and the extranet bookings list.
  ZivoHotels' legal/support lines come from `ZIVO_*` settings (shown only when set).
- **PDFs on this Mac:** Puppeteer's bundled Chrome can't run on macOS 12, so `utils/browser.js`
  falls back to the installed Chrome (invoices failed locally before for the same reason).
- **Invoice:** shows the hotel's real GSTIN (it printed a made-up one), the true payment status, the
  discount, CGST/SGST split and the company as "Billed to"; user text is HTML-escaped.

### Rooms, rates & availability, channel managers (Nov 2026)
- **Inventory & Rates** (admin) and the extranet's Inventory & Rates page share
  `src/components/ari/AriCalendar.jsx`: per room type and day, rooms to sell / booked / available
  and **stop-sell**; per rate plan and day, the **price** (a `DailyRate`, else the base price).
  API: `GET /admin/ari/calendar`, `POST /admin/ari/inventory`, `POST /admin/ari/rates`
  (`services/ariService.js`; owners limited to their properties). Both pages used to be mocks.
- **Booking engine honours ARI:** pricing uses daily rates per night (`dailyRates` in
  `pricingDomain`), stop-sell nights are refused (preview, booking and under the inventory lock),
  search and the hotel page show the average nightly price for the dates and availability
  (`stayNightlyPrice`). A rate plan without a price can't be shown or booked.
- **Room Config:** prices are shown (every plan read "UNCONFIGURED ₹—"), room photos upload the file
  (they saved a browser-only `blob:` URL), the rate-plan form gets its room type.
- **Channel managers (ZivoHotels as the OTA):** Admin -> Channel Manager records per property
  whether ARI comes from the extranet or its channel manager (provider, property code, room/rate
  code mapping, API key, status). The channel manager uses `X-Api-Key` on
  `GET /channel-manager/property`, `POST /channel-manager/ari`, `GET /channel-manager/bookings`
  (`services/channelConnectivityService.js`; guide on the admin page). While ACTIVE it is the source
  of truth: owners can't edit ARI by hand. The old STAAH stub (fake data, fake booking push, broken
  webhook) was removed.

### Not covered / not fixed
- **Online payment wasn't completed end to end:** the local Razorpay keys in `backend/.env` are
  placeholders (Razorpay answers "Authentication failed"). Put real test keys in
  `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` and `VITE_RAZORPAY_KEY_ID`, then test a prepaid and a
  30% booking.
- The admin-creates-a-property-for-an-owner path wasn't walked through.
- New rooms get 60 days of inventory regardless of the date range the owner picks (bookings and
  search still work beyond that; the inventory calendar shows only 60 days).
- IFSC / PAN / GST "Verify" buttons in the wizard are simulated.
- The owner's bookings list shows abandoned checkouts as "cancelled"; the Live Ops Feed box covers
  the last row.
- Channel managers collect bookings by polling `GET /channel-manager/bookings`; pushing bookings to a
  specific channel manager's own API isn't built (each needs its partner spec and credentials).
- New rooms still get 60 days of inventory rows at creation; days without a row sell the physical
  count, so this doesn't limit sales.
- The results page search box shows the dates as "-".
- Search availability reads inventory by UTC date; on a server in IST (this Mac) booked rooms aren't
  subtracted. Production runs in UTC.

## Rooms, bulk ARI, dynamic pricing and promotions (Nov 2026)

- **Rooms & rate plans**: Extranet -> Rooms & Rate Plans and Admin -> Room Config share
  `src/components/rooms/RoomsManager.jsx` (API `/admin/rooms`, `/admin/rate-plans`; owners limited
  to their own properties). Room types can be switched off and on again. Changing the number of
  rooms updates future inventory (refused if bookings already hold more rooms on a date). Rate plan
  fields are validated (no mass assignment); a room keeps at least one plan on sale. The old
  extranet `PUT /extranet/rooms/:id` (saved the raw body) is removed.
- **Bulk update**: calendar button -> `POST /admin/ari/bulk` (several room types / rate plans, date
  range, weekdays; rooms to sell / all rooms, stop-sell, set price, change by %, reset). All or nothing.
- **Dynamic pricing** (`services/dynamicPricingService.js`): per-property rules (weekday, occupancy,
  last minute, early bird, date range) and limits, plus the admin holiday calendar. Results are saved
  as `DailyRate` rows with `source = 'DYNAMIC'` for the next N nights, so the shown price is the
  charged price. Manual and channel-manager rates are never overwritten; channel-managed properties
  are skipped. Recomputed hourly, after bookings/cancellations and on any rule change.
  Extranet -> Dynamic Pricing and Admin -> Pricing & RMS (the old mock page is gone). Platform
  SAFE_MODE and holidays are admin-only now (owners could set SAFE_MODE before).
- **Promotions** (`Promotion`, `PromotionRedemption`; `services/promotionService.js`,
  `domains/promotionDomain.js`): property offers (owner/admin) and Zivo platform offers (admin, all
  or chosen properties). Automatic (no code) offers show in search and on the hotel page with the
  discounted price; codes are entered at checkout (`promoCode`). One promotion per booking, the
  biggest the guest qualifies for; limits are re-checked under a row lock at booking. Stored on
  `booking.metadata.promotion`. `fundedBy = ZIVO`: commission, TCS and TDS on the full price and the
  discount is added to the hotel payout (ledger account `ZIVO_PROMOTIONS`); `HOTEL`: on the
  discounted price. Owners' promotions are always hotel-funded. The legacy `Coupon` table is unused.
- **TESTING ONLY, remove before going live**: `TEST_OTP=123456` in `backend/.env` makes every email
  OTP 123456 (ignored when `NODE_ENV=production`); the property wizard's mobile OTP is a fixed
  123456 in `BasicInfoStep.jsx` (no SMS provider yet).

## Guest hotel page (Nov 2026)

- `src/pages/Detail.jsx` with `src/components/hotel/` (PhotoGallery, HotelSections, galleryPhotos):
  photo grid + full-screen viewer (labelled by onboarding photo tags and room names), star category,
  highlights, section tabs, room cards with photo / size / beds / view / occupancy / room amenities,
  amenities grouped as in onboarding (`src/constants/amenities.js`, shared with the Amenities step),
  policies & house rules, meal prices and an OpenStreetMap location. Empty sections hide themselves.
- The Policies step's house rules (`policyRules`) and meal prices (`mealPrices`) were never sent or
  saved; they are now stored in `integrationSettings` and exposed to guests as `houseRules` /
  `mealPrices` through an allow list (`PUBLIC_HOUSE_RULES` in hotelController).

## Guest reviews (Nov 2026)

- Engine: `backend/services/reviewService.js`; API `controllers/reviewController.js`
  (`/reviews` guest, `/hotels/:id/reviews` public, `/extranet/reviews` hotel, `/admin/reviews` admin).
- Guest (My Bookings -> Rate & Review): one verified review per stay, from the day after check-in to
  90 days after check-out; rating, aspect ratings, tags, title, text, trip type, up to 5 photos
  (shrunk in the browser); editable for 48 hours; sees status, rejection reason and hotel reply.
- Automatic check: reviews with phone numbers, emails, links or abusive words are held (PENDING)
  for a moderator; others publish immediately (APPROVED). Hotel replies with those are refused.
- Hotel (Extranet -> Guest Reviews): score, aspect breakdown, reply rate, filters, public reply
  (guest emailed), edit/delete reply, report to Zivo with a reason. In-app notification on new reviews.
- Admin (Admin -> Guest Reviews): held / reported / published / not published queues; publish,
  don't publish (reason required, shown to the guest), keep a reported review, remove a reply.
- `Hotel.reviewScore` / `reviewCount` / `reviewAspects` are recomputed from published reviews on
  every change. `Hotel.rating` is the star category; `Hotel.reviews` holds old seed counts and is
  no longer shown. The review form's "Zivo Points" promises and the fake points balance were
  removed (no points system exists yet).

## Zivo Rewards loyalty program (Nov 2026)

- Service `backend/services/loyaltyService.js`; API `/loyalty` (program, me, history) and
  `/admin/loyalty` (stats, config, members, adjust). Guest page `/rewards`, Admin -> Loyalty.
- Ledger `LoyaltyPoint` (type EARN / REDEEM / BONUS / ADJUST, status PENDING / AVAILABLE /
  REVERSED / VOID); balance = sum of AVAILABLE. Settings in `LoyaltySetting` (defaults in code:
  1 point per ₹100 pre-GST, 1 point = ₹1, min 100 points, max 20% of the room price, review bonus
  50, tiers Blue / Silver 5 nights or ₹25k (1.25x) / Gold 15 nights or ₹75k (1.5x), 12 months).
- A booking records the points it earns as PENDING and any points used as REDEEM, inside the booking
  transaction (member lock against double spending). Completed -> earned points AVAILABLE;
  cancelled -> earned reversed and used points returned; no-show -> nothing earned. Settled
  immediately by status changes / cancellations and by a 5-minute reconcile job, which also gives
  points for customer stays that had none.
- Points used are a Zivo-funded discount: `metadata.loyalty.discountAmount` is added to
  `zivoFundedDiscount`, so commission and the hotel payout are on the full price. Shown on vouchers.
- Expiry: each batch of points expires `expiryMonths` (default 24, 0 = never) after it became
  usable (`availableAt`). Points are used oldest first (`allocateLots`), so the reconcile job adds
  an EXPIRE row for whatever is left of batches past expiry, and emails a reminder 30 days before
  (once per batch, `expiryNoticeAt`). The Rewards page shows points expiring in the next 60 days.
- Customer accounts only. Old LoyaltyPoint rows (awarded on booking creation, never reversed) are
  kept as VOID and not counted. The admin "Loyalty Program" tier-discount tab (never applied) now
  links to Admin -> Loyalty.

## Wallets (Nov 2026)

- Service `backend/services/finance/walletService.js`; API `/wallet` (guest), `/extranet/wallet`
  (hotel), `/admin/wallets` (overview, guests, adjust, hotel statements). Pages: `/wallet` (Zivo
  Cash), Extranet -> Wallet, Admin -> Wallet Control (the old page was sample data).
- Guest wallet "Zivo Cash" (`Wallet.userId`, `WalletTransaction` with category, booking link and
  balance after): closed-system credit, spendable only on ZivoHotels bookings (no top-up,
  withdrawal or transfer). Credits: refunds the guest CHOSE to take as Zivo Cash (never the
  default), Zivo Cash returned from uncompleted / cancelled bookings, admin credits with a reason.
- Paying: checkout "Pay with Zivo Cash" covers the amount due now (full, or the part payment).
  `Booking.walletAmount` holds it; if it covers everything the booking is confirmed without an
  online payment, otherwise only the rest is charged online (createOrder). Wallet rows are locked
  (FOR UPDATE) so a balance can't be spent twice.
- Cancelling: the Zivo Cash part of a refund goes back to the wallet; the rest to the original
  payment method or, if the guest chose it in the cancel dialog, to Zivo Cash (instant).
  Uncompleted bookings (expired, failed, admin refund) get their Zivo Cash back from a 5-minute job
  (`returnUnusedBookingPayments`).
- Hotel wallet: computed from settlements and payouts (on hold, ready, owed to Zivo for pay-at-hotel
  commission, paid out) with a running-balance statement and CSV download. No stored hotel money.
- Razorpay is not configured locally, so the "part wallet + online" path could only be checked up
  to the order amount; test it end to end with test keys.

## Membership (Nov 2026)

- Owner decisions: every signed-in guest account is a free Member; paid plans (default Zivo Prime,
  ₹999 / 365 days, GST inclusive) on top. Member room discounts are hotel opt-in (hotel-funded); a
  paid plan can add a Zivo-funded extra. Benefits: member price, extra Rewards points, member-only
  offers, longer free cancellation (Zivo pays the hotel's fee), priority support.
- Service `backend/services/membershipService.js`; models `MembershipPlan`, `Membership`,
  `Hotel.memberDiscountPercent`, `Promotion.audience` (ALL | MEMBERS | plan code). API
  `/membership` (plans, me, buy WALLET/ONLINE, verify), `/extranet/membership`, `/admin/membership`.
  Pages: `/membership`, Extranet -> Member Prices, Admin -> Membership.
- Wiring: pricing (`memberDiscountAmount`, after promotions, before points) in preview and booking;
  `booking.metadata.membership` snapshot; Zivo-funded part added to `zivoFundedDiscount` (hotel
  paid on its member price); Rewards earn x plan multiplier; promotions filtered by audience
  (hotel page shows member offers to those who can use them); cancellations use the snapshot's
  freeCancelExtraHours (refund as if cancelled earlier; the fee goes to the hotel via the same
  CANCELLATION settlement and is booked to ledger account ZIVO_MEMBERSHIP); hotel page / search show
  member prices; extranet bookings show paid members with priority support; vouchers show the
  member price line. Hourly job expires plans and emails a renewal reminder 7 days before.
- Plan fees are booked to ledger account MEMBERSHIP_REVENUE (GST inclusive): confirm GST invoicing
  for membership fees with the accountant. Online purchase needs Razorpay keys (not set locally).

## What's nearby (Nov 2026)
- Location step of the property wizard (admin onboarding, extranet onboarding and Edit Property) has a
  **What's nearby** editor: Transit, Attractions, Landmarks, Restaurants, each place with a type and the
  distance from the map pin. Guests see the visible ones on the hotel page (Location section, top 5 per
  group with "View all"). Distances only; no travel times.
- Data: `Hotel.nearbyPlaces` (JSON list) and `Hotel.nearbyAutoFilledAt`. Logic in
  `backend/services/nearbyPlacesService.js`; endpoints `POST /api/v1/hotels/nearby/suggest` and
  `/nearby/lookup` (admin/owner).
- Source is free OpenStreetMap search (Nominatim): about 22 searches around the pin, at most one per
  second across the whole server (their usage policy), so "Find nearby places" takes about 40 seconds.
  Owners can also search a place by name or type a name and distance. The Overpass API was tried
  first; its public servers were at capacity. For heavy use, host Nominatim or use a paid places API.
- Places with coordinates get their distance recomputed when the pin moves; typed ones keep the typed
  distance.
- Auto-fill: when a property with a pin has no nearby places (new or live), the server fills them once
  in the background and notifies the owner to review them (on save, and a job every 6 hours). Once
  the owner edits the list, it is never auto-filled again, even if they clear it.

## Brand theme and week-1 UI fixes (Nov 2026)
- Theme comes from the logo (`public/brand/zivo-mark.png`): navy `#013A67` for structure (header
  links, sidebars, hero and footer bands, selected states) and red `#E7194A` only for actions (Search,
  Book, Pay, Sign up, deal badges). Full 50–950 scales are in `tailwind.config.js` (`brand` = red,
  `navy`). Tailwind's `blue`/`indigo`/`sky` and `gray`/`slate` are remapped to the navy and a
  navy-tinted neutral scale, so older screens follow the brand without edits. Headings use Plus
  Jakarta Sans, body Inter.
- **Restart `npm run dev` after pulling**: a running Vite keeps the old Tailwind config cached.
- `src/components/brand/Logo.jsx` (`Logo`, `LogoMark`) is used in the guest header and footer, both
  sidebars, the logins and the property wizard. On dark backgrounds pass `onDark`: the mark sits on a
  white tile, because its white Z is open to the edge and would take the background colour.
  Favicons and the Apple touch icon are in `public/brand/`.
- Extranet and admin sidebars are navy, and below 1024px they become a slide-in drawer (menu button
  in the top bar). The Live Ops feed moved from a floating panel into the extranet bell menu.
- Admin home is `admin/pages/Dashboard.jsx` (live figures). Pages that still show sample data carry a
  "Preview with sample data" notice (`components/shared/SampleDataNotice.jsx`) and a Preview tag in
  the admin menu: Finance ledger and payouts, Fraud, Forecasting, Revenue per search, Reports,
  Experiments, System control, System health, Command center, and the extranet's Performance page.
  The hard-coded status strip, "Production" button and fake menu badges were removed.
- Extranet Finance shows real totals, next payout date and the payout account's last 4 digits
  (`bankAccount` on `GET /extranet/property`). Extranet Settings was a mock-up (a made-up owner,
  GSTIN and phone; nothing saved) and now shows the real account and property details read-only.
- The hotel page asks `POST /bookings/preview` (now optional login) for the price, so its total is
  the checkout total. The local estimate only shows while it loads.
- New `/help` page (cancellations, payments, Zivo Cash, contact). Footer links all go somewhere real.
- Neutral 400/500 were darkened, and red, amber, green and orange text moved one shade darker, so
  text meets WCAG AA contrast. No text is smaller than 12px (the 7–11px sizes became `text-xs`).

## Passwords, legal pages and UI roadmap (Nov 2026)
- Passwords (`controllers/passwordController.js`): `PUT /api/v1/auth/password` (signed in; signs out
  other devices, returns a new token for this one), `POST /auth/forgot-password` (emails a 1-hour
  link; same answer whether or not the account exists) and `POST /auth/reset-password`. Reset tokens
  are stored hashed (`User.passwordResetToken`, `passwordResetExpiry`, `passwordChangedAt`). Changing
  the password cancels any pending reset link. These routes share the login rate limit (10 per 15
  minutes). Minimum length is now 8 for sign-up, change and reset. Pages: `/forgot-password`,
  `/reset-password?token=`, `/account` (the "Hi, name" chip links there); the extranet Settings page
  has the same change form. Resend refuses example.com addresses, so reset emails to test accounts fail.
- Privacy Policy (`/privacy`) and Terms (`/terms`) are drafts written from how the platform works.
  Company details live in `src/constants/legal.js`: fill in the legal entity, registered address,
  grievance officer and jurisdiction city, have a lawyer review both pages, then set
  `reviewed: true` to remove the "Draft" notice. Linked from the footer, sign-up and checkout.
- Hotel page: summary row (stars, name, place, review score, lowest price, See rooms) above a
  fixed-height photo grid; sticky price and Book bar on phones. The total comes from the checkout
  calculation.
- Results page: filters for price (slider), free cancellation, deals, guest rating, star category,
  property type, area and facilities (options come from the results); list and map views (Leaflet +
  OpenStreetMap, `components/search/ResultsMap.jsx`); the home page's search bar, prefilled.
  `GET /hotels/search` now returns city, area, location, image, latitude/longitude and type, and
  takes `minStars` (star category; `minRating` is the guest score).
- Checkout: step indicator, "Pay now / Pay 30% now / Pay at the hotel" options showing the amount
  due now and at the hotel. Home rows scroll sideways and don't repeat a hotel.
- Every page sets its browser title and description (`hooks/usePageTitle.js`); unknown addresses show
  a 404 page. Admin page titles use plain names (Finance ledger, Experiments, System health...).
- Not done: sign-in by phone OTP or Google needs an SMS provider and a Google OAuth client.

## Home page (Nov 2026)
- Order: search with quick chips (Near me, recent searches, cities with live counts), sign-up banner
  (signed out) or Zivo Prime banner (signed-in guests), live offers, top-rated hotels, popular
  destinations, the guest's own rows (recently viewed, recommended), "Why book with ZivoHotels",
  guest reviews.
- Data: `GET /api/v1/public/home` (`controllers/homeController.js`, cached 5 minutes in memory):
  cities with counts and average map pin, top-rated live hotels with the lowest base price, active
  offers anyone can see (with conditions and codes), approved 4+ star reviews with comments (sent
  only if 3+ exist), the Rewards sign-up bonus (only if set in Admin -> Loyalty) and the cheapest
  paid membership plan. Sections with nothing real to show are hidden.
- "Near me" picks the nearest city with hotels (within 80 km of the visitor) from those map pins.
- Below the reviews: Zivo Rewards and Prime (live programme rules and plan), panels for hotels
  (partners@) and companies (bookings@), 9 FAQs (also published as FAQPage structured data), and
  "Explore hotels" links to every city and popular area. `/hotels?area=` turns that area filter on.
- Search bar (home and results): one white bar with Where to? (clear button), Check-in / nights /
  Check-out, Guests & rooms and Search. The dates shown are now the dates searched: with none
  chosen, tonight is set (they used to be shown but not set, so Search asked for dates). Dates parse
  as local days, not UTC.
- Recommendation cards now use real review scores and counts (`Hotel.reviewScore`/`reviewCount`);
  the old seeded `Hotel.reviews` number is no longer sent to the browser.

## Extranet review (Nov 2026)
- Dashboard (`GET /extranet/dashboard`, `controllers/extranet/dashboardController.js`): arrivals,
  departures and in-house today, tonight's rooms sold, this month's revenue (stays checking in this
  month), last 7 days, reviews awaiting a reply, alerts, recent changes in plain words, and a to-do
  list of setup gaps. Days are India days. Replaced the health score, "system mode" and raw log.
- Bookings: tabs with counts (Arriving today, Upcoming, In house, Checked out, Cancelled, No-show),
  search (guest, booking ID, phone, email), CSV export of what's shown, check-in and no-show from the
  check-in date, check-out, and a confirmation before cancelling (the guest is refunded in full) or
  marking a no-show. The search box and Export button did nothing before; cancel was one click.
- Finance Hub: settlements show booking, guest, type and status; filter by status; CSV export with
  commission, GST on commission, TCS, TDS and net payable (`recentSettlements` now carries `booking`,
  up to 100).
- Performance (`GET /extranet/performance?days=7|30|90`): real page views and visitors, booking
  starts, bookings, conversion, revenue, ADR, occupancy, cancellation rate, lead time, rank by views
  in the city, daily charts and tips from the property's data. It used to be sample figures.
- Property Info: live/not-live badge from the real status and a "Your listing" summary (photos,
  amenities, map pin, nearby places, house rules) linking to the full editor at
  `/extranet/onboarding/:hotelId`.
- Live updates: `useSocketEvent` calls back whenever its callback changes, so callbacks must be
  stable and guard against handling the same event twice (the bell feed added events in a loop).

## Open questions
- GST on a kept cancellation fee / no-show charge is taken pro rata from the booking; confirm with
  the accountant. ZivoHotels' commission invoice to the hotel isn't generated yet.
- Changing a hotel's payout bank account after submission goes through support/admin; there is no
  verification flow for it.
- `paymentController` falls back to a hard-coded 30% for partial payments instead of the configured
  percentage.
- The hotel page estimates tax with hard-coded slabs (5% up to Rs 7,500, else 18%), not the admin's
  tax rules.
- Tax slabs are set in **Admin -> Platform Settings -> Tax Configuration** (that page existed but wasn't
  routed, and its add/edit buttons did nothing). "Use standard GST slabs" fills 5% up to ₹7,500 and 18%
  above; gaps and overlaps are refused. Production needs them saved once before taking bookings.

## Gotchas seen on this Mac
- Local Postgres runs in IST. Raw SQL comparing `DateTime` columns with JS dates shifts by 5h30; prefer
  Prisma queries (they behave the same locally and in UTC production).
- `EADDRINUSE :5000` means the backend is already running in another tab (`lsof -i :5000`). macOS 12's
  AirPlay Receiver can also hold port 5000.
- Signing in to the extranet as the admin redirects to onboarding. Use the owner account.
- After `git pull`, run `npm install` in the root and in `backend/` if the package files changed.
