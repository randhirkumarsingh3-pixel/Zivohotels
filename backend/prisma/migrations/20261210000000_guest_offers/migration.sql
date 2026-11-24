-- Guest offers (data only). Admins change both later:
--  * Sign-in price: every signed-in guest gets 5% off from ZivoPlus (free "Member" plan's extra
--    discount; Admin -> Membership). Only set where it is still 0, so an admin's value is kept.
--  * First booking: a ZivoPlus-funded welcome offer of 5% on a new account's first booking
--    (Admin -> Promotions, "Welcome offer: first booking"). Applied automatically at checkout;
--    nightly stays only to start with (admins can switch it on for hourly stays).
UPDATE "MembershipPlan"
SET "benefits" = jsonb_set(COALESCE("benefits", '{}'::jsonb), '{zivoDiscountPercent}', '5'::jsonb), "updatedAt" = CURRENT_TIMESTAMP
WHERE "isFree" = true AND COALESCE(("benefits"->>'zivoDiscountPercent')::numeric, 0) = 0;

INSERT INTO "Promotion" ("id", "hotelId", "name", "description", "discountType", "value", "minNights", "forHourly", "firstBookingOnly", "audience", "fundedBy", "isActive", "createdByRole", "updatedAt")
VALUES ('promo-welcome-first-booking', NULL, 'Welcome offer: first booking', 'Extra discount on a new account''s first booking, paid by ZivoPlus', 'PERCENT', 5, 1, false, true, 'ALL', 'ZIVO', true, 'ADMIN', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
