# Website image: builds the React app, then serves it with Nginx, which also forwards
# /api, /uploads, /socket.io and the health checks to the API container.
FROM node:20-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VITE_RAZORPAY_KEY_ID=""
ARG VITE_GOOGLE_MAPS_API_KEY=""
# Same domain as the API, so a relative URL is enough
ENV VITE_API_URL=/api/v1 \
    VITE_RAZORPAY_KEY_ID=$VITE_RAZORPAY_KEY_ID \
    VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/vps/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/vps/security-headers.conf /etc/nginx/snippets/zivo-security-headers.conf
COPY --from=build /src/dist /usr/share/nginx/html
