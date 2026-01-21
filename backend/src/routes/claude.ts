import { Elysia, t } from "elysia";
import { requireAuth, getUser } from "../middleware/auth.middleware";
import { settingsService } from "../services/settings.service";
import { claudeService } from "../services/claude.service";
import { readdir, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { sanitizePath } from "../utils/path";

// Convert project path to Claude's directory format
// Uses the absolute sandbox path since Claude stores sessions by absolute cwd
// /Users/user/Documents/.../Desktop/lol → -Users-user-Documents-...-Desktop-lol
function projectToClaudePath(projectPath: string): string {
  // Convert relative project path to absolute sandbox path
  const absolutePath = sanitizePath(projectPath);
  // Convert to Claude's format: replace / with - (keeps leading -)
  return absolutePath.replace(/\//g, '-');
}

// Extract displayable content from a Claude message
function extractContent(message: any): string {
  if (!message) return '';

  // Handle string content directly
  if (typeof message.content === 'string') {
    return message.content;
  }

  // Handle array content (tool calls, text blocks, etc.)
  if (Array.isArray(message.content)) {
    return message.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text || '')
      .join('\n');
  }

  // Fallback for plain message
  if (typeof message === 'string') {
    return message;
  }

  return '';
}

interface SessionIndexEntry {
  sessionId: string;
  projectPath?: string;
  firstPrompt?: string;
  messageCount?: number;
  created?: string;
  modified?: string;
  gitBranch?: string;
}

interface SessionIndex {
  version: number;
  entries: SessionIndexEntry[];
}

export const claudeRoutes = new Elysia({ prefix: "/claude" })
  .use(requireAuth)
  
  // Execute Claude Headless
  .post("/exec", async ({ headers, body, set }) => {
    const user = await getUser(headers.cookie);
    if (!user) return { error: "User not found" };

    const { message, projectPath, model } = body as { message: string, projectPath: string, model?: string };
    
    if (!message || !projectPath) {
      set.status = 400;
      return { error: "Message and projectPath are required" };
    }

    try {
      const absPath = sanitizePath(projectPath);
      const output = await claudeService.execute(absPath, message, model);
      return { response: output };
    } catch (e: any) {
      set.status = 500;
      return { error: e.message };
    }
  })

  // Get all projects
  .get("/projects", async ({ headers }) => {
    const user = await getUser(headers.cookie);
    if (!user) return { error: "User not found" };

    const projectsStr = await settingsService.getSetting(user.id, "claude_projects");
    return projectsStr ? JSON.parse(projectsStr) : [];
  })

  // Add a project
  .post("/projects", async ({ headers, body, set }) => {
    const user = await getUser(headers.cookie);
    if (!user) return { error: "User not found" };

    const { path } = body as { path: string };
    if (!path) {
      set.status = 400;
      return { error: "Path is required" };
    }

    try {
      // Resolve path within sandbox
      const absPath = sanitizePath(path);
      
      const s = await stat(absPath);
      if (!s.isDirectory()) {
        set.status = 400;
        return { error: "Path is not a directory" };
      }

      const projectsStr = await settingsService.getSetting(user.id, "claude_projects");
      const projects: string[] = projectsStr ? JSON.parse(projectsStr) : [];

      if (!projects.includes(path)) {
        projects.push(path);
        await settingsService.setSetting(user.id, "claude_projects", JSON.stringify(projects));
      }

      return projects;
    } catch (e) {
      set.status = 400;
      return { error: "Path validation failed" };
    }
  })

  // Remove a project
  .delete("/projects", async ({ headers, body, set }) => {
    const user = await getUser(headers.cookie);
    if (!user) return { error: "User not found" };

    const { path } = body as { path: string };
    if (!path) {
      set.status = 400;
      return { error: "Path is required" };
    }

    const projectsStr = await settingsService.getSetting(user.id, "claude_projects");
    let projects: string[] = projectsStr ? JSON.parse(projectsStr) : [];

    projects = projects.filter(p => p !== path);
    await settingsService.setSetting(user.id, "claude_projects", JSON.stringify(projects));

    return projects;
  })

  // List chats in a project (legacy - scans project .claude folder)
  .get("/chats", async ({ query, set }) => {
    const path = query.path;
    if (!path) {
      set.status = 400;
      return { error: "Path is required" };
    }

    try {
      const absPath = sanitizePath(path);
      const claudeDir = join(absPath, ".claude");

      // Check if .claude exists
      try {
        await stat(claudeDir);
      } catch {
        return [];
      }

      const files = await readdir(claudeDir);
      // Filter for JSON files that look like chats
      const chats = await Promise.all(files
        .filter(f => f.endsWith(".json") && f !== "config.json" && f !== "mcp.json")
        .map(async f => {
          const fullPath = join(claudeDir, f);
          const stats = await stat(fullPath);
          return {
            id: f.replace(".json", ""),
            name: f.replace(".json", ""),
            updatedAt: stats.mtime
          };
        })
      );

      return chats.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    } catch (e) {
      return [];
    }
  })

  // Get sessions from Claude's sessions-index.json
  .get("/sessions", async ({ query, set }) => {
    const projectPath = query.project;
    if (!projectPath) {
      set.status = 400;
      return { error: "Project path is required" };
    }

    try {
      const claudeProjectDir = join(
        homedir(),
        '.claude',
        'projects',
        projectToClaudePath(projectPath)
      );
      const indexPath = join(claudeProjectDir, 'sessions-index.json');

      // Check if sessions-index.json exists
      try {
        await stat(indexPath);
      } catch {
        return []; // No sessions yet
      }

      const indexContent = await readFile(indexPath, 'utf-8');
      const index: SessionIndex = JSON.parse(indexContent);

      // Map entries to a cleaner format
      return (index.entries || []).map(entry => ({
        id: entry.sessionId,
        preview: entry.firstPrompt?.slice(0, 100),
        messageCount: entry.messageCount || 0,
        created: entry.created,
        modified: entry.modified,
        gitBranch: entry.gitBranch
      })).sort((a, b) => {
        // Sort by modified date, newest first
        const dateA = a.modified ? new Date(a.modified).getTime() : 0;
        const dateB = b.modified ? new Date(b.modified).getTime() : 0;
        return dateB - dateA;
      });
    } catch (e: any) {
      console.error('Failed to load sessions:', e);
      return [];
    }
  })

  // Get session transcript (JSONL) for a specific session
  .get("/session/:id", async ({ params, query, set }) => {
    const { id } = params;
    const projectPath = query.project;

    if (!projectPath) {
      set.status = 400;
      return { error: "Project path is required" };
    }

    try {
      const claudeProjectDir = join(
        homedir(),
        '.claude',
        'projects',
        projectToClaudePath(projectPath)
      );
      const sessionPath = join(claudeProjectDir, `${id}.jsonl`);

      // Check if session file exists
      try {
        await stat(sessionPath);
      } catch {
        set.status = 404;
        return { error: "Session not found" };
      }

      const content = await readFile(sessionPath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      const messages: any[] = [];

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);

          // Filter for user and assistant messages
          if (entry.type === 'user' || entry.type === 'assistant') {
            messages.push({
              role: entry.type === 'user' ? 'user' : 'assistant',
              content: extractContent(entry.message),
              timestamp: entry.timestamp,
              uuid: entry.uuid
            });
          }
        } catch {
          // Skip malformed lines
        }
      }

      return messages;
    } catch (e: any) {
      console.error('Failed to load session:', e);
      set.status = 500;
      return { error: e.message };
    }
  })

  // Get available models
  .get("/models", () => {
    return [
      { id: "claude-3-5-sonnet-20241022", name: "Sonnet 3.5 (New) · Best for coding" },
      { id: "claude-3-5-sonnet-20240620", name: "Sonnet 3.5 (Old) · Reliable" },
      { id: "claude-3-opus-20240229", name: "Opus 3 · Most capable" },
      { id: "claude-3-haiku-20240307", name: "Haiku 3 · Fastest" }
    ];
  });