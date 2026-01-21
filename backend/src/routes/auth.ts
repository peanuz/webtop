import { Elysia, t } from "elysia";
import { auth } from "../services/auth.service";
import { requireAuth, getUser } from "../middleware/auth.middleware";

export const authRoutes = new Elysia({ prefix: "/auth" })
  // Check if setup is needed (no user exists)
  .get("/status", async () => {
    const hasUser = await auth.hasUser();
    return { hasUser, needsSetup: !hasUser };
  })

  // Signup (first user only)
  .post(
    "/signup",
    async ({ body, set }) => {
      const result = await auth.createUser(body.username, body.password);

      if (!result.success) {
        set.status = 400;
        return { error: result.error };
      }

      // Auto-login after signup
      const loginResult = await auth.login(body.username, body.password);
      if (!loginResult.success) {
        set.status = 500;
        return { error: "Signup succeeded but login failed" };
      }

      set.headers["set-cookie"] = auth.createCookieHeader(loginResult.sessionId!);
      return { success: true, user: loginResult.user };
    },
    {
      body: t.Object({
        username: t.String({ minLength: 3 }),
        password: t.String({ minLength: 6 }),
      }),
    }
  )

  // Check if user has TOTP enabled (for login flow)
  .post(
    "/totp/check",
    async ({ body }) => {
      const required = await auth.hasTOTPEnabled(body.username);
      return { totpRequired: required };
    },
    {
      body: t.Object({
        username: t.String({ minLength: 1 }),
      }),
    }
  )

  // Login (supports TOTP)
  .post(
    "/login",
    async ({ body, set }) => {
      // Check if TOTP is required
      const totpRequired = await auth.hasTOTPEnabled(body.username);

      if (totpRequired && !body.totpCode) {
        set.status = 401;
        return { error: "2FA code required", totpRequired: true };
      }

      const result = await auth.loginWithTOTP(
        body.username,
        body.password,
        body.totpCode || ""
      );

      if (!result.success) {
        set.status = 401;
        return { error: result.error };
      }

      set.headers["set-cookie"] = auth.createCookieHeader(result.sessionId!);
      return { success: true, user: result.user };
    },
    {
      body: t.Object({
        username: t.String({ minLength: 1 }),
        password: t.String({ minLength: 1 }),
        totpCode: t.Optional(t.String()),
      }),
    }
  )

  // Logout
  .post("/logout", async ({ headers, set }) => {
    const sessionId = auth.parseSessionCookie(headers.cookie);
    if (sessionId) {
      await auth.logout(sessionId);
    }
    set.headers["set-cookie"] = auth.createCookieRemovalHeader();
    return { success: true };
  })

  // Check current session
  .get("/session", async ({ headers }) => {
    const sessionId = auth.parseSessionCookie(headers.cookie);
    const user = await auth.validateSession(sessionId!);

    if (!user) {
      return { authenticated: false };
    }

    return { authenticated: true, user };
  })

  // Protected routes (require authentication)
  .use(requireAuth)

  // Change password
  .put(
    "/password",
    async ({ body, headers, set }) => {
      const user = await getUser(headers.cookie);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const result = await auth.changePassword(
        user.id,
        body.currentPassword,
        body.newPassword
      );

      if (!result.success) {
        set.status = 400;
        return { error: result.error };
      }

      return { success: true };
    },
    {
      body: t.Object({
        currentPassword: t.String({ minLength: 1 }),
        newPassword: t.String({ minLength: 6 }),
      }),
    }
  )

  // Change username
  .put(
    "/username",
    async ({ body, headers, set }) => {
      const user = await getUser(headers.cookie);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const result = await auth.changeUsername(user.id, body.username);

      if (!result.success) {
        set.status = 400;
        return { error: result.error };
      }

      return { success: true, username: result.username };
    },
    {
      body: t.Object({
        username: t.String({ minLength: 3 }),
      }),
    }
  )

  // Get TOTP status
  .get("/totp/status", async ({ headers, set }) => {
    const user = await getUser(headers.cookie);
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const status = await auth.getTOTPStatus(user.id);
    return status;
  })

  // Setup TOTP (generate secret and QR)
  .post("/totp/setup", async ({ headers, set }) => {
    const user = await getUser(headers.cookie);
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const result = await auth.setupTOTP(user.id);

    if (!result.success) {
      set.status = 400;
      return { error: result.error };
    }

    return {
      success: true,
      secret: result.secret,
      qrUri: result.qrUri,
    };
  })

  // Verify TOTP and enable
  .post(
    "/totp/verify",
    async ({ body, headers, set }) => {
      const user = await getUser(headers.cookie);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const result = await auth.verifyAndEnableTOTP(user.id, body.code);

      if (!result.success) {
        set.status = 400;
        return { error: result.error };
      }

      return { success: true };
    },
    {
      body: t.Object({
        code: t.String({ minLength: 6, maxLength: 6 }),
      }),
    }
  )

  // Disable TOTP
  .delete(
    "/totp",
    async ({ body, headers, set }) => {
      const user = await getUser(headers.cookie);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const result = await auth.disableTOTP(user.id, body.password);

      if (!result.success) {
        set.status = 400;
        return { error: result.error };
      }

      return { success: true };
    },
    {
      body: t.Object({
        password: t.String({ minLength: 1 }),
      }),
    }
  );
