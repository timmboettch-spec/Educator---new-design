# ---- builder ----
FROM node:20-alpine AS builder
WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# ---- runtime ----
FROM node:20-alpine AS runtime

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY --chown=appuser:appgroup package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY --from=builder --chown=appuser:appgroup /build/dist ./dist
COPY --from=builder --chown=appuser:appgroup /build/src/mock ./dist/mock

RUN mkdir -p uploads && chown appuser:appgroup uploads

ENV NODE_ENV=production
ENV APP_PORT=3000
# REDIS_HOST / REDIS_PORT are supplied by the Container App definition
# (infra/modules/containerApp-backend.bicep) — Redis runs as a sidecar
# container in the same revision, reachable over the shared pod network
# at 127.0.0.1, not baked into this image.

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

CMD ["sh", "-c", "npm run typeorm:prod -- migration:run && npm run seed:roles && exec node dist/main.js"]