# ─── Stage 1: Build CMS ───────────────────────────────────────────────────────
FROM node:18-alpine AS cms-builder

WORKDIR /app/cms

COPY cms/package*.json ./
RUN npm ci

COPY cms/ ./
RUN npm run build

# ─── Stage 2: Production image ────────────────────────────────────────────────
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/
COPY --from=cms-builder /app/cms/out ./cms/out

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001 && \
    chown -R nodeuser:nodejs /app

USER nodeuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "src/index.js"]
