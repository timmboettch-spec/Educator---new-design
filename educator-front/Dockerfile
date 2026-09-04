# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Use placeholder that will be replaced at runtime
ENV VITE_API_URL=__VITE_API_URL_PLACEHOLDER__
RUN npm run build

# Production stage
FROM node:20-alpine
RUN npm install -g serve@14 \
    && addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app
COPY --from=builder --chown=appuser:appgroup /app/dist .
COPY --chown=appuser:appgroup docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000

# / is only writable by root, so the entrypoint's `sed -i` on /app/*.js
# needs appuser ownership of /app (set above) — the entrypoint itself
# stays root-executable since it only touches files it now owns.
USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO /dev/null http://localhost:3000/ || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["serve", "-s", ".", "-l", "3000"]