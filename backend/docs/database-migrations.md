# Database migrations

Until November 2026 the schema was applied with `prisma db push`, and the
`prisma/migrations` folder only created 12 of the 76 tables. Two migrations were
added so that `prisma migrate deploy` now builds the complete schema on an empty
database (verified: zero drift against `schema.prisma`):

| Migration | What it does |
|---|---|
| `20261112000000_add_property_status_values` | Adds the new `PropertyStatus` values (kept separate: PostgreSQL can't use a new enum value in the same transaction) |
| `20261112000001_catch_up_to_schema` | Everything else needed to reach the current `schema.prisma` |

From now on, **change the schema with migrations, not `db push`**:

```bash
npx prisma migrate dev --name describe_your_change   # local: creates + applies a migration
npx prisma migrate deploy                            # staging/production: applies pending migrations
```

## New, empty database (local, staging, disaster recovery)

```bash
npx prisma migrate deploy
node scripts/setup_trgm.js     # pg_trgm extension + search indexes (not managed by Prisma)
npm run db:seed                # optional test data — LOCAL ONLY, it deletes all data first
```

## Existing database that was built with `db push` (production, your current local DB)

These databases already have the tables, so the migrations must be **marked as
applied, not run**. Do this once per database.

1. **Check the database really matches the schema** (must print `No difference detected`):

   ```bash
   npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma
   ```

   If it prints differences, stop: the database has drifted. Resolve that first
   (for example by reviewing and running the printed SQL with `--script`), and
   take a backup before changing production.

2. **Check what Prisma thinks is applied:**

   ```bash
   npx prisma migrate status
   ```

3. **Mark every migration that is listed as "not yet applied":**

   ```bash
   npx prisma migrate resolve --applied 20260427100718_add_token_versioning
   npx prisma migrate resolve --applied 20260427111535_final_production_audit_indices
   npx prisma migrate resolve --applied 20261112000000_add_property_status_values
   npx prisma migrate resolve --applied 20261112000001_catch_up_to_schema
   ```

   (Skip any that `migrate status` already shows as applied.)

4. `npx prisma migrate status` should now print `Database schema is up to date!`

For production, run these through the Cloud SQL Auth Proxy with production
credentials, after a backup.
