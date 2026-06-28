# 1. Dependencies Stage
FROM node:18-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
# Install all dependencies including devDependencies for Prisma generation
RUN npm ci

# 2. Build Stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma Client
RUN npx prisma generate
# Optional: if you had a build step (e.g., TS compile), it would go here

# 3. Production Runtime Stage
FROM node:18-alpine AS runner
WORKDIR /app

# Set Node environment to production
ENV NODE_ENV=production

# Create a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy built assets and dependencies
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/config ./config
COPY --from=builder /app/controllers ./controllers
COPY --from=builder /app/middleware ./middleware
COPY --from=builder /app/routes ./routes
COPY --from=builder /app/services ./services
COPY --from=builder /app/workers ./workers
COPY --from=builder /app/server.js ./server.js

# Ensure local uploads dir exists for fallback, though we use GCS in prod
RUN mkdir -p public/uploads && chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

EXPOSE 5000

# Start command can be overridden when running workers
CMD ["npm", "start"]
