FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
RUN npm ci

# Copy prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code
COPY . .

# Build the Next.js application
RUN npm run build

# --- Production Image ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy necessary files from builder
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/audio-registry.json ./audio-registry.json
# Copy any local audio files that might be placed in the project root
# Copy any local audio files that might be placed in the project safely
COPY --from=builder /app/package.json /app/audio* ./audio/

# Install only production dependencies required for Prisma
COPY package.json package-lock.json ./
RUN npm ci --only=production

EXPOSE 3000

# Start the standalone Next.js server
CMD ["node", "server.js"]
