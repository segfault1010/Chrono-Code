# Dockerfile for chronocode API
# Usage: docker build -f apps/api/Dockerfile -t chronocode-api .

FROM node:20-alpine

# Install git and other necessary tools
RUN apk add --no-cache git

# Set working directory
WORKDIR /app

# Copy root package.json and pnpm-lock (if exists)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/

# Install pnpm
RUN npm install -g pnpm

# Install dependencies for the workspace
RUN pnpm install

# Copy source code
COPY apps/api/ ./apps/api/
COPY packages/shared-types/ ./packages/shared-types/

# Build shared types
WORKDIR /app/packages/shared-types
RUN pnpm run build

# Build API
WORKDIR /app/apps/api
RUN pnpm run build

# Expose API port
EXPOSE 3001

# Start the API
CMD ["pnpm", "start"]
