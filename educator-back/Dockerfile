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
COPY --chown=appuser:appgroup migrate.sh seed.sh ./

RUN mkdir -p uploads && chown appuser:appgroup uploads

# ffmpeg/ffprobe validate and normalise uploaded voice-profile reference audio
# (src/common/services/audio-normalizer.service.ts). Installed from apk, not
# ffmpeg-static: both npm ci runs use --ignore-scripts, which would skip its
# binary download.
RUN apk add --no-cache ffmpeg

ENV NODE_ENV=production
ENV APP_PORT=3000
# REDIS_HOST / REDIS_PORT / REDIS_PASSWORD (via Key Vault secretRefs) and
# REDIS_TLS (plain value) are supplied by the Container App definition
# (infra/modules/containerApp-backend.bicep) — Redis is a managed Azure
# Managed Redis instance (infra/modules/redisCache.bicep), not baked into
# this image.

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

# Migrations + seeders do NOT run at container start. They run as a separate
# Container Apps Job (migrate.sh && seed.sh, see infra/modules/containerAppsJob-migrate.bicep)
# triggered by the deploy pipeline before the new revision takes traffic.
CMD ["node", "dist/main.js"]
