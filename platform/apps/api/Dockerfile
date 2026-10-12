# syntax=docker/dockerfile:1.7
# Build from the platform/ directory:  docker build -f apps/api/Dockerfile -t ship-api .
FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

FROM base AS build
COPY tsconfig.base.json ./
RUN pnpm install --frozen-lockfile --filter "@ship/api..." --ignore-scripts
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @ship/shared build && pnpm --filter @ship/api build

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter "@ship/api..." --ignore-scripts

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /repo
RUN useradd --system --uid 10001 ship
COPY --from=prod-deps /repo /repo
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY apps/api/migrations apps/api/migrations
WORKDIR /repo/apps/api
USER ship
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
