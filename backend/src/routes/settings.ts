import { Elysia } from "elysia";
import { requireAuth, getUser } from "../middleware/auth.middleware";
import { settingsService } from "../services/settings.service";

export const settingsRoutes = new Elysia({ prefix: "/settings" })
  .use(requireAuth)
  .get("/", async ({ headers }) => {
    const user = await getUser(headers.cookie);
    if (!user) return { error: "User not found" };
    return await settingsService.getSettings(user.id);
  })
  .post("/", async ({ headers, body, set }) => {
    const user = await getUser(headers.cookie);
    if (!user) return { error: "User not found" };

    const newSettings = body as Record<string, any>;
    
    // Validate
    if (!newSettings || typeof newSettings !== 'object') {
      set.status = 400;
      return { error: "Invalid body" };
    }

    const updated = await settingsService.updateSettings(user.id, newSettings);
    return updated;
  });
