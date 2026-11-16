# Staging on a Hostinger VPS (beside an existing website)

End-to-end setup for **https://staging.zivohotels.com** on a Hostinger VPS that already hosts
another website. Staging runs alongside it without changing it:

```
Browser ──HTTPS──> Nginx (already on the VPS, ports 80/443)
                     ├─ your existing website (unchanged)
                     └─ staging.zivohotels.com
                          ├─ /            → built React app (files on disk)
                          ├─ /api, /uploads, /socket.io → Node API on 127.0.0.1:5100 (PM2)
                          └─ PostgreSQL on the same VPS (not reachable from outside)
```

Everything in this folder was tested on Ubuntu 24.04 with Nginx 1.24. That covered:
- the deploy script, migrations, the build, PM2 and the health check
- an existing site kept working next to staging
- logins, search, live updates (WebSocket), photo uploads, and private KYC uploads and views

Files here:
| File | What it is |
|---|---|
| `nginx-zivohotels-staging.conf` | The Nginx site for staging |
| `ecosystem.config.cjs` | PM2 process definition (one API process) |
| `deploy.sh` | One command to deploy or update |

Replace `staging.zivohotels.com` everywhere if you use a different name.

---

## 1. Connect, and take a snapshot first
1. **Find the VPS details:** in **hPanel → VPS → your server → Overview**, note the **IP address** and the root login.
2. **Take a snapshot:** in **hPanel → VPS → Snapshots & Backups**, click **Create snapshot**. It lets you undo everything if anything goes wrong with the existing website.
3. **Connect** from your Mac's Terminal:
   ```bash
   ssh root@YOUR_VPS_IP
   ```

## 2. Check what's already on the server
These commands only read; they change nothing.
```bash
cat /etc/os-release | head -2
ss -tlnp | grep -E ':(80|443|5100|5432) '
ls /etc/nginx/sites-enabled/ 2>/dev/null
free -h && df -h /
ufw status
```
- **The process on ports 80/443 is `nginx`:** continue with this guide.
- **It's something else** (apache2, litespeed/OpenLiteSpeed, a control panel such as CloudPanel or
  CyberPanel, or Docker/Traefik): **stop here**. The Nginx steps below would conflict with it;
  send the output to Claude to get the steps adapted.
- **Port 5100 or 5432 is already in use:** choose a free port for the API in step 7 and use it in the
  Nginx file too, or reuse the existing PostgreSQL.
- **Under 2 GB of RAM:** add swap so the frontend build doesn't run out of memory:
  ```bash
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ```

## 3. Install the software (as root)
```bash
apt update && apt install -y git curl ca-certificates openssl
```
Node.js 20 and PM2:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs && npm install -g pm2
```
PostgreSQL. Skip this if `ss` in step 2 showed it's already running on port 5432:
```bash
apt install -y postgresql postgresql-contrib
```
Certbot, for the free SSL certificate:
```bash
apt install -y certbot python3-certbot-nginx
```
Check: `node -v` shows v20.x, and `pm2 -v` and `psql --version` both print versions.

## 4. Create a separate user for the app
The app doesn't run as root:
```bash
adduser --disabled-password --gecos "" zivo
mkdir -p /var/www/zivohotels-staging && chown zivo:zivo /var/www/zivohotels-staging
```

## 5. Create the database
Generate a password and **save it**; you need it in step 7:
```bash
openssl rand -hex 16
```
Create the database user and the database, replacing `PASTE_PASSWORD`:
```bash
sudo -u postgres psql -c "CREATE ROLE zivo_staging LOGIN PASSWORD 'PASTE_PASSWORD';" -c "CREATE DATABASE zivohotels_staging OWNER zivo_staging;"
```
Enable the search extension in that database:
```bash
sudo -u postgres psql -d zivohotels_staging -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
```
PostgreSQL only listens on the server itself by default. Don't open port 5432 to the internet.

## 6. Get the code (GitHub deploy key)
Switch to the app user and create a key for it:
```bash
su - zivo
ssh-keygen -t ed25519 -C "zivo-staging" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```
Copy the printed line. On GitHub, go to the repository → **Settings → Deploy keys → Add deploy key**, paste it, and leave "Allow write access" **unticked**. Then:
```bash
git clone git@github.com:randhirkumarsingh3-pixel/Zivohotels.git /var/www/zivohotels-staging/app
```
Answer `yes` to the GitHub fingerprint question.

## 7. Backend settings (as `zivo`)
```bash
cd /var/www/zivohotels-staging/app && nano backend/.env
```
Paste this, fill in the `<...>` values, then save (Ctrl+O, Enter, Ctrl+X):
```
NODE_ENV=production
PORT=5100
HOST=127.0.0.1
STORAGE_DRIVER=local
CORS_ORIGINS="https://staging.zivohotels.com"
FRONTEND_URL="https://staging.zivohotels.com"

DATABASE_URL="postgresql://zivo_staging:<DB_PASSWORD>@localhost:5432/zivohotels_staging"
DIRECT_URL="postgresql://zivo_staging:<DB_PASSWORD>@localhost:5432/zivohotels_staging"

# 64 random characters: run `openssl rand -hex 32` and paste the result
JWT_SECRET="<RANDOM_64_CHARS>"
JWT_EXPIRES_IN="7d"

# Razorpay TEST keys only; never live keys on staging
RAZORPAY_KEY_ID="rzp_test_<...>"
RAZORPAY_KEY_SECRET="<...>"
RAZORPAY_WEBHOOK_SECRET="<from step 13, or leave empty for now>"

# Optional: without it, OTP and booking emails are not sent
RESEND_API_KEY=""
EMAIL_FROM="ZivoHotels Staging <noreply@zivohotels.com>"
```
Then make it readable only by the app user:
```bash
chmod 600 backend/.env
```
- `NODE_ENV=production` makes staging behave like the real site, for example hiding internal error details.
- `STORAGE_DRIVER=local` keeps photos in `backend/public/uploads` and KYC documents privately in `backend/private_uploads`, on this server rather than Google Cloud.
- `HOST=127.0.0.1` means only Nginx can reach the API port.

## 8. Frontend build settings (as `zivo`)
```bash
cd /var/www/zivohotels-staging/app && printf 'VITE_API_URL=/api/v1\nVITE_RAZORPAY_KEY_ID=rzp_test_<...>\n' > .env.production.local
```
Add `VITE_GOOGLE_MAPS_API_KEY=...` on its own line if you use the map in onboarding. This file is
git-ignored and is read automatically at build time.

## 9. First deploy (as `zivo`)
```bash
bash /var/www/zivohotels-staging/app/deploy/staging/deploy.sh
```
It pulls `main`, installs dependencies, applies database migrations, sets up search, builds the
website, starts the API with PM2 and waits for it to be healthy. It ends with **`✅ Staging is up`**.

Then add data. Pick one.
- **Test data** (hotels and the usual test logins). It **deletes everything** in the staging database:
  ```bash
  cd /var/www/zivohotels-staging/app/backend && NODE_ENV=development npm run db:seed && node scripts/setup_trgm.js
  ```
- **Or start empty with just your admin account:**
  ```bash
  cd /var/www/zivohotels-staging/app/backend && node scripts/createAdmin.js --email you@zivohotels.com --name "Your Name"
  ```
Then return to root with `exit`.

## 10. Start the API automatically after a reboot (as root)
```bash
pm2 startup systemd -u zivo --hp /home/zivo
```
That prints a command starting with `sudo env PATH=...`; **copy and run it**. Then save the process list:
```bash
su - zivo -c "pm2 save"
```

## 11. Invoice PDFs (as root, once)
Invoices are generated with a headless Chrome, which needs some system libraries:
```bash
cd /var/www/zivohotels-staging/app/backend && npx puppeteer browsers install chrome --install-deps
```

## 12. Domain and HTTPS
1. **DNS:** wherever `zivohotels.com`'s DNS is managed (Hostinger: **hPanel → Domains → DNS / Nameservers**), add an **A record**: name `staging`, value `YOUR_VPS_IP`, TTL default. Check it from your Mac; after a few minutes it should print the VPS IP:
   ```bash
   dig +short staging.zivohotels.com
   ```
2. **Nginx site** (as root). This adds a new site file and doesn't touch the existing website's:
   ```bash
   cp /var/www/zivohotels-staging/app/deploy/staging/nginx-zivohotels-staging.conf /etc/nginx/sites-available/zivohotels-staging
   ln -s /etc/nginx/sites-available/zivohotels-staging /etc/nginx/sites-enabled/zivohotels-staging
   nginx -t && systemctl reload nginx
   ```
   Only reload if `nginx -t` says **syntax is ok** and **test is successful**. Otherwise nothing changes; fix the error first.
3. **SSL certificate:**
   ```bash
   certbot --nginx -d staging.zivohotels.com
   ```
   Enter your email, accept the terms, and choose to **redirect** HTTP to HTTPS. Renewal is automatic.
4. **Firewall:** only if `ufw status` said `active`. Keep SSH open:
   ```bash
   ufw allow OpenSSH && ufw allow 'Nginx Full'
   ```
   Don't open 5100 or 5432. If Hostinger's own firewall is on (**hPanel → VPS → Security → Firewall**), make sure ports 22, 80 and 443 are allowed there.

## 13. Razorpay webhook (test mode)
In the Razorpay Dashboard (**Test mode**), go to **Settings → Webhooks → Add**:
- **URL:** `https://staging.zivohotels.com/api/v1/payments/webhook`
- **Events:** `payment.captured`, `payment.failed`, `payment.refunded`
- **Secret:** generate one, then put it in `RAZORPAY_WEBHOOK_SECRET` in `backend/.env`

Restart the API to load the new setting:
```bash
su - zivo -c "cd /var/www/zivohotels-staging/app && pm2 reload deploy/staging/ecosystem.config.cjs --update-env"
```

## 14. Check everything
- [ ] **The existing website** still opens normally.
- [ ] **The API is healthy:** https://staging.zivohotels.com/ready shows `{"status":"READY",...}`.
- [ ] **The home page** loads, and typing a city shows suggestions.
- [ ] **Customer:** sign up or log in, book with a [Razorpay test card](https://razorpay.com/docs/payments/payments/test-card-details/), then cancel.
- [ ] **Owner:** log in at `/extranet/login`, then upload a photo and a KYC document.
- [ ] **Admin:** open `/admin` and log in, then review the property and view the KYC document.
- [ ] **Logs are clean:** `su - zivo -c "pm2 logs zivohotels-staging-api --lines 50"` shows no errors.

## Updating staging later
As `zivo`, run the same script. It pulls the latest `main` and redeploys:
```bash
su - zivo -c "bash /var/www/zivohotels-staging/app/deploy/staging/deploy.sh"
```
To try a branch before merging it, set `BRANCH`:
```bash
su - zivo -c "BRANCH=some-branch bash /var/www/zivohotels-staging/app/deploy/staging/deploy.sh"
```

## Backups (recommended)
A nightly database dump, keeping 14 days, as root:
```bash
mkdir -p /var/backups/zivohotels && chown postgres /var/backups/zivohotels
```
```bash
echo '30 2 * * * postgres pg_dump -Fc zivohotels_staging > /var/backups/zivohotels/staging-$(date +\%F).dump && find /var/backups/zivohotels -name "*.dump" -mtime +14 -delete' > /etc/cron.d/zivohotels-staging-backup
```
Uploaded files are in `/var/www/zivohotels-staging/app/backend/public/uploads` and `.../backend/private_uploads`. Hostinger snapshots cover them too.

## Troubleshooting
| Symptom | Check |
|---|---|
| `502 Bad Gateway` | The API isn't running. Check `su - zivo -c "pm2 logs zivohotels-staging-api --lines 80"`. A `cannot start — configuration problems` message names the missing setting in `backend/.env`. |
| The page shows the **other** website | The DNS doesn't point to this VPS yet, or `server_name` in the Nginx file doesn't match the domain. |
| Login fails with a CORS error in the browser console | `CORS_ORIGINS` must be exactly `https://staging.zivohotels.com`, with no trailing slash. Reload with `pm2 reload ... --update-env` after changing it. |
| Uploads fail with `413` | `client_max_body_size` in the Nginx file (20m); reload Nginx after changes. |
| `certbot` fails | The DNS isn't pointing here yet, or port 80 is blocked by a firewall. |
| The build is killed or runs out of memory | Add swap (step 2). |
| Invoices fail to generate | Run step 11 again and check `pm2 logs` for Chrome errors. |
| Search gives errors | `cd backend && node scripts/setup_trgm.js`. `deploy.sh` also runs this. |
