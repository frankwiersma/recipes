# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
COPY web/package.json web/bun.lock ./web/

# Install dependencies
RUN bun install --frozen-lockfile
RUN cd web && bun install --frozen-lockfile

# Copy source code
COPY . .

# Build frontend
RUN cd web && bun run build

# Production stage
FROM oven/bun:1-slim

WORKDIR /app

# Copy package files and install production dependencies
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

# Copy built app
COPY --from=builder /app/src ./src
COPY --from=builder /app/web/dist ./web/dist
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/raw-note.md ./

# Create data directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Start the server
CMD ["bun", "run", "src/index.ts"]
