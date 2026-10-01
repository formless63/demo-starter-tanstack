FROM oven/bun:1.4.2 AS build
WORKDIR /app
ENV NITRO_PRESET=node-server
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build \
  && bun build scripts/migrate.mjs --target=node --outfile=.output/migrate.mjs \
  && bun build scripts/jobs-migrate.ts --target=node --outfile=.output/jobs-migrate.mjs \
  && bun build scripts/jobs-doctor.ts --target=node --outfile=.output/jobs-doctor.mjs \
  && bun build scripts/jobs-smoke.ts --target=node --outfile=.output/jobs-smoke.mjs \
  && bun build scripts/jobs-worker.ts --target=node --outfile=.output/jobs-worker.mjs \
  && bun build scripts/webhooks-smoke.ts --target=node --outfile=.output/webhooks-smoke.mjs \
  && bun build scripts/notifications-smoke.ts --target=node --outfile=.output/notifications-smoke.mjs \
  && bun build scripts/storage-check.ts --target=node --outfile=.output/storage-check.mjs \
  && bun build scripts/storage-smoke.ts --target=node --outfile=.output/storage-smoke.mjs \
  && bun build scripts/email-check.ts --target=node --outfile=.output/email-check.mjs \
  && bun build scripts/email-smoke.ts --target=node --outfile=.output/email-smoke.mjs \
  && bun build scripts/ai-reference-smoke.ts --target=node --outfile=.output/ai-reference-smoke.mjs

FROM node:24.21.0-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --chown=node:node scripts/start.mjs ./scripts/start.mjs
USER node
EXPOSE 3000
CMD ["node", "scripts/start.mjs"]
