-- CreateTable
CREATE TABLE "OrgSso" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT,
    "tenantId" TEXT,
    "autoJoin" BOOLEAN NOT NULL DEFAULT false,
    "defaultRole" TEXT NOT NULL DEFAULT 'TRAVELLER',
    "defaultGrade" TEXT,
    "enforce" BOOLEAN NOT NULL DEFAULT false,
    "lastTest" JSONB,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgSso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgSsoDomain" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgSsoDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SsoLoginState" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "returnTo" TEXT,
    "userId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SsoLoginState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgSso_organisationId_key" ON "OrgSso"("organisationId");

-- CreateIndex
CREATE INDEX "OrgSsoDomain_domain_status_idx" ON "OrgSsoDomain"("domain", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrgSsoDomain_organisationId_domain_key" ON "OrgSsoDomain"("organisationId", "domain");

-- CreateIndex
CREATE INDEX "SsoLoginState_expiresAt_idx" ON "SsoLoginState"("expiresAt");

