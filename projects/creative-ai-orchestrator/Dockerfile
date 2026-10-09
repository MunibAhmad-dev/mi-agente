# ============================================================================
# Creative AI Orchestrator — Dockerfile
# ============================================================================
# Multi-stage build for minimal production image.
# Stage 1: Build TypeScript + Go binary
# Stage 2: Production image with Node.js + ffmpeg
# ============================================================================

# === Stage 1: Build ===
FROM node:22-slim AS builder

# Install Go for building the helper binary
RUN apt-get update && apt-get install -y wget && \
    wget -q https://go.dev/dl/go1.22.5.linux-amd64.tar.gz -O /tmp/go.tar.gz && \
    tar -C /usr/local -xzf /tmp/go.tar.gz && \
    rm /tmp/go.tar.gz
ENV PATH="/usr/local/go/bin:${PATH}"

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/
COPY cmd/ ./cmd/
COPY ui/ ./ui/

# Build TypeScript
RUN npx tsc

# Build Go binary
RUN cd cmd/caiotool && go build -o ../../dist/caiotool .

# === Stage 2: Production ===
FROM node:22-slim AS production

# Install ffmpeg for video processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/dist/ ./dist/
COPY --from=builder /app/node_modules/ ./node_modules/
COPY --from=builder /app/ui/ ./ui/
COPY --from=builder /app/package.json ./

# Copy Go binary
RUN mkdir -p /usr/local/bin
COPY --from=builder /app/dist/caiotool /usr/local/bin/caiotool

# Create data directories
RUN mkdir -p /data/projects /data/models /data/cache /data/logs

# Environment
ENV NODE_ENV=production
ENV PORT=3456
ENV HOST=0.0.0.0
ENV DATA_DIR=/data

EXPOSE 3456

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:3456/api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
