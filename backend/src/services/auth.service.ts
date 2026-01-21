import { nanoid } from "nanoid";
import { db, eq, schema } from "../db";
import * as OTPAuth from "otpauth";

// In-memory session cache for fast lookups
const sessionCache = new Map<string, { userId: number; expiresAt: Date }>();

export const auth = {
  /**
   * Create a new user (only if no user exists)
   */
  async createUser(username: string, password: string) {
    const existing = await db.select().from(schema.users).limit(1);
    if (existing.length > 0) {
      return { success: false, error: "User already exists" };
    }

    const passwordHash = await Bun.password.hash(password, {
      algorithm: "argon2id",
    });

    const [user] = await db
      .insert(schema.users)
      .values({ username, passwordHash, role: "admin" })
      .returning();

    return { success: true, user: { id: user.id, username: user.username, role: user.role } };
  },

  /**
   * Login and create session
   */
  async login(username: string, password: string) {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, username))
      .limit(1);

    if (!user) {
      return { success: false, error: "Invalid credentials" };
    }

    const valid = await Bun.password.verify(password, user.passwordHash);
    if (!valid) {
      return { success: false, error: "Invalid credentials" };
    }

    // Create session
    const sessionId = nanoid(32);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.insert(schema.sessions).values({
      id: sessionId,
      userId: user.id,
      expiresAt,
    });

    // Cache session
    sessionCache.set(sessionId, { userId: user.id, expiresAt });

    return {
      success: true,
      sessionId,
      user: { id: user.id, username: user.username, role: user.role },
    };
  },

  /**
   * Validate session and return user
   */
  async validateSession(sessionId: string) {
    if (!sessionId) return null;

    // Check cache first
    const cached = sessionCache.get(sessionId);
    if (cached) {
      if (cached.expiresAt < new Date()) {
        sessionCache.delete(sessionId);
        await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
        return null;
      }

      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, cached.userId))
        .limit(1);

      if (!user) return null;
      return { id: user.id, username: user.username, role: user.role };
    }

    // Check database
    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .limit(1);

    if (!session) return null;

    if (session.expiresAt < new Date()) {
      await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
      return null;
    }

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, session.userId))
      .limit(1);

    if (!user) return null;

    // Cache for next time
    sessionCache.set(sessionId, { userId: user.id, expiresAt: session.expiresAt });

    return { id: user.id, username: user.username, role: user.role };
  },

  /**
   * Logout - remove session
   */
  async logout(sessionId: string) {
    if (!sessionId) return;
    sessionCache.delete(sessionId);
    await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
  },

  /**
   * Check if any user exists
   */
  async hasUser() {
    const users = await db.select().from(schema.users).limit(1);
    return users.length > 0;
  },

  /**
   * Parse session ID from cookie header
   */
  parseSessionCookie(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;
    const match = cookieHeader.match(/session=([^;]+)/);
    return match ? match[1] : null;
  },

  /**
   * Create Set-Cookie header value
   */
  createCookieHeader(sessionId: string): string {
    return `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`;
  },

  /**
   * Create cookie removal header
   */
  createCookieRemovalHeader(): string {
    return "session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
  },

  /**
   * Change password for a user
   */
  async changePassword(userId: number, currentPassword: string, newPassword: string) {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) {
      return { success: false, error: "User not found" };
    }

    const valid = await Bun.password.verify(currentPassword, user.passwordHash);
    if (!valid) {
      return { success: false, error: "Current password is incorrect" };
    }

    const newHash = await Bun.password.hash(newPassword, { algorithm: "argon2id" });
    await db
      .update(schema.users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));

    return { success: true };
  },

  /**
   * Change username for a user
   */
  async changeUsername(userId: number, newUsername: string) {
    // Check if username is already taken
    const [existing] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, newUsername))
      .limit(1);

    if (existing && existing.id !== userId) {
      return { success: false, error: "Username already taken" };
    }

    await db
      .update(schema.users)
      .set({ username: newUsername, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));

    return { success: true, username: newUsername };
  },

  /**
   * Setup TOTP - generates secret and returns QR code URI
   */
  async setupTOTP(userId: number) {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) {
      return { success: false, error: "User not found" };
    }

    // Generate new TOTP secret
    const totp = new OTPAuth.TOTP({
      issuer: "WebTop",
      label: user.username,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: new OTPAuth.Secret({ size: 20 }),
    });

    // Store secret temporarily (not enabled yet)
    await db
      .update(schema.users)
      .set({ totpSecret: totp.secret.base32, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));

    return {
      success: true,
      secret: totp.secret.base32,
      qrUri: totp.toString(),
    };
  },

  /**
   * Verify TOTP code and enable if valid
   */
  async verifyAndEnableTOTP(userId: number, code: string) {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user || !user.totpSecret) {
      return { success: false, error: "TOTP not set up" };
    }

    const totp = new OTPAuth.TOTP({
      issuer: "WebTop",
      label: user.username,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.totpSecret),
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) {
      return { success: false, error: "Invalid code" };
    }

    // Enable TOTP
    await db
      .update(schema.users)
      .set({ totpEnabled: true, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));

    return { success: true };
  },

  /**
   * Verify TOTP code (for login)
   */
  verifyTOTPCode(secret: string, code: string, username: string): boolean {
    const totp = new OTPAuth.TOTP({
      issuer: "WebTop",
      label: username,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });

    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
  },

  /**
   * Disable TOTP for a user
   */
  async disableTOTP(userId: number, password: string) {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) {
      return { success: false, error: "User not found" };
    }

    // Require password confirmation
    const valid = await Bun.password.verify(password, user.passwordHash);
    if (!valid) {
      return { success: false, error: "Password is incorrect" };
    }

    await db
      .update(schema.users)
      .set({ totpEnabled: false, totpSecret: null, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));

    return { success: true };
  },

  /**
   * Check if user has TOTP enabled
   */
  async hasTOTPEnabled(username: string) {
    const [user] = await db
      .select({ totpEnabled: schema.users.totpEnabled })
      .from(schema.users)
      .where(eq(schema.users.username, username))
      .limit(1);

    return user?.totpEnabled ?? false;
  },

  /**
   * Login with TOTP verification
   */
  async loginWithTOTP(username: string, password: string, totpCode: string) {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, username))
      .limit(1);

    if (!user) {
      return { success: false, error: "Invalid credentials" };
    }

    const valid = await Bun.password.verify(password, user.passwordHash);
    if (!valid) {
      return { success: false, error: "Invalid credentials" };
    }

    // Verify TOTP if enabled
    if (user.totpEnabled && user.totpSecret) {
      const totpValid = this.verifyTOTPCode(user.totpSecret, totpCode, user.username);
      if (!totpValid) {
        return { success: false, error: "Invalid 2FA code" };
      }
    }

    // Create session
    const sessionId = nanoid(32);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(schema.sessions).values({
      id: sessionId,
      userId: user.id,
      expiresAt,
    });

    sessionCache.set(sessionId, { userId: user.id, expiresAt });

    return {
      success: true,
      sessionId,
      user: { id: user.id, username: user.username, role: user.role },
    };
  },

  /**
   * Get user's TOTP status
   */
  async getTOTPStatus(userId: number) {
    const [user] = await db
      .select({ totpEnabled: schema.users.totpEnabled })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    return { enabled: user?.totpEnabled ?? false };
  },
};
