FROM node:20-slim
WORKDIR /app

# OpenSSL (required by Prisma on Debian slim) and Chromium for invoice PDFs (puppeteer).
# Debian's Chromium brings every system library it needs; puppeteer's own Chrome download is
# skipped because node:slim lacks those libraries.
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates chromium fonts-liberation fonts-noto-core \
 && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/
# `prisma` (CLI) is installed automatically as a peer dependency of @prisma/client, so
# generate uses the project's pinned version, not the latest from the internet.
RUN npm ci --omit=dev && npx prisma generate

# Copy ALL source files
COPY . .

# Remove files that should not be in the image
RUN rm -rf .env .env.local tests/ docs/ *.log

# Upload folders (mounted as volumes on a VPS): public photos and private KYC documents
RUN mkdir -p public/uploads public/invoices private_uploads

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server.js"]
