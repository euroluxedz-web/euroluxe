FROM node:22-slim AS builder

WORKDIR /app

# Install system dependencies needed for Puppeteer/Chromium
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    libxkbcommon0 \
    libxshmfence1 \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Receive NEXT_PUBLIC_ env vars as build args (Railway auto-passes them)
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
ARG TEMU_COOKIES
ARG BRD_USER
ARG BRD_PASS
ARG RATE
ARG SEARCHAPI_KEY
ARG APIFY_API_TOKEN

# Export them as ENV so they're available during npm run build
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=$NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
ENV TEMU_COOKIES=$TEMU_COOKIES
ENV BRD_USER=$BRD_USER
ENV BRD_PASS=$BRD_PASS
ENV RATE=$RATE
ENV SEARCHAPI_KEY=$SEARCHAPI_KEY
ENV APIFY_API_TOKEN=$APIFY_API_TOKEN

# Copy package files
COPY package*.json ./

# Copy prisma schema (needed for prisma generate during install/build)
COPY prisma ./prisma

# Install all dependencies (postinstall runs prisma generate)
RUN npm install --legacy-peer-deps --no-audit --no-fund

# Copy source code
COPY . .

# Build the Next.js app (includes prisma generate via build script)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build:raw

# Download Chromium for Puppeteer
RUN npx puppeteer browsers install chrome --path /app/.browser-cache

# Production stage
FROM node:22-slim AS runner

WORKDIR /app

# Install runtime dependencies for Chromium
RUN apt-get update && apt-get install -y \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    libxkbcommon0 \
    libxshmfence1 \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Receive runtime env vars (Railway passes these automatically at runtime)
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
ARG ZAI_TOKEN
ARG ZAI_API_KEY
ARG ADMIN_EMAIL
ARG NEXT_PUBLIC_OCR_API_KEY
ARG SEARCHAPI_KEY
ARG ADMIN_KEY

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV PUPPETEER_CACHE_DIR=/app/.browser-cache
ENV ZAI_TOKEN=$ZAI_TOKEN
ENV ZAI_API_KEY=$ZAI_API_KEY
ENV ADMIN_EMAIL=$ADMIN_EMAIL
ENV NEXT_PUBLIC_OCR_API_KEY=$NEXT_PUBLIC_OCR_API_KEY
ENV SEARCHAPI_KEY=$SEARCHAPI_KEY
ENV ADMIN_KEY=$ADMIN_KEY

# Create .z-ai-config file so the z-ai-web-dev-sdk can authenticate
# The config is read from cwd ($HOME or /app) at runtime
RUN echo '{' > /app/.z-ai-config && \
    echo '  "baseUrl": "https://internal-api.z.ai/v1",' >> /app/.z-ai-config && \
    echo '  "apiKey": "Z.ai",' >> /app/.z-ai-config && \
    echo '  "token": "'"$ZAI_TOKEN"'",' >> /app/.z-ai-config && \
    echo '  "chatId": "chat-e75f7106-3d39-4630-81be-37e65a84e9f2",' >> /app/.z-ai-config && \
    echo '  "userId": "8d7a9a03-e90a-4343-9861-5c38c7feb919"' >> /app/.z-ai-config && \
    echo '}' >> /app/.z-ai-config

# Also write to home directory in case cwd changes
RUN cp /app/.z-ai-config /root/.z-ai-config 2>/dev/null || true

# Copy necessary files from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/.browser-cache ./.browser-cache
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/start.sh ./start.sh

# Entrypoint: apply DB schema (idempotent) then start Next.js
RUN chmod +x ./start.sh

EXPOSE 3000

CMD ["./start.sh"]
