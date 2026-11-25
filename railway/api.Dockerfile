FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json

FROM base AS dependencies
RUN pnpm install --frozen-lockfile --prod --filter @playable-factory/api...

FROM base AS build
RUN pnpm install --frozen-lockfile --filter @playable-factory/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm build:api

FROM dependencies AS runtime
ENV NODE_ENV=production DEMO_MODE=true CORPUS_PATH=demo-corpus COREPACK_ENABLE_NETWORK=0
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist/config apps/api/dist/config
COPY --from=build /app/apps/api/dist/db apps/api/dist/db
COPY --from=build /app/apps/api/dist/middleware apps/api/dist/middleware
COPY --from=build /app/apps/api/dist/routes apps/api/dist/routes
COPY --from=build /app/apps/api/dist/services apps/api/dist/services
COPY --from=build /app/apps/api/dist/utils apps/api/dist/utils
COPY --from=build /app/apps/api/dist/app.js /app/apps/api/dist/index.js apps/api/dist/
COPY --from=build /app/apps/api/dist/scripts/ingest.js /app/apps/api/dist/scripts/init-demo.js apps/api/dist/scripts/
COPY apps/api/drizzle apps/api/drizzle
COPY demo-corpus demo-corpus
USER node
CMD ["node", "apps/api/dist/index.js"]
