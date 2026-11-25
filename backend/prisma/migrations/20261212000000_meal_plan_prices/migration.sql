-- Rate plans with meals but no meal price (made when a room type was created with a meal plan)
-- were refused on every later edit. 0 = meals included in the room price, which is how they were
-- already priced (an empty meal price counted as 0), so no price changes.
UPDATE "RatePlan" SET "mealPriceAdult" = 0 WHERE "mealPlan" IN ('CP', 'MAP', 'AP') AND "mealPriceAdult" IS NULL;
UPDATE "RatePlan" SET "mealPriceChild" = 0 WHERE "mealPlan" IN ('CP', 'MAP', 'AP') AND "mealPriceChild" IS NULL;
