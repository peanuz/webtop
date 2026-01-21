import { readdir, stat, mkdir, rm, rename, cp } from "fs/promises";
import { extname, basename, dirname } from "path";
import { sanitizePath, toUserPath, getSandboxRoot } from "../utils/path";

// MIME types mapping
const MIME_TYPES: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".ts": "application/typescript",
  ".json": "application/json",
  ".xml": "application/xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  mimeType: string;
  modifiedAt: Date;
  createdAt: Date;
}

class FileSystemService {
  /**
   * Get MIME type from filename
   */
  getMimeType(filename: string): string {
    const ext = extname(filename).toLowerCase();
    return MIME_TYPES[ext] || "application/octet-stream";
  }

  /**
   * List directory contents
   */
  async list(userPath: string = ""): Promise<FileInfo[]> {
    const absPath = sanitizePath(userPath);

    try {
      const names = await readdir(absPath);

      // Execute stat calls in parallel for better performance
      const results = await Promise.all(
        names
          .filter((name) => !name.startsWith(".")) // Skip hidden files
          .map(async (name) => {
            try {
              const fullPath = `${absPath}/${name}`;
              const stats = await stat(fullPath);

              return {
                name,
                path: toUserPath(fullPath),
                isDirectory: stats.isDirectory(),
                size: stats.size,
                mimeType: stats.isDirectory()
                  ? "inode/directory"
                  : this.getMimeType(name),
                modifiedAt: stats.mtime,
                createdAt: stats.birthtime,
              };
            } catch {
              return null;
            }
          })
      );

      // Filter out nulls (failed stats)
      const entries = results.filter((e): e is FileInfo => e !== null);

      // Sort: directories first, then alphabetically
      entries.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      return entries;
    } catch (err: any) {
      if (err.code === "ENOENT") {
        throw new Error("Directory not found");
      }
      if (err.code === "ENOTDIR") {
        throw new Error("Not a directory");
      }
      throw err;
    }
  }

  /**
   * Read file contents as text
   */
  async read(userPath: string): Promise<string> {
    const absPath = sanitizePath(userPath);
    const file = Bun.file(absPath);

    if (!(await file.exists())) {
      throw new Error("File not found");
    }

    const stats = await stat(absPath);
    if (stats.isDirectory()) {
      throw new Error("Cannot read directory as file");
    }

    return file.text();
  }

  /**
   * Read file as binary (for download)
   */
  async readBinary(userPath: string): Promise<Bun.BunFile> {
    const absPath = sanitizePath(userPath);
    const file = Bun.file(absPath);

    if (!(await file.exists())) {
      throw new Error("File not found");
    }

    return file;
  }

  /**
   * Write file contents
   */
  async write(userPath: string, content: string | Uint8Array): Promise<void> {
    const absPath = sanitizePath(userPath);

    // Ensure parent directory exists
    const parentDir = dirname(absPath);
    await mkdir(parentDir, { recursive: true });

    await Bun.write(absPath, content);
  }

  /**
   * Create directory
   */
  async mkdir(userPath: string): Promise<void> {
    const absPath = sanitizePath(userPath);
    await mkdir(absPath, { recursive: true });
  }

  /**
   * Delete file or directory
   */
  async delete(userPath: string): Promise<void> {
    const absPath = sanitizePath(userPath);

    const file = Bun.file(absPath);
    if (!(await file.exists())) {
      // Check if it's a directory
      try {
        await stat(absPath);
      } catch {
        throw new Error("File or directory not found");
      }
    }

    await rm(absPath, { recursive: true });
  }

  /**
   * Move/rename file or directory
   */
  async move(sourcePath: string, destPath: string): Promise<void> {
    const absSrc = sanitizePath(sourcePath);
    const absDest = sanitizePath(destPath);

    try {
      await stat(absSrc);
    } catch {
      throw new Error("Source not found");
    }

    // Ensure parent directory of destination exists
    const parentDir = dirname(absDest);
    await mkdir(parentDir, { recursive: true });

    await rename(absSrc, absDest);
  }

  /**
   * Copy file or directory
   */
  async copy(sourcePath: string, destPath: string): Promise<void> {
    const absSrc = sanitizePath(sourcePath);
    const absDest = sanitizePath(destPath);

    try {
      await stat(absSrc);
    } catch {
      throw new Error("Source not found");
    }

    // Ensure parent directory of destination exists
    const parentDir = dirname(absDest);
    await mkdir(parentDir, { recursive: true });

    await cp(absSrc, absDest, { recursive: true });
  }

  /**
   * Get file/directory info
   */
  async info(userPath: string): Promise<FileInfo> {
    const absPath = sanitizePath(userPath);

    try {
      const stats = await stat(absPath);
      const name = basename(absPath);

      return {
        name,
        path: toUserPath(absPath),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        mimeType: stats.isDirectory()
          ? "inode/directory"
          : this.getMimeType(name),
        modifiedAt: stats.mtime,
        createdAt: stats.birthtime,
      };
    } catch {
      throw new Error("File or directory not found");
    }
  }

  /**
   * Check if file/directory exists
   */
  async exists(userPath: string): Promise<boolean> {
    try {
      const absPath = sanitizePath(userPath);
      await stat(absPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Move file/directory to Trash with conflict handling
   * Returns the final name in Trash (may differ if conflict existed)
   */
  async moveToTrash(userPath: string): Promise<string> {
    const name = basename(userPath);
    let destName = name;
    let counter = 1;

    // Check for name conflicts and generate unique name
    while (await this.exists(`Trash/${destName}`)) {
      const ext = extname(name);
      const base = ext ? basename(name, ext) : name;
      destName = `${base}_${counter}${ext}`;
      counter++;
    }

    await this.move(userPath, `Trash/${destName}`);
    return destName;
  }

  /**
   * Initialize default directories
   */
  async initDefaultDirectories(): Promise<void> {
    const defaults = ["Desktop", "Documents", "Downloads", "Pictures", "Trash"];
    const root = getSandboxRoot();

    for (const dir of defaults) {
      try {
        await mkdir(`${root}/${dir}`, { recursive: true });
      } catch {
        // Ignore errors
      }
    }
  }
}

export const fsService = new FileSystemService();
