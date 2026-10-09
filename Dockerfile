# ── Stage 1: build client ────────────────────────────────────────────────────
FROM node:20-alpine AS client-build

WORKDIR /app
COPY package*.json ./
COPY packages/ ./packages/
COPY client/ ./client/

RUN npm ci --workspace=client --workspace=packages/data-provider \
           --workspace=packages/data-schemas --workspace=packages/client \
           --ignore-scripts

WORKDIR /app/client
RUN npm run build

# ── Stage 2: production backend ──────────────────────────────────────────────
FROM node:20-alpine AS production

# Chromium deps for Playwright (BrowserRuntime)
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
      ffmpeg \
      curl

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_BROWSERS_PATH=/usr/bin \
    NODE_ENV=production

WORKDIR /app

# Install only API + shared packages (skip devDeps)
COPY package*.json ./
COPY packages/ ./packages/
COPY api/ ./api/

RUN npm ci --workspace=api --workspace=packages/data-provider \
           --workspace=packages/data-schemas --workspace=packages/api \
           --omit=dev --ignore-scripts

# Install playwright npm package (no browser download — uses system chromium from apk)
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-save playwright@1.56.1

# Copy built frontend so backend can serve it
COPY --from=client-build /app/client/dist ./client/dist

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3080}/health || exit 1

EXPOSE 3080

CMD ["node", "api/server/index.js"]
