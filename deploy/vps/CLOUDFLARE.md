# Cloudflare in front of ZivoHotels (free plan)

Cloudflare keeps copies of the site's files and photos in data centres across India and serves
them from the one nearest each visitor. The VPS then only answers for prices, availability and
bookings. Nothing changes in how you deploy.

**Takes about 30 minutes. Cost: free.** The only risk is DNS: email and other sites on
zivohotels.com must keep working, so check step 3 carefully.

## 1. Add the domain

1. Sign up at https://dash.cloudflare.com and choose **Add a domain** → `zivohotels.com` → **Free** plan.
2. Cloudflare scans the domain's current DNS records and lists them.

## 2. Check the imported records (important)

Compare Cloudflare's list with the records at your current DNS provider (Hostinger → Domains →
DNS). Every record must be there, especially:

- `staging` (A record → the VPS address): set to **Proxied** (orange cloud).
- The Resend email records (TXT `resend._domainkey`, the `send` MX and TXT records): leave as
  **DNS only** (grey cloud). Cloudflare can't proxy these record types anyway.
- MX records for your mailbox (if you have one) and any other sites: copy them exactly.

The root domain and `www`: leave them **DNS only** until the live site moves to this VPS.

## 3. Switch the nameservers

Cloudflare shows two nameservers (like `xxx.ns.cloudflare.com`). At Hostinger: Domains →
zivohotels.com → DNS / Nameservers → **Change nameservers** → enter Cloudflare's two. The switch
takes from a few minutes up to a few hours. Cloudflare emails you when the domain is active.

## 4. Settings in Cloudflare

- **SSL/TLS → Overview: Full (strict).** (The VPS already has a valid certificate from Caddy.)
- **SSL/TLS → Edge Certificates: "Always Use HTTPS" OFF.** Caddy already redirects to https, and
  this keeps the VPS's own certificate renewing on its own.
- **Speed → Optimization:** leave **Rocket Loader OFF** (it can break the website's scripts).
- **Network:** WebSockets **ON** (the default; used for live notifications).
- **Caching:** nothing to set. Cloudflare already caches the site's files and photos, and the
  server marks them as cacheable for a year. Prices, bookings and pages are never cached.

## 5. Tell the app

On the VPS, in `/opt/zivohotels-app/deploy/vps/.env`, add or change:

```
BEHIND_CLOUDFLARE=true
```

Then deploy as usual:

```
bash /opt/zivohotels-app/deploy/vps/deploy.sh
```

This makes rate limits and logs see each visitor's real address, not Cloudflare's. Caddy accepts
the address Cloudflare passes on only from Cloudflare's own servers, using the list Cloudflare
publishes, fetched once a day. Anyone else's claim is ignored.

## 6. Check

Open https://staging.zivohotels.com, and on the VPS run:

```
curl -sI https://staging.zivohotels.com/brand/zivo-mark-112.png | grep -i -E "server|cf-cache-status"
```

You should see `server: cloudflare`. A file loaded twice shows `cf-cache-status: HIT`.

## Turning it off

In Cloudflare, set the `staging` record back to **DNS only** (grey cloud), set
`BEHIND_CLOUDFLARE=false` in `.env`, and deploy.
