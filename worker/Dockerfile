# syntax=docker/dockerfile:1
# AI worker image (docs/crm-v1/WORKER-IA.md). Built on the VPS by scripts/deploy-ai-worker.sh from a small context:
# the bundle (dist/), the Prisma schema and this file. The Prisma client is generated here, for the image's platform.
# E23 adds the Studio Web's browser: Chromium's headless shell, installed by Playwright, and axe-core.

FROM node:24-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY package.json schema.prisma ./
RUN npm install --omit=dev --no-audit --no-fund --ignore-scripts && npx prisma generate --schema=schema.prisma

FROM node:24-bookworm-slim
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY --from=deps /build/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps /build/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=deps /build/node_modules/playwright-core ./node_modules/playwright-core
COPY --from=deps /build/node_modules/axe-core ./node_modules/axe-core
# The headless shell only (no full browser), with the system libraries and fonts it needs.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && node node_modules/playwright-core/cli.js install --with-deps --only-shell --no-progress chromium \
  && rm -rf /var/lib/apt/lists/* /tmp/* /root/.cache
COPY dist ./dist
USER node
HEALTHCHECK --interval=15s --timeout=6s --start-period=20s --retries=3 CMD ["node", "dist/healthcheck.mjs"]
CMD ["node", "--enable-source-maps", "--disable-warning=DEP0040", "dist/main.mjs"]
