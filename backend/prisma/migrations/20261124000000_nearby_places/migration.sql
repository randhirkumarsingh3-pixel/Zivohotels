-- What's nearby: transit, attractions, landmarks and restaurants around the property.
ALTER TABLE "Hotel" ADD COLUMN "nearbyPlaces" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Hotel" ADD COLUMN "nearbyAutoFilledAt" TIMESTAMP(3);
