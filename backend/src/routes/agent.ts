import { Elysia, t } from "elysia";
import { requireAuth } from "../middleware/auth.middleware";
import { agentService } from "../services/agent.service";

export const agentRoutes = new Elysia({ prefix: "/agent" })
  .use(requireAuth)
  .post("/chat", async ({ body, set }) => {
    const { message, projectPath, model } = body as any;

    if (!message || !projectPath) {
      set.status = 400;
      return { error: "Missing required fields" };
    }

    try {
      const stream = await agentService.chat({
        message,
        projectPath,
        model,
      });

      return stream;
    } catch (e: any) {
      set.status = 500;
      return { error: e.message };
    }
  });
