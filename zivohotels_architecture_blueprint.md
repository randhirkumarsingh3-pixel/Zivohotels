# ZivoHotels - Production Architecture Blueprint (Option C)

This blueprint documents the production-grade GCP architecture for ZivoHotels, incorporating the CTO's approved Option C structure and all 10 operational refinements.

---

## 1. Executive System Overview

ZivoHotels is a multi-tenant, enterprise-grade Property Management System (PMS) and OTA booking engine deployed entirely on **Google Cloud Platform (GCP)**.

```
                              Users / Clients
                                     │
            ┌────────────────────────┼────────────────────────┐
            ▼                        ▼                        ▼
     zivohotels.com        admin.zivohotels.com     partner.zivohotels.com
   (Customer Website)         (Admin Portal)           (Hotel Extranet)
            │                        │                        │
            ▼                        ▼                        ▼
    ┌─────────────────────────────────────────────────────────┐
    │                    Firebase Hosting                     │
    │             (Global CDN / Edge Cache Layer)            │
    └────────────────────────┬────────────────────────────────┘
                             │
                             ▼
                     api.zivohotels.com
                             │
                             ▼
                        Cloud Armor (DDoS & IP / Geo / Rate Limiting)
                             │
                             ▼
                        API Gateway (v1/v2 Routing)
                             │
                             ▼
                        Cloud Run (API Only)
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
         Cloud SQL                    Cloud Storage
        (PostgreSQL)                   + Cloud CDN
              │                             │
              ▼                             ▼
       Cloud Monitoring              Secret Manager
       & Cloud Logging                  Terraform
```

### Technology Stack
- **Frontend Hosting**: **Firebase Hosting** (serving compiled Vite + React 18 SPAs).
- **Backend API**: **Google Cloud Run** (Express.js, Prisma, containerized via Docker).
- **API Gateway**: GCP API Gateway (manages `/v1` routing, rate limiting, and security boundaries).
- **Database**: **Google Cloud SQL** (PostgreSQL) with scaling, automated backups, and Cloud SQL Auth Proxy.
- **Media**: **Google Cloud Storage (GCS)** paired with **Cloud CDN** for low-latency image delivery.
- **Security**: **Google Cloud Armor** (DDoS mitigation, rate-limiting, and IP/Geo blocking).
- **Secrets Management**: **Secret Manager** (securing JWT keys, Razorpay secrets, and DB credentials).
- **Infrastructure**: Managed via **Terraform** (core GCP resources) and **Firebase CLI** (hosting deployments).

---

## 2. Core Architectural Flow

1. **Static Assets**: Frontend client requests are terminated at the **Firebase Hosting Edge CDN**, eliminating server cold starts and serving HTML/JS/CSS with edge-cached compression.
2. **API Routing**: Dynamic requests are routed to `api.zivohotels.com/v1`, protected by **Cloud Armor**, processed through the **API Gateway**, and forwarded to the **Cloud Run** backend.
3. **Database & Storage**: The Express backend interacts with **Cloud SQL** via Prisma and streams user media uploads to **GCS + Cloud CDN**.
4. **Request ID Propagation**: A single correlation/request ID is generated in the browser and propagated through Firebase, API Gateway, Cloud Run, and database transactions to ensure end-to-end trace logging.

---

## 3. CTO Operational Refinements

### 1. Separate Frontend Deployment Targets
To reduce bundle sizes, decouple rollbacks, and improve security boundaries, the monorepo builds three distinct static targets:
- `zivohotels.com` -> Customer Booking Site
- `admin.zivohotels.com` -> Global Admin Portal (Super Admin)
- `partner.zivohotels.com` -> Hotel Partner Extranet (Owners)

### 2. Environment Isolation & DNS Strategy
DNS registrar remains with **Hostinger**, with DNS zones pointing directly to Google Cloud targets:
- **Production**: `zivohotels.com` (Firebase), `api.zivohotels.com` (API Gateway)
- **Staging**: `staging.zivohotels.com` (Firebase Staging target), `staging-api.zivohotels.com`
- **Development**: `dev.zivohotels.com`, `dev-api.zivohotels.com`

### 3. Edge CDN Caching Policy
Static assets are aggressively edge-cached. Dynamic resources are explicitly blacklisted from caching.
- **Cache (Months, with hashed filenames)**: JS, CSS, Fonts, Images, Icons, Logos.
- **Medium Cache (Hours/Days)**: Static destination lists, city banners, static amenities lists.
- **Never Cache (0s, private)**: Availability status, pricing matrix, bookings, payments, auth sessions, profile data.

### 4. CI/CD & Preview Deployments
GitHub Actions manages the automated deployment pipelines:
- **Core GCP Infra**: Modified via Terraform PR pipelines.
- **Preview Deployments**: Every pull request triggers a preview deploy to a temporary Firebase Hosting target (e.g. `preview-124.web.app`) for QA sign-off.
- **Production Deployments**: Triggered on merge to `main`, deploying static files via Firebase CLI and Backend containers via Docker/Artifact Registry to Cloud Run.

### 5. Media & Image Optimization
Uploads to GCS undergo automated post-processing:
- Automatic WebP and AVIF generation for modern browser support.
- Thumbnail generation for listing cards.
- Delivery via Cloud CDN utilizing responsive image size targets (`srcset`).

### 6. Disaster Recovery (DR) Targets
- **Recovery Point Objective (RPO)**: ≤ 15 minutes of data loss (automated point-in-time PostgreSQL recovery).
- **Recovery Time Objective (RTO)**: ≤ 30 minutes to fully restore service in case of a catastrophic region failure.

### 7. Service Level Objectives (SLOs)
- **Home Page Load**: < 1.0 seconds
- **Fuzzy Search Query**: < 500 milliseconds
- **Hotel Details Fetch**: < 700 milliseconds
- **Booking & Inventory Lock API**: < 2.0 seconds
- **Image Load from CDN**: < 300 milliseconds

---
*Updated and maintained under Architecture Code Freeze. Approved by CTO.*
