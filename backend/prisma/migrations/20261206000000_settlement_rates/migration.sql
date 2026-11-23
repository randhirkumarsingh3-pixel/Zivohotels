-- The rates (commission, GST on commission, TCS, TDS) each stay was settled with, so changing them in
-- Admin → Finance settings only affects later stays.
ALTER TABLE "Settlement" ADD COLUMN "rates" JSONB;
