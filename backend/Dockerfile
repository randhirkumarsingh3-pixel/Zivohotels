FROM node:18-slim
WORKDIR /app

# Install OpenSSL (required by Prisma on Debian slim)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --only=production && npx prisma generate

# Copy ALL source files
COPY . .

# Remove files that should not be in the image
RUN rm -rf .env .env.local tests/ docs/ *.log

# Create uploads dir for fallback
RUN mkdir -p public/uploads

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server.js"]
