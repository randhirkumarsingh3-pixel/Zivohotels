-- A rate plan with a price is ready to sell. Plans created during onboarding were left as
-- "not configured" although they were on sale at their base price.
UPDATE "RatePlan" SET "isConfigured" = true WHERE "basePrice" > 0;
