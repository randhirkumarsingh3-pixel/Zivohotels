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

## Open questions (need the owner)
- **No-shows and cancellation fees:** no settlement is created for a NO_SHOW or a cancelled booking,
  so if a cancellation fee or no-show charge is kept, the hotel gets none of it.
- **Owner cancellations don't refund:** cancelling from the extranet (or admin status change) frees
  the rooms but doesn't refund a prepaid guest; only the customer's own cancel refunds.
- **GST on commission / TCS:** ZivoHotels' invoice to the hotel for commission (and any TCS under
  GST section 52) isn't modelled; check with an accountant before the first payout.
- `paymentController` falls back to a hard-coded 30% for partial payments instead of the configured
  percentage.
- The hotel page estimates tax with hard-coded slabs (5% up to Rs 7,500, else 18%), not the admin's
  tax rules.
- The local database has no tax rules, so no booking can be priced locally until an admin adds them
  (System settings -> tax rules).

## Gotchas seen on this Mac
- Local Postgres runs in IST. Raw SQL comparing `DateTime` columns with JS dates shifts by 5h30; prefer
  Prisma queries (they behave the same locally and in UTC production).
- `EADDRINUSE :5000` means the backend is already running in another tab (`lsof -i :5000`). macOS 12's
  AirPlay Receiver can also hold port 5000.
- Signing in to the extranet as the admin redirects to onboarding. Use the owner account.
- After `git pull`, run `npm install` in the root and in `backend/` if the package files changed.
