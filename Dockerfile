FROM oven/bun:1.4.2 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM node:24.21.0-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY --from=build /app/.output ./.output
COPY scripts/start.mjs ./scripts/start.mjs
EXPOSE 3000
CMD ["node", "scripts/start.mjs"]
