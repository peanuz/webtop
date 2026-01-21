import { Elysia } from "elysia";
import { auth } from "../services/auth.service";

/**
 * Auth guard - returns 401 if not authenticated
 * Use: .use(requireAuth) on protected routes
 */
export const requireAuth = new Elysia({ name: "require-auth" }).onBeforeHandle(
  async ({ headers, set }) => {
    const sessionId = auth.parseSessionCookie(headers.cookie);
    const user = await auth.validateSession(sessionId!);

    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    // Continue to handler
  }
);

/**
 * Get current user from session (or null)
 * Use in handlers: const user = await getUser(headers.cookie)
 */
export async function getUser(cookieHeader: string | undefined) {
  const sessionId = auth.parseSessionCookie(cookieHeader);
  return auth.validateSession(sessionId!);
}
