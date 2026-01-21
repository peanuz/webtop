import { db, eq, and, schema } from "../db";

export const settingsService = {
  /**
   * Get all settings for a user
   */
  async getSettings(userId: number) {
    const userSettings = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.userId, userId));

    const settingsMap: Record<string, string> = {};
    userSettings.forEach((s) => {
      settingsMap[s.key] = s.value;
    });

    return settingsMap;
  },

  /**
   * Get a single setting
   */
  async getSetting(userId: number, key: string) {
    const [setting] = await db
      .select()
      .from(schema.settings)
      .where(and(eq(schema.settings.userId, userId), eq(schema.settings.key, key)))
      .limit(1);

    return setting ? setting.value : null;
  },

  /**
   * Set or update a single setting
   */
  async setSetting(userId: number, key: string, value: string) {
    const existing = await this.getSetting(userId, key);

    if (existing !== null) {
      await db
        .update(schema.settings)
        .set({ value, updatedAt: new Date() })
        .where(and(eq(schema.settings.userId, userId), eq(schema.settings.key, key)));
    } else {
      await db.insert(schema.settings).values({
        userId,
        key,
        value,
      });
    }
  },

  /**
   * Update multiple settings
   */
  async updateSettings(userId: number, newSettings: Record<string, any>) {
    for (const [key, value] of Object.entries(newSettings)) {
      // Ensure value is stringified if it's an object/boolean/number
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      await this.setSetting(userId, key, stringValue);
    }
    return this.getSettings(userId);
  }
};
