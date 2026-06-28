# ZivoHotels Migration Command Book

This document is the Single Source of Truth for executing the final Sprint 6 Production Cutover.

## Section 1: Pre-flight
- **Freeze Production**: Announce 2-hour maintenance window.
- **Verify Pipelines**: Ensure all GitHub Actions are Green.
- **Verify Staging**: Ensure Sprint 5C BAT passed.
- **Verify Backups**: Trigger manual Supabase PG Snapshot.

## Section 2: Database Migration (Sprint 6)
**1. Export Production DB**
```bash
/usr/lib/postgresql/17/bin/pg_dump --no-owner --no-acl --clean --if-exists --schema=public \
  -d "$SUPABASE_DB_URL" -f zivohotels_prod_snapshot.sql
sed -i '/transaction_timeout/d' zivohotels_prod_snapshot.sql
sed -i '/CREATE EXTENSION IF NOT EXISTS "supabase_vault"/d' zivohotels_prod_snapshot.sql
sed -i '/COMMENT ON EXTENSION "supabase_vault"/d' zivohotels_prod_snapshot.sql
```

**2. Upload to GCS**
```bash
gcloud storage cp zivohotels_prod_snapshot.sql gs://zivohotels-db-imports-500807/
```

**3. Import to Cloud SQL**
```bash
gcloud sql import sql zivohotels-pg-prod gs://zivohotels-db-imports-500807/zivohotels_prod_snapshot.sql --database=zivohotels --user=postgres --quiet
```
*Rollback if failed:* Do not proceed to Section 3. Cancel maintenance window.

## Section 3: Media Migration
**1. Generate Temporary Key**
```bash
gcloud iam service-accounts create media-migrator
gcloud storage buckets add-iam-policy-binding gs://zivohotels-media-prod \
    --member="serviceAccount:media-migrator@zivohotels-500807.iam.gserviceaccount.com" \
    --role="roles/storage.objectAdmin" \
    --condition="expression=request.time < timestamp('$(date -u -d '+2 hours' +%Y-%m-%dT%H:%M:%SZ)'),title=temp_migration_access,description=Expires in 2 hours"
gcloud iam service-accounts keys create service-account.json --iam-account="media-migrator@zivohotels-500807.iam.gserviceaccount.com"
```

**2. Execute Migration**
```bash
export GOOGLE_APPLICATION_CREDENTIALS="./service-account.json"
export NODE_ENV=production
node backend/scripts/migrateMedia.js
```

**3. Verify**
```bash
node backend/scripts/verifyMigration.js
```

**4. Cleanup**
```bash
gcloud iam service-accounts keys delete $(gcloud iam service-accounts keys list --iam-account=media-migrator@zivohotels-500807.iam.gserviceaccount.com --format="value(name)" | grep -v "keyid/SYSTEM_MANAGED") --iam-account=media-migrator@zivohotels-500807.iam.gserviceaccount.com
gcloud iam service-accounts delete media-migrator@zivohotels-500807.iam.gserviceaccount.com --quiet
```

## Section 4: Business Acceptance Testing
- `[ ]` Hotel Search / Property Fetch
- `[ ]` Live Booking Flow
- `[ ]` Payment Gateway Processing
- `[ ]` Booking Confirmation Email
*Failure Procedure:* Execute Section 6 (Rollback).

## Section 5: Production Cutover
**1. Secrets & Env Vars**
- Update Vercel and Cloud Run with new `DATABASE_URL` pointing to Cloud SQL.

**2. DNS Cutover**
- Flip A-Records to Cloud Run IP / API Gateway.

## Section 6: Rollback Procedures
*Triggers:*
- Login unavailable > 15m.
- Booking flow broken.
- Database integrity mismatch.

*Steps:*
1. Revert `DATABASE_URL` in Vercel/Cloud Run back to Supabase.
2. Re-point DNS to old Vercel deployment.
3. Import `media_url_rollback_backup.json` to Supabase to restore image URLs.

## Section 7: Post-Cutover Observation
- **2 hours:** Monitor Error Rates & HTTP 500s.
- **24 hours:** Monitor DB CPU & Connections.
- **7 days:** First full reporting lifecycle.
- **14 days:** Old Supabase teardown.
