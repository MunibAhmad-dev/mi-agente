# ===========================================
# Mi LibreChat - Dockerfile
# Multi-stage build for production
# ===========================================

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    curl

# Copy package files
COPY api/package*.json ./

# Install dependencies
RUN npm ci --only=production --ignore-scripts

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY api/package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY api/ ./api/
COPY frontend/ ./frontend/

# Build frontend
WORKDIR /app/frontend
RUN npm ci && npm run build

# Return to API directory
WORKDIR /app/api

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    tzdata

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 librechat

# Set production environment
ENV NODE_ENV=production
ENV PORT=3001

# Copy built frontend from builder
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY --from=builder /app/frontend/package.json ./frontend/

# Copy API source
COPY --from=builder /app/api ./api

# Copy only production node_modules
COPY --from=deps /app/node_modules ./node_modules

# Set ownership
RUN chown -R librechat:nodejs /app

# Switch to non-root user
USER librechat

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

# Use dumb-init to handle signals
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "api/server/index.js"]
