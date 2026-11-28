-- The hotel issues the GST invoice for the stay by default (B2C and B2B); ZivoPlus issues its
-- own tax invoice as the facilitator. Applies to settings already saved, too.
UPDATE "SystemConfig"
SET "value" = jsonb_set("value"::jsonb, '{guestInvoice,mode}', '"HOTEL_ISSUES"')::json,
    "updatedAt" = now()
WHERE "key" = 'document_settings' AND ("value"::jsonb) ? 'guestInvoice';

UPDATE "SystemConfig"
SET "value" = jsonb_set("value"::jsonb, '{corporate,invoiceMode}', '"HOTEL_ISSUES"')::json,
    "updatedAt" = now()
WHERE "key" = 'business_settings' AND ("value"::jsonb) ? 'corporate';

UPDATE "SystemConfig"
SET "value" = jsonb_set("value"::jsonb, '{agency,invoiceMode}', '"HOTEL_ISSUES"')::json,
    "updatedAt" = now()
WHERE "key" = 'business_settings' AND ("value"::jsonb) ? 'agency';
