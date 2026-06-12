# Multi-stage build for backend
FROM node:18-alpine AS backend-builder

WORKDIR /app/backend

# Copy backend package files
COPY backend/package*.json ./
RUN npm ci --only=production

# Copy backend source
COPY backend/src ./src
COPY backend/uploads ./uploads
COPY backend/logs ./logs

# Production stage
FROM node:18-alpine

WORKDIR /app

# Create necessary directories
RUN mkdir -p /app/backend/uploads /app/backend/logs /app/backend/database

# Copy backend from builder
COPY --from=backend-builder /app/backend /app/backend

# Copy frontend build (will be built separately)
COPY frontend/dist /app/frontend/dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Start backend server
WORKDIR /app/backend
CMD ["node", "src/server.js"]