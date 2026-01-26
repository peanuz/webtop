import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq, and } from "drizzle-orm";
import * as schema from "./schema";
import { config } from "../config";
import { fsService } from "../services/fs.service";

// Ensure data directory exists
await Bun.write(`${config.dataDir}/.gitkeep`, "");

const sqlite = new Database(`${config.dataDir}/webtop.db`);

// Enable WAL mode for better concurrency
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

export const db = drizzle(sqlite, { schema });

// Initialize database with schema
export async function initDatabase() {
  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      totp_secret TEXT,
      totp_enabled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Migration: Add TOTP columns if missing (for existing databases)
  try {
    const columns = sqlite.query("PRAGMA table_info(users)").all() as { name: string }[];
    const columnNames = columns.map(c => c.name);

    if (!columnNames.includes("totp_secret")) {
      sqlite.exec("ALTER TABLE users ADD COLUMN totp_secret TEXT");
    }
    if (!columnNames.includes("totp_enabled")) {
      sqlite.exec("ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0");
    }
  } catch (e) {
    // Columns already exist or table is new
  }

  // Ensure user-files directory exists
  await Bun.write(`${config.userFilesDir}/.gitkeep`, "");

  // Initialize default directories
  await fsService.initDefaultDirectories();

  // Check if any user exists, if not create default admin from config
  const existingUsers = await db.select().from(schema.users).limit(1);
  if (existingUsers.length === 0) {
    if (config.adminUsername && config.adminPassword) {
      console.log("No users found. Creating initial admin user from environment variables...");
      const passwordHash = await Bun.password.hash(config.adminPassword, {
        algorithm: "argon2id",
      });

      await db.insert(schema.users).values({
        username: config.adminUsername,
        passwordHash,
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`Admin user '${config.adminUsername}' created successfully.`);
    } else {
      console.log("No users found. Waiting for initial admin setup via UI.");
    }
  }

  console.log("Database initialized");
}

export { eq, and, schema };
