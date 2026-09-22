FROM oven/bun:1.3.14 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build
RUN test -f .next/server/app/api/compose/route.js

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080

CMD ["bun", "run", "start"]
