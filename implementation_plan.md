# Execution Plan: Phase 0 & Phase 1

This plan adheres to your strict execution order. We will first lock down the critical vulnerabilities (Phase 0) before building the complete User Management loop (Phase 1).

## PHASE 0: CRITICAL FIXES

### 1. Secrets & Env Blocker
- **Action:** Update `backend/server.js` to run a boot-time check enforcing the presence of `DATABASE_URL`, `JWT_SECRET`, `RAZORPAY_KEY_ID`, and `RAZORPAY_KEY_SECRET`. If any are missing, the server will intentionally crash with a clear error.
- **Action:** Strip the hardcoded `'rzp_test_123'` fallbacks from `paymentController.js`.

### 2. Server-Side Booking Validation
- **Action:** Install `zod` in the backend.
- **Action:** Create `backend/middleware/validationMiddleware.js` and a schema for `POST /api/v1/bookings`.
- **Validation Rules:**
  - Phone format (regex validation)
  - `guests >= 1`
  - `checkOut` > `checkIn` (strict date objects)
  - `checkIn` >= `today` (no past bookings allowed)

### 3. Pay@Hotel Expiry & UI Webhooks
- **Backend:** Verify the cleanup cron natively restores inventory (already implemented in Priority #3).
- **Frontend (Checkout):** 
  - Add a countdown timer to the UI.
  - Intercept UI unmounts/closures on pending payments to instantly trigger the `failBookingApi` endpoint, aggressively freeing locked inventory instead of waiting 24 hours.

---

## PHASE 1: USER MANAGEMENT

### 1. Database Updates
- **Action:** Add `INVITED` to the `UserStatus` enum in `schema.prisma`.
- **Action:** Add `inviteToken String?` and `inviteExpiry DateTime?` to the `User` model.
- *(Requires `npx prisma db push`)*

### 2. Backend APIs (`userController.js` & `userRoutes.js`)
- **`POST /api/v1/users/invite`:**
  - Ensure `req.user.role === 'ADMIN'`.
  - Validate email uniqueness.
  - Create user (`status: INVITED`, empty password).
  - Generate a 24-hour expiry token.
  - Log the pseudo-email containing the `/accept-invite?token=...` link to the terminal.
- **`POST /api/v1/users` (Direct Add):**
  - Hash password with `bcryptjs`.
  - Validate uniqueness and create active user immediately.
- **`POST /api/v1/users/accept-invite`:**
  - Verify token + expiry.
  - Accept a new password, hash it, and flip status to `ACTIVE`.

### 3. Frontend UI (`Users.jsx`)
- **Action:** Build Modals for `Invite User` and `Add User`.
- **Action:** Connect them to the new APIs with loading states (`isSubmitting`) and automatic table refreshes.
- **Action:** Create the public `/accept-invite` page with a password setup form.

---

## User Review Required
> [!IMPORTANT]  
> 1. Since we do not have an active SMTP server (like SendGrid), the `Invite User` email logic will simply log the `/accept-invite` URL to the backend console so you can test the flow locally. Is this acceptable for Phase 1?
> 2. I will need to run `npm install zod` in your backend for the Phase 0 validation. Do you approve?
