# Image development bersama untuk api, web, worker (satu build, beda command).
# Image production yang ramping dibuat di feature 38.
FROM node:24-alpine
RUN npm install -g pnpm@11.9.0
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/payroll-engine/package.json packages/payroll-engine/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build
