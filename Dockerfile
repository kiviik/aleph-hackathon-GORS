# Atelier canonical frontend (Next.js). Multi-stage: install → build → run.
#
# IMPORTANT: NEXT_PUBLIC_* vars are baked into the browser bundle at BUILD time.
# The browser (not the container) calls the API, so ATELIER_API must be the URL
# reachable from the USER'S browser (e.g. http://localhost:8000), passed as a
# build arg — NOT the docker-internal service name.
#
# Build:  docker build --build-arg NEXT_PUBLIC_ATELIER_API=http://localhost:8000 -t atelier-web .
# (Validate with `docker compose up` — not yet run in CI.)

FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
ARG NEXT_PUBLIC_ATELIER_API=http://localhost:8000
ARG NEXT_PUBLIC_ATELIER_BRAND=
ENV NEXT_PUBLIC_ATELIER_API=$NEXT_PUBLIC_ATELIER_API
ENV NEXT_PUBLIC_ATELIER_BRAND=$NEXT_PUBLIC_ATELIER_BRAND
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:20-alpine AS run
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.mjs ./next.config.mjs
EXPOSE 3000
CMD ["pnpm", "start"]
