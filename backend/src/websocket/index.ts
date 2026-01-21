import { Elysia } from "elysia";
import { terminalWebSocket } from "./terminal";
import { claudeWebSocket } from "./claude";

export const websocketRoutes = new Elysia()
  .use(terminalWebSocket)
  .use(claudeWebSocket);
