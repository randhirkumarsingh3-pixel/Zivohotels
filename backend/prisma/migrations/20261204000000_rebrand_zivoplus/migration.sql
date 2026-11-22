-- ZivoHotels is now ZivoPlus (zivoplus.com). Updates the brand name and web/email addresses in
-- stored platform settings (SEO titles and templates, support contacts, email settings, Google
-- Hotels point of sale) and in the hotel policy labels offered to hotels.
-- Not changed on purpose: signed agreements, invoices, bookings, notifications already sent, hotels'
-- own descriptions, and social media links (those are the real accounts' addresses).
UPDATE "SystemConfig"
SET "value" = regexp_replace(
      replace(replace(replace("value"::text, 'ZivoHotels', 'ZivoPlus'), 'Zivohotels', 'ZivoPlus'), 'zivohotels.com', 'zivoplus.com'),
      '"posId":\s*"zivohotels"', '"posId": "zivoplus"', 'g')::jsonb,
    "updatedAt" = now()
WHERE "key" NOT IN ('social_settings', 'social_links')
  AND ("value"::text ILIKE '%zivohotels%');

UPDATE "PolicyTemplate"
SET "label" = replace("label", 'ZivoHotels', 'ZivoPlus'), "updatedAt" = now()
WHERE "label" LIKE '%ZivoHotels%';
