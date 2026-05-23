# ZivoHotels: Deployment & Rollback Guide

This document defines the operational procedures for a safe production rollout.

## 🚀 1. Launch Strategy: 3-Phase Rollout

### Phase 1: Internal Soft Launch (T-Minus 24h)
- **Goal**: Functional verification by the core team.
- **Action**: Enable `maintenanceMode` = `true` in `SystemConfig`.
- **Whitelisting**: Manually add internal IP ranges to the firewall.
- **Verification**: Complete 2 real ₹1 transactions from booking to refund.

### Phase 2: Limited Beta Rollout (T-Minus 12h)
- **Goal**: Monitor system performance under light load.
- **Action**: Disable `maintenanceMode` but keep `isBookingDisabled` = `true` for general public (allow only users with `beta` flag).
- **Verification**: Check `auditLog` for any `CRITICAL_REFUND_FAILURE`.

### Phase 3: Full Public Launch (GO LIVE)
- **Goal**: 100% Traffic availability.
- **Action**: Disable all maintenance flags.
- **Monitoring**: Real-time monitoring of 5xx error spikes in CloudWatch/Loki.

---

## 🔁 2. Rollback Strategy (Emergency)

If a critical failure occurs (e.g., duplicate refunds, DB corruption):

### Step 1: Activate Kill Switch
Run this SQL in Supabase immediately:
```sql
UPDATE "SystemConfig" SET value = 'true' WHERE key = 'maintenanceMode';
```
*Effect: All public APIs stop, preventing further data corruption.*

### Step 2: Revert Deployment
- **Code Revert**: 
  ```bash
  git revert HEAD
  git push origin main
  ```
- **DB Revert**: Restore latest snapshot from Supabase (typically < 10 mins old).

---

## 📦 3. Backup Protocol
- **Automatic**: Supabase point-in-time recovery (PITR) enabled.
- **Manual**: Run `pg_dump` before every major database migration.
  ```bash
  pg_dump $DATABASE_URL > backup_$(date +%F).sql
  ```

---

## 🚨 4. Emergency Contacts
- **Tech Lead**: [Name/Phone]
- **Razorpay Support**: [Dashboard Link]
- **DB Ops**: [Supabase Status Page]
