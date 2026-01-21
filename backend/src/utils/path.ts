import { resolve, normalize, relative, join } from "path";
import { config } from "../config";

// Resolve the sandbox root (user files directory)
const SANDBOX_ROOT = resolve(config.userFilesDir);

// Blocked patterns for path validation
const BLOCKED_PATTERNS = [
  /\.\./, // Directory traversal
  /\x00/, // Null bytes
];

/**
 * Validate a user-provided path for dangerous patterns
 */
export function validatePath(userPath: string): boolean {
  return !BLOCKED_PATTERNS.some((p) => p.test(userPath));
}

/**
 * Sanitize and resolve a user path to an absolute path within the sandbox
 * Throws if path escapes sandbox or contains dangerous patterns
 */
export function sanitizePath(userPath: string): string {
  // Validate first
  if (!validatePath(userPath)) {
    throw new Error("Invalid path: contains blocked patterns");
  }

  // Remove leading slashes and normalize
  const cleanPath = userPath.replace(/^\/+/, "");

  // Resolve to absolute path within sandbox
  const resolved = resolve(SANDBOX_ROOT, normalize(cleanPath));

  // Ensure path is within sandbox
  const rel = relative(SANDBOX_ROOT, resolved);
  if (rel.startsWith("..") || resolve(SANDBOX_ROOT, rel) !== resolved) {
    throw new Error("Path traversal detected");
  }

  return resolved;
}

/**
 * Convert absolute path back to relative user path
 */
export function toUserPath(absolutePath: string): string {
  return relative(SANDBOX_ROOT, absolutePath);
}

/**
 * Get the sandbox root path
 */
export function getSandboxRoot(): string {
  return SANDBOX_ROOT;
}

/**
 * Check if a path is within the sandbox
 */
export function isInSandbox(absolutePath: string): boolean {
  const rel = relative(SANDBOX_ROOT, absolutePath);
  return !rel.startsWith("..") && !resolve(SANDBOX_ROOT, rel).startsWith("..");
}
