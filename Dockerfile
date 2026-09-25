FROM oven/bun:1.4.2 AS build
WORKDIR /app
ENV NITRO_PRESET=node-server
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build \
  && bun build scripts/migrate.mjs --target=node --outfile=.output/migrate.mjs

FROM node:24.21.0-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --chown=node:node scripts/start.mjs ./scripts/start.mjs
USER node
EXPOSE 3000
CMD ["node", "scripts/start.mjs"]
