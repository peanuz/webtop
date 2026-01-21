import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { join, extname } from "path";
import { apiRoutes } from "./routes";
import { websocketRoutes } from "./websocket";
import { initDatabase } from "./db";
import { config } from "./config";
import { fsService } from "./services/fs.service";

// Initialize database
await initDatabase();
// Initialize directories
await fsService.initDefaultDirectories();

// Resolve frontend path relative to this file
const frontendPath = join(import.meta.dir, "../../frontend");

// MIME types
const mimeTypes: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

// Helper to serve a file
async function serveFile(filePath: string, set: any) {
  const fullPath = join(frontendPath, filePath);
  const file = Bun.file(fullPath);

  if (!(await file.exists())) {
    set.status = 404;
    return { error: "Not found" };
  }

  const ext = extname(filePath).toLowerCase();
  set.headers["content-type"] = mimeTypes[ext] || "application/octet-stream";

  if (config.isDev) {
    set.headers["cache-control"] = "no-cache, no-store, must-revalidate";
  }

  return file;
}

const app = new Elysia()
  // CORS for development
  .use(
    cors({
      origin: config.isDev ? true : false,
      credentials: true,
    })
  )
  // API routes first
  .use(apiRoutes)
  // WebSocket routes
  .use(websocketRoutes)
  // Clean URL routes
  .get("/", async ({ set }) => {
    return serveFile("index.html", set);
  })
  .get("/login", async ({ set }) => {
    return serveFile("login.html", set);
  })
  // Serve wallpapers
  .get("/wallpapers/*", async ({ params, set }) => {
    const fileName = params["*"];
    // Resolve relative to this file (src/index.ts) -> ../wallpapers
    const filePath = join(import.meta.dir, "../wallpapers", fileName);
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      set.status = 404;
      return { error: "Not found" };
    }

    const ext = extname(fileName).toLowerCase();
    set.headers["content-type"] = mimeTypes[ext] || "application/octet-stream";
    set.headers["cache-control"] = "public, max-age=86400"; // Cache for 1 day

    return file;
  })
  // Serve static files (css, js, etc.)
  .get("/*", async ({ params, set }) => {
    const filePath = params["*"];

    // Skip if empty or looks like a clean route
    if (!filePath || filePath === "") {
      return serveFile("index.html", set);
    }

    // If it has an extension, serve as static file
    if (filePath.includes(".")) {
      return serveFile(filePath, set);
    }

    // Otherwise treat as SPA route - serve index.html
    return serveFile("index.html", set);
  })
  // Global error handler
  .onError(({ code, error, set }) => {
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: "Not found" };
    }

    console.error(`Error [${code}]:`, error);

    if (code === "VALIDATION") {
      set.status = 400;
      return { error: "Validation error", details: error.message };
    }

    set.status = 500;
    return { error: "Internal server error" };
  })
  .listen(config.port);

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   WebTop Backend v0.1.0                                   ║
║                                                           ║
║   Server running at: http://localhost:${config.port}                ║
║   Environment: ${config.isDev ? "development" : "production"}                              ║
║   Runtime: Bun ${Bun.version}                                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);

export type App = typeof app;
