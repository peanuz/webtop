import { Elysia } from "elysia";
import { authRoutes } from "./auth";
import { systemRoutes } from "./system";
import { fsRoutes } from "./fs";
import { settingsRoutes } from "./settings";
import { claudeRoutes } from "./claude";
import { agentRoutes } from "./agent";
import { proxyRoutes } from "./proxy";

export const apiRoutes = new Elysia({ prefix: "/api/v1" })
  .use(authRoutes)
  .use(systemRoutes)
  .use(fsRoutes)
  .use(settingsRoutes)
  .use(claudeRoutes)
  .use(agentRoutes)
  .use(proxyRoutes);
