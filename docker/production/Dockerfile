# Image production (feature 38) — satu Dockerfile multi-stage, satu target per service:
#   docker build -f docker/production/Dockerfile --target api|worker|web|migrate .
# Dipakai docker-compose.prod.yml. Image dev bersama tetap di ./Dockerfile.

FROM node:24-alpine AS base
RUN npm install -g pnpm@11.9.0
WORKDIR /repo

# ---- deps: install semua dependency (dev ikut — dibutuhkan untuk build) ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/payroll-engine/package.json packages/payroll-engine/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile

# ---- build: semua workspace + bundle deploy per app ----
FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Next.js standalone (lihat next.config.ts) — server minimal tanpa node_modules penuh
ENV NEXT_OUTPUT_STANDALONE=1
RUN pnpm build
# Hanya dependency production + paket workspace (disalin sebagai file, bukan symlink).
# --legacy: workspace ini tidak memakai inject-workspace-packages (dev tetap symlink agar watch paket bersama jalan).
RUN pnpm --filter @exapay/api deploy --legacy --prod /deploy/api \
 && pnpm --filter @exapay/worker deploy --legacy --prod /deploy/worker \
 && rm -rf /deploy/api/src /deploy/api/test /deploy/worker/src /deploy/worker/test

# ---- runtime bersama: non-root, tanpa pnpm ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
USER node

# ---- api ----
FROM runtime AS api
COPY --from=build --chown=node:node /deploy/api ./
EXPOSE 4000
CMD ["node", "dist/main.js"]

# ---- worker ----
FROM runtime AS worker
COPY --from=build --chown=node:node /deploy/worker ./
CMD ["node", "dist/main.js"]

# ---- web (Next.js standalone) ----
FROM runtime AS web
ENV NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# ---- migrate: one-shot drizzle-kit migrate (role app_owner via DATABASE_MIGRATION_URL) ----
# Memakai stage build (drizzle-kit adalah devDependency). Binary dipanggil langsung — `pnpm run` di container
# menolak jalan (cek dependency tanpa TTY). Juga dipakai untuk skrip admin, mis.
#   docker compose -f docker-compose.prod.yml --env-file .env.production run --rm migrate \
#     node /repo/apps/api/dist/scripts/create-super-admin.js --email … --name …
FROM build AS migrate
WORKDIR /repo/packages/db
CMD ["node_modules/.bin/drizzle-kit", "migrate"]
