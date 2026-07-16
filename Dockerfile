FROM node:20-alpine AS base
# Install git for git operations and python/make/g++ for node-gyp if needed
RUN apk add --no-cache git python3 make g++

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY . .
# Install all dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# Build the API
RUN pnpm --filter @chronocode/api build

FROM base AS runner
WORKDIR /app
COPY --from=builder /app /app

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Start the API
CMD ["pnpm", "--filter", "@chronocode/api", "start"]
