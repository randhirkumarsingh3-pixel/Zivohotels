-- Default GST slabs for hotel rooms, so a new database can price bookings.
-- Without any TaxRule rows every booking fails with "No applicable tax rule found".
-- Inserted ONLY when the table is empty: databases that already have slabs (edited in
-- Admin -> Settings -> Tax) are left untouched.
--   up to Rs 7,500 per night  -> 5%
--   above Rs 7,500 per night  -> 18%
INSERT INTO "TaxRule" ("id", "name", "minThreshold", "maxThreshold", "percentage", "isActive", "effectiveFrom", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v.name, v.min_t, v.max_t, v.pct, true, TIMESTAMP '2024-01-01 00:00:00', NOW(), NOW()
FROM (VALUES
  ('GST 5%',  0::numeric(12,2),    7500::numeric(12,2), 5::double precision),
  ('GST 18%', 7500::numeric(12,2), NULL::numeric(12,2), 18::double precision)
) AS v(name, min_t, max_t, pct)
WHERE NOT EXISTS (SELECT 1 FROM "TaxRule");
