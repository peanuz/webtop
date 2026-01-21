import type { Subprocess } from "bun";

export interface TerminalSession {
  id: string;
  process: Subprocess<"ignore", "ignore", "ignore">;
  terminal: ReturnType<typeof Bun.spawn>["terminal"];
  createdAt: Date;
  onData: ((data: string) => void) | null;
  onExit: ((exitCode: number) => void) | null;
}

class TerminalService {
  private sessions: Map<string, TerminalSession> = new Map();

  /**
   * Create a new terminal session with PTY support
   */
  create(
    sessionId: string,
    options: {
      cols?: number;
      rows?: number;
      cwd?: string;
      env?: Record<string, string>;
      onData?: (data: string) => void;
      onExit?: (exitCode: number) => void;
    } = {}
  ): TerminalSession {
    // Kill existing session if exists
    if (this.sessions.has(sessionId)) {
      this.kill(sessionId);
    }

    const { cols = 80, rows = 24, onData, onExit, cwd, env } = options;

    // Determine shell
    const shell = process.env.SHELL || "/bin/zsh";

    // Spawn shell process with PTY using Bun.Terminal
    const proc = Bun.spawn([shell, "-l"], {
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        HOME: process.env.HOME || "/root",
        PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
        LANG: process.env.LANG || "en_US.UTF-8",
        ...env, // Override with provided env
      },
      cwd: cwd || process.env.HOME || "/root",
      terminal: {
        cols,
        rows,
        data: (_term, data) => {
          const text = typeof data === "string" ? data : new TextDecoder().decode(data);
          const session = this.sessions.get(sessionId);
          if (session?.onData) {
            session.onData(text);
          }
        },
      },
    });

    const session: TerminalSession = {
      id: sessionId,
      process: proc,
      terminal: proc.terminal!,
      createdAt: new Date(),
      onData: onData || null,
      onExit: onExit || null,
    };

    this.sessions.set(sessionId, session);

    // Monitor process exit
    proc.exited.then((exitCode) => {
      const sess = this.sessions.get(sessionId);
      if (sess?.onExit) {
        sess.onExit(exitCode);
      }
      this.sessions.delete(sessionId);
    });

    return session;
  }

  /**
   * Get a terminal session
   */
  get(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Write input to terminal
   */
  write(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session?.terminal) return false;

    try {
      session.terminal.write(data);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resize terminal
   */
  resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session?.terminal) return false;

    try {
      session.terminal.resize(cols, rows);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Set data callback for a session
   */
  setOnData(sessionId: string, callback: (data: string) => void): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.onData = callback;
    return true;
  }

  /**
   * Set exit callback for a session
   */
  setOnExit(sessionId: string, callback: (exitCode: number) => void): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.onExit = callback;
    return true;
  }

  /**
   * Kill a terminal session
   */
  kill(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      if (session.terminal) {
        session.terminal.close();
      }
      session.process.kill();
      this.sessions.delete(sessionId);
      return true;
    } catch {
      this.sessions.delete(sessionId);
      return false;
    }
  }

  /**
   * List all active sessions
   */
  list(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Check if session exists and is alive
   */
  isAlive(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    return session.process.exitCode === null;
  }
}

export const terminalService = new TerminalService();
