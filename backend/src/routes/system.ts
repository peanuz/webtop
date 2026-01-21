import { Elysia } from "elysia";
import { readdir } from "node:fs/promises";
import { join } from "path";
import { config } from "../config";
import { updateService } from "../services/update.service";

export const systemRoutes = new Elysia({ prefix: "/system" })
  .get("/health", () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  })
  .get("/info", () => {
    return {
      name: "WebTop",
      version: config.docker.version,
      runtime: "Bun",
      bunVersion: Bun.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: "MB",
      },
      docker: {
        repository: config.docker.repository,
        tag: config.docker.tag,
      },
    };
  })
  // Update endpoints
  .get("/update/status", () => {
    return updateService.getStatus();
  })
  .post("/update/check", async () => {
    const status = await updateService.checkForUpdates();
    return status;
  })
  .post("/update/install", async () => {
    const result = await updateService.triggerUpdate();
    return result;
  })
  .get("/wallpapers", async () => {
      const wallpapersDir = join(import.meta.dir, "../../wallpapers");
      try {
          const files = await readdir(wallpapersDir);
          // Filter image files
          const images = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
          return images.map(img => `/wallpapers/${img}`);
      } catch (e) {
          console.error("Failed to list wallpapers:", e);
          return [];
      }
  });