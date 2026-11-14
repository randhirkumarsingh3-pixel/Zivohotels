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
- The results page search box shows the dates as "-".
- Search availability reads inventory by UTC date; on a server in IST (this Mac) booked rooms aren't
  subtracted. Production runs in UTC.

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
