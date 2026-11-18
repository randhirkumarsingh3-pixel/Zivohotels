# ZivoHotels app on the Hostinger VPS (separate project, next to the existing stack)

This runs **this repository's app** on the VPS `srv2151205` (Ubuntu 24.04, Docker) as a
**completely separate Docker project**. It has its own folder, database, API, website, networks
and volumes. The other ZivoHotels platform that already runs there (`/opt/zivo`, Docker project
`zivo-staging`) is not modified.

**Address:** https://zivohotels.189-72-151-212.sslip.io

sslip.io names point to the IP inside them, so **no DNS setup** is needed. You can switch to a
real domain later by changing one line in `.env`.

```
Internet ──HTTPS──> Caddy (belongs to the other project, holds ports 80/443)
                      ├─ app./api./s3.189-72-151-212.sslip.io → the other platform (unchanged)
                      └─ zivohotels.189-72-151-212.sslip.io
                           └─(network "zivohotels-app-edge")→ our website container (Nginx)
                                ├─ /            → the React app
                                └─ /api /uploads /socket.io → our API container
                                                                └─ our PostgreSQL container
```

## What is shared with the other project (only these two things)
1. **Caddy's configuration:** one file next to its Caddyfile, `zivohotels-app.caddy`, plus one
   line at the end of the Caddyfile: `import zivohotels-app.caddy`.
2. **Networking:** the Caddy container is attached to **our** network `zivohotels-app-edge`, so it
   can reach our website. Nothing of ours joins the other project's networks.

`caddy-link.sh` manages both:
- it validates Caddy's configuration before every reload
- it restores everything if Caddy rejects the change
- reloads are graceful, so the other platform stays up

Deploys of the other project replace its Caddyfile and recreate Caddy, which drops both links. A cron job re-runs `caddy-link.sh` every 5 minutes, so our site comes back by itself within 5 minutes.

## Files in this folder
| File | Purpose |
|---|---|
| `docker-compose.yml` | Our project `zivohotels-app`: `db`, `api`, `zivohotels-app-web` |
| `web.Dockerfile`, `nginx.conf` | The website image (React build + Nginx, which also routes to the API) |
| `.env.example` | Settings template; the real `.env` stays on the server and is never committed |
| `deploy.sh` | Deploy or update in one command |
| `caddy-link.sh`, `caddy/zivohotels-app.caddy.template` | Connects our domain in Caddy |

Tested in a copy of this server's layout (a Caddy container on `zivo-staging_default` with the
Caddyfile mounted from `/opt/zivo/current/...`, plus a stand-in other app):
- the full deploy, and the other app kept working throughout
- in a browser over HTTPS: home page, search suggestions, owner login with live updates
  (WebSocket), KYC uploads up to 6 MB and their protected view, photo uploads, admin login
- rate limits see the real visitor IP, and a faked `X-Forwarded-For` header is ignored
- recovery after the other project redeploys, and after a full `down`/`up`
- automatic rollback when Caddy rejects a configuration

The one step that couldn't run there was installing the system packages (OpenSSL, Chromium) in the API image; Debian's mirror was blocked in the test environment.

---

## Setup (once), as root on the VPS

### 1. Snapshot first
In **hPanel → VPS → Backups & Monitoring → Snapshots**, create a snapshot. Then open
**Web console**, or `ssh root@189.72.151.212`.

### 2. Check the tools
```bash
docker compose version && git --version && curl --version | head -1
```
Docker Compose must be **v2.17 or newer**.

### 3. Get the code with its own deploy key
This key is used only for this repository, so it can't interfere with the other project's GitHub access:
```bash
ssh-keygen -t ed25519 -C "zivohotels-app on srv2151205" -f /root/.ssh/zivohotels_app_deploy -N ""
```
```bash
printf '\nHost github-zivohotels-app\n  HostName github.com\n  User git\n  IdentityFile /root/.ssh/zivohotels_app_deploy\n  IdentitiesOnly yes\n' >> /root/.ssh/config
```
```bash
cat /root/.ssh/zivohotels_app_deploy.pub
```
Copy the printed line. On GitHub, go to **randhirkumarsingh3-pixel/Zivohotels → Settings → Deploy keys → Add deploy key**, paste it, and leave write access **off**. Then:
```bash
git clone git@github-zivohotels-app:randhirkumarsingh3-pixel/Zivohotels.git /opt/zivohotels-app
```
Answer `yes` to the GitHub fingerprint question.

### 4. Settings
```bash
cd /opt/zivohotels-app/deploy/vps && cp .env.example .env && chmod 600 .env
```
Fill in the database password and login secret automatically:
```bash
sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=$(openssl rand -hex 16)/; s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" .env
```
Then add your **Razorpay test keys** (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`), and optionally `RESEND_API_KEY` for emails:
```bash
nano .env
```
Save with Ctrl+O, Enter, Ctrl+X. Leave `APP_DOMAIN` and `CADDY_CONTAINER` as they are.

### 5. Deploy
```bash
bash /opt/zivohotels-app/deploy/vps/deploy.sh
```
The first run builds the images, which takes a few minutes. It:
1. starts the database
2. applies the migrations and search indexes
3. starts the API and website
4. connects the domain in Caddy
5. installs the 5-minute re-link job (`/etc/cron.d/zivohotels-app-caddy`)
6. waits for HTTPS

It ends with **`✅ Live: https://zivohotels.189-72-151-212.sslip.io`**. The first visit can take up to a minute while Caddy gets the certificate.

### 6. Data
A shortcut for the commands below, valid in this terminal session:
```bash
ZC="docker compose -f /opt/zivohotels-app/deploy/vps/docker-compose.yml --env-file /opt/zivohotels-app/deploy/vps/.env"
```
Then pick one.
- **Test data** (sample hotels and the usual test logins). This **deletes all data** in our database:
  ```bash
  $ZC run --rm --no-deps -e NODE_ENV=development -e ALLOW_REMOTE_SEED=true api node prisma/seed.js && $ZC run --rm --no-deps api node scripts/setup_trgm.js
  ```
- **Or start empty with your own admin:**
  ```bash
  $ZC run --rm --no-deps api node scripts/createAdmin.js --email you@zivohotels.com --name "Your Name"
  ```

- **Before real people use it:** create your own admin (above), then switch off the test logins from the sample data (their passwords are in the code). The first command only lists them:
  ```bash
  $ZC run --rm --no-deps api node scripts/disableTestAccounts.js
  ```
  ```bash
  $ZC run --rm --no-deps api node scripts/disableTestAccounts.js --apply
  ```
- **Company and support details** for invoices, vouchers and emails: fill `ZIVO_LEGAL_NAME`, `ZIVO_GSTIN`, `ZIVO_PAN`, `ZIVO_CIN`, `ZIVO_ADDRESS`, `ZIVO_SUPPORT_EMAIL` and `ZIVO_SUPPORT_PHONE` in `.env`, then run `deploy.sh`.

### 7. Check it
- [ ] **The other platform** still opens: https://app.189-72-151-212.sslip.io
- [ ] **The API is healthy:** https://zivohotels.189-72-151-212.sslip.io/ready shows `"READY"`.
- [ ] **The home page** loads, and typing a city shows suggestions.
- [ ] **Owner:** log in at `/extranet/login`, then upload a photo and a KYC document.
- [ ] **Admin:** open `/admin` and log in, then review the property and view the document.
- [ ] **Customer:** book with a [Razorpay test card](https://razorpay.com/docs/payments/payments/test-card-details/), then cancel.

### 8. Razorpay test webhook (optional)
In the Razorpay Dashboard (**Test mode**), go to **Settings → Webhooks → Add**:
- **URL:** `https://zivohotels.189-72-151-212.sslip.io/api/v1/payments/webhook`
- **Events:** `payment.captured`, `payment.failed`, `payment.refunded`
- **Secret:** put the same value in `RAZORPAY_WEBHOOK_SECRET` in `.env`

Then apply it with `bash /opt/zivohotels-app/deploy/vps/deploy.sh`.

---

## Day to day (as root)
| Task | Command |
|---|---|
| Update to the latest `main` | `bash /opt/zivohotels-app/deploy/vps/deploy.sh` |
| Deploy a branch for testing | `BRANCH=branch-name bash /opt/zivohotels-app/deploy/vps/deploy.sh` |
| Status | `$ZC ps` |
| API logs | `$ZC logs --tail 100 -f api` |
| Restart | `$ZC restart api zivohotels-app-web` |
| Stop / start | `$ZC stop` / `$ZC start`. Use `stop`, not `down`, while Caddy is attached to our network. |
| Re-link Caddy now | `bash /opt/zivohotels-app/deploy/vps/caddy-link.sh` |
| Re-link history | `tail /var/log/zivohotels-app-caddy.log` |

**Backups:** a nightly database dump, keeping 14 days:
```bash
mkdir -p /var/backups/zivohotels-app
```
```bash
echo '15 3 * * * root docker exec zivohotels-app-db-1 pg_dump -U zivohotels -Fc zivohotels > /var/backups/zivohotels-app/db-$(date +\%F).dump && find /var/backups/zivohotels-app -name "*.dump" -mtime +14 -delete' > /etc/cron.d/zivohotels-app-backup
```
Uploads are in the Docker volumes `zivohotels-app_uploads` (photos) and
`zivohotels-app_private-uploads` (KYC documents). Hostinger snapshots include them.

## Remove it completely (undo everything)
This permanently deletes our database and uploads; the other project is untouched.
```bash
rm -f /etc/cron.d/zivohotels-app-caddy /etc/cron.d/zivohotels-app-backup
CF="$(docker inspect staging-caddy --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy"}}{{.Source}}{{end}}{{end}}')"
sed -i '/ZivoHotels app (separate project/d; /^import zivohotels-app.caddy$/d' "$CF/Caddyfile" && rm -f "$CF/zivohotels-app.caddy"
docker exec staging-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
docker network disconnect zivohotels-app-edge staging-caddy
docker compose -f /opt/zivohotels-app/deploy/vps/docker-compose.yml --env-file /opt/zivohotels-app/deploy/vps/.env down -v
rm -rf /opt/zivohotels-app
```

## Troubleshooting
| Symptom | Check |
|---|---|
| `502` on our address | The app isn't running (`$ZC ps`, `$ZC logs api`), or Caddy lost our network after the other project's deploy. Run `caddy-link.sh`; cron does this within 5 minutes. |
| Our address shows nothing or a certificate error | The Caddy link is missing. Run `caddy-link.sh`, then `docker logs --tail 50 staging-caddy`. |
| `❌ Caddy rejected the new configuration` | Nothing was changed. Send the printed lines to Claude. |
| The API keeps restarting | `$ZC logs api`. A `cannot start — configuration problems` message names the missing setting in `.env`. |
| `deploy.sh` stops at a check | It names the problem, for example an empty `.env` value or a missing Caddy container. |
| Invoices don't generate | `$ZC logs api` for Chromium errors. |
| Search gives errors | `$ZC run --rm --no-deps api node scripts/setup_trgm.js` |
