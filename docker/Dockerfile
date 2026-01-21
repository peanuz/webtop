# WebTop Dockerfile
# Supports ARM64 (Raspberry Pi) and AMD64

# Build arguments for versioning
ARG WEBTOP_VERSION=0.1.0
ARG DOCKER_REPOSITORY=peanuz/webtop
ARG DOCKER_TAG=alpha

FROM oven/bun:1.3-alpine AS base
WORKDIR /app

# Install system dependencies for terminal and development tools
RUN apk add --no-cache \
    bash \
    zsh \
    git \
    curl \
    wget \
    openssh-client \
    vim \
    nano \
    htop \
    ncurses \
    nodejs \
    npm \
    python3 \
    make \
    g++ \
    && npm install -g @anthropic-ai/claude-code \
    && rm -rf /root/.npm

# Install dependencies (production only)
FROM base AS deps
COPY backend/package.json ./
COPY backend/bun.lock* ./
RUN bun install --frozen-lockfile --production

# Development image (includes devDependencies)
FROM base AS development

# Create non-root user with proper home directory
RUN addgroup -g 1001 -S webtop && \
    adduser -S -u 1001 -G webtop -h /home/webtop -s /bin/zsh webtop && \
    mkdir -p /home/webtop && \
    chown -R webtop:webtop /home/webtop

# Copy shell config
COPY docker/zshrc /home/webtop/.zshrc
RUN chown webtop:webtop /home/webtop/.zshrc

WORKDIR /app/backend
COPY backend/package.json ./
COPY backend/bun.lock* ./
RUN bun install --frozen-lockfile

WORKDIR /app

# Create data directories
RUN mkdir -p data/user-files && \
    chown -R webtop:webtop /app

USER webtop
ENV HOME=/home/webtop
ENV SHELL=/bin/zsh
EXPOSE 3000
ENV NODE_ENV=development

CMD ["bun", "--watch", "backend/src/index.ts"]

# Production image
FROM base AS runner

# Re-declare ARGs for this stage
ARG WEBTOP_VERSION=0.1.0
ARG DOCKER_REPOSITORY=peanuz/webtop
ARG DOCKER_TAG=alpha

# Add labels for versioning
LABEL org.opencontainers.image.title="WebTop"
LABEL org.opencontainers.image.description="WebTop - Modern Web Desktop Environment"
LABEL org.opencontainers.image.version="${WEBTOP_VERSION}"
LABEL org.opencontainers.image.source="https://github.com/peanuz/webtop"
LABEL version="${WEBTOP_VERSION}"

# Create non-root user with proper home directory
RUN addgroup -g 1001 -S webtop && \
    adduser -S -u 1001 -G webtop -h /home/webtop -s /bin/zsh webtop && \
    mkdir -p /home/webtop && \
    chown -R webtop:webtop /home/webtop

# Copy shell config
COPY docker/zshrc /home/webtop/.zshrc
RUN chown webtop:webtop /home/webtop/.zshrc

WORKDIR /app

# Copy dependencies
COPY --from=deps --chown=webtop:webtop /app/node_modules ./backend/node_modules

# Copy backend source (preserve structure for relative paths)
COPY --chown=webtop:webtop backend/src ./backend/src
COPY --chown=webtop:webtop backend/wallpapers ./backend/wallpapers
COPY --chown=webtop:webtop backend/package.json ./backend/
COPY --chown=webtop:webtop backend/drizzle.config.ts ./backend/

# Copy frontend (same level as backend for relative path resolution)
COPY --chown=webtop:webtop frontend ./frontend

# Create data directories
RUN mkdir -p data/user-files && \
    chown -R webtop:webtop data

USER webtop
ENV HOME=/home/webtop
ENV SHELL=/bin/zsh

EXPOSE 3000

ENV NODE_ENV=production
ENV WEBTOP_VERSION=${WEBTOP_VERSION}
ENV DOCKER_REPOSITORY=${DOCKER_REPOSITORY}
ENV DOCKER_TAG=${DOCKER_TAG}

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/system/health || exit 1

CMD ["bun", "run", "backend/src/index.ts"]
