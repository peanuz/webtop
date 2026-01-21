import { Elysia, t } from "elysia";
import { proxyService } from "../services/proxy.service";

export const proxyRoutes = new Elysia({ prefix: "/proxy" })
  .get("/", async ({ query, headers, set }) => {
    const url = query.url;

    if (!url) {
      set.status = 400;
      return "URL parameter is required";
    }

    // Basic URL validation
    if (!url.startsWith("http")) {
      set.status = 400;
      return "Invalid URL protocol. Use http or https.";
    }

    return await proxyService.fetchAndRewrite(url, headers);
  });
