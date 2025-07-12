# Multi-stage build for SWE-Bench Swarm Coordinator
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Add non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S coordinator -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=coordinator:nodejs /app/dist ./dist
COPY --from=builder --chown=coordinator:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=coordinator:nodejs /app/package*.json ./

# Create necessary directories
RUN mkdir -p /app/logs && chown coordinator:nodejs /app/logs

# Switch to non-root user
USER coordinator

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "dist/index.js"]