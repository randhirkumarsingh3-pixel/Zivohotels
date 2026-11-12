# Go-live checklist (Google Cloud)

Development happens locally (see `backend/.env.example`). Work through this list once,
in order, when moving to Google Cloud. Tick items off as you go.

Current state (Nov 2026): project `zivohotels-500807`, region `asia-south1`. Billing account
**closed**, so nothing can be created or run. Cloud Run service `zivohotels-api` was last
deployed **July 2026**, so none of the later fixes are live. Cloud data is **test data only**, so
production starts from a fresh database.

---

## 1. Google Cloud project
- [ ] Reactivate billing, or link an open billing account:
      https://console.cloud.google.com/billing/linkedaccount?project=zivohotels-500807
      Check it with `gcloud billing projects describe zivohotels-500807` (`billingEnabled: true`).
- [ ] Set a **budget alert** (Billing → Budgets & alerts) so costs never surprise you.
- [ ] Note the backend's service account (the default is
      `74420715867-compute@developer.gserviceaccount.com`):
      `gcloud run services describe zivohotels-api --region asia-south1 --format='value(spec.template.spec.serviceAccountName)'`
      (empty output = the default account)

## 2. Database (fresh, since the old data is test data)
- [ ] Create, or recreate, an empty PostgreSQL database in Cloud SQL (PostgreSQL 16).
- [ ] Apply the schema from migrations (via the Cloud SQL Auth Proxy, with production credentials):
      ```bash
      npx prisma migrate deploy
      node scripts/setup_trgm.js          # search extension + indexes; search fails without it
      ```
      Do **not** run `npm run db:seed` (it deletes data; it now refuses anything but localhost anyway).
- [ ] Create the first admin account:
      ```bash
      ADMIN_PASSWORD='use-a-long-unique-password' node scripts/createAdmin.js --email you@zivohotels.com --name "Your Name"
      ```
- [ ] Turn on automated backups and point-in-time recovery for the instance.
- [ ] Reusing an old database instead of a fresh one? Follow the baseline steps in
      `backend/docs/database-migrations.md` instead of `migrate deploy`.

## 3. Private bucket for KYC documents
Required before real owners upload PAN, GST and cheques. The media bucket is public-read by design.
- [ ] Create it:
      ```bash
      gcloud storage buckets create gs://zivohotels-kyc-prod --location=asia-south1 --uniform-bucket-level-access --public-access-prevention
      gcloud storage buckets update gs://zivohotels-kyc-prod --versioning
      ```
- [ ] Give the backend access to it, and only it:
      ```bash
      gcloud storage buckets add-iam-policy-binding gs://zivohotels-kyc-prod --member=serviceAccount:SERVICE_ACCOUNT_EMAIL --role=roles/storage.objectUser
      ```
- [ ] Check it's private: `describe --format="value(public_access_prevention)"` prints `enforced`, and
      `get-iam-policy` shows no `allUsers` or `allAuthenticatedUsers`.
- [ ] Media bucket `zivohotels-media-prod` (hotel photos, public): make sure it exists and the
      service account can write to it.

## 4. Backend settings (Cloud Run → zivohotels-api → Edit → Variables & Secrets)
Put secrets in **Secret Manager** and reference them; never put them in plain env vars or git.
The backend refuses to start if a required one is missing.

| Setting | Required | Value |
|---|---|---|
| `NODE_ENV` | yes | `production` |
| `DATABASE_URL` | yes (secret) | Cloud SQL URL; on Cloud Run use the socket form `postgresql://USER:PASS@localhost/DB?host=/cloudsql/zivohotels-500807:asia-south1:INSTANCE` and add the instance under *Connections* |
| `DIRECT_URL` | for migrations | same database |
| `JWT_SECRET` | yes (secret) | 32+ random characters: `openssl rand -hex 32` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | yes (secret) | **live** keys (only at real launch) |
| `RAZORPAY_WEBHOOK_SECRET` | yes (secret) | from the webhook created in step 6 |
| `RESEND_API_KEY` | yes (secret) | from Resend (step 7) |
| `EMAIL_FROM` | yes | e.g. `ZivoHotels <noreply@zivohotels.com>` |
| `GCS_KYC_BUCKET` | yes | `zivohotels-kyc-prod` |
| `FRONTEND_URL` | yes | `https://www.zivohotels.com` |

Do **not** set `GOOGLE_APPLICATION_CREDENTIALS` on Cloud Run; it uses the service account automatically.

## 5. Deploy the backend
GitHub Actions has never run on this repository, and two workflows both target the backend:
`backend-deploy.yml` (service `zivohotels-api`, but it attaches the **staging** Cloud SQL instance)
and `deploy.yml` (service `zivohotels-api-prod`, which doesn't exist). Pick one:
- [ ] **Simplest:** deploy by hand from the repo root:
      ```bash
      gcloud run deploy zivohotels-api --source backend --region asia-south1
      ```
- [ ] **Or automate:** keep `backend-deploy.yml`, fix its Cloud SQL instance name, delete
      `deploy.yml`, enable Actions and add its secrets (`GCP_PROJECT_ID`, `WIF_PROVIDER_NAME`,
      `SERVICE_ACCOUNT_EMAIL`).
- [ ] **Invoice PDFs:** `node:20-slim` may lack the system libraries Chrome needs. After deploying,
      generate one invoice. If it fails, the Dockerfile needs Chrome's libraries (ask Claude).
- [ ] Smoke test: `cd backend && npm run test:smoke -- --url=https://YOUR-SERVICE-URL` (4 passing).

## 6. Payments (Razorpay)
- [ ] Complete Razorpay KYC and activate **live** mode.
- [ ] Dashboard → Webhooks → add `https://YOUR-API-URL/api/v1/payments/webhook` with events
      `payment.captured`, `payment.failed`, `payment.refunded`; copy its secret into
      `RAZORPAY_WEBHOOK_SECRET`.
- [ ] Make one small real booking end to end, then cancel it, and check that the refund arrives.

## 7. Email (Resend)
- [ ] Verify the `zivohotels.com` domain in Resend (add the DNS records it shows).
- [ ] Sign up with a real address and confirm the OTP and booking-confirmation emails arrive.

## 8. Frontend (Firebase Hosting)
- [ ] Build with production settings and deploy:
      ```bash
      VITE_API_URL=https://YOUR-API-URL/api/v1 VITE_RAZORPAY_KEY_ID=rzp_live_xxx npm run build
      npx firebase-tools deploy --only hosting:main --project zivohotels-500807-1d4b0
      ```
      (or enable `firebase-deploy.yml` with secrets `VITE_API_URL`, `VITE_RAZORPAY_KEY_ID`,
      `FIREBASE_SERVICE_ACCOUNT`)
- [ ] Domains: `zivohotels.com`/`www` point to Firebase. If you use `admin.`/`partner.`
      subdomains, they're already in the backend's CORS list (`backend/server.js`); any other
      domain must be added there.

## 9. Final checks on the live site
- [ ] Customer: sign up → search a city (suggestions appear) → book → pay → confirmation email → cancel.
- [ ] Owner: extranet login → onboarding → upload a KYC document → it lands in `gs://zivohotels-kyc-prod`,
      and its storage URL returns **403** when opened without logging in.
- [ ] Admin: approve a property, view and verify a KYC document, take the hotel live, and check that it
      appears in search.
- [ ] Cloud Run logs show no `⚠️ ... is not set` warnings and no 5xx errors.

## Known items to decide or finish before a public launch
- [ ] KYC documents required before an owner can submit a property? (optional today)
- [ ] Property approval doesn't require bank details (`propertyReviewController.approveProperty`).
- [ ] Promotions: creating one says "success" but nothing is saved.
- [ ] Money is stored as floating-point numbers in bookings/payments; move to exact decimals.
- [ ] Login token is kept in `localStorage`; consider httpOnly cookies.
- [ ] Error responses can include internal database messages; hide them in production.
- [ ] react-router 6 → 7 (moderate security advisory).
- [ ] `backend/seed_automation_user.js` is broken (uses `require` in an ES-module project); use
      `scripts/createAdmin.js` instead.
