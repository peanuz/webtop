export const config = {
  port: Number(Bun.env.PORT) || 3000,
  jwtSecret: Bun.env.JWT_SECRET || "webtop-dev-secret-change-in-production",
  jwtExpiry: "7d",
  adminUsername: Bun.env.ADMIN_USERNAME || "admin",
  adminPassword: Bun.env.ADMIN_PASSWORD || "admin123",
  dataDir: "./data",
  userFilesDir: "./data/user-files",
  isDev: Bun.env.NODE_ENV !== "production",
  // Docker Update Configuration
  docker: {
    repository: Bun.env.DOCKER_REPOSITORY || "peanuz/webtop",
    tag: Bun.env.DOCKER_TAG || "alpha",
    // Current version from VERSION file or env
    version: Bun.env.WEBTOP_VERSION || "0.1.0",
    // Auto-check interval in hours (default: 24)
    updateCheckInterval: Number(Bun.env.UPDATE_CHECK_INTERVAL) || 24,
  },
} as const;
