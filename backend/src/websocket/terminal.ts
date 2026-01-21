import { Elysia, t } from "elysia";
import { terminalService } from "../services/terminal.service";
import { sanitizePath, getSandboxRoot } from "../utils/path";
import { nanoid } from "nanoid";

interface TerminalMessage {
  type: "open" | "input" | "resize" | "close" | "ping";
  sessionId?: string;
  data?: string;
  cols?: number;
  rows?: number;
  path?: string;
}

interface WebSocketData {
  terminalId: string | null;
}

export const terminalWebSocket = new Elysia({ prefix: "/ws" }).ws("/terminal", {
  body: t.Object({
    type: t.String(),
    sessionId: t.Optional(t.String()),
    data: t.Optional(t.String()),
    cols: t.Optional(t.Number()),
    rows: t.Optional(t.Number()),
    path: t.Optional(t.String()),
  }),

  open(ws) {
    // Initialize WebSocket data
    (ws.data as any).terminalId = null;

    ws.send(
      JSON.stringify({
        type: "connected",
        message: "WebSocket connected. Send 'open' to start terminal.",
      })
    );
  },

  async message(ws, message) {
    const msg = message as TerminalMessage;
    const wsData = ws.data as any as WebSocketData;

    switch (msg.type) {
      case "open": {
        // Create new terminal session with PTY
        const terminalId = msg.sessionId || nanoid(10);
        const cols = msg.cols || 80;
        const rows = msg.rows || 24;
        
        const sandboxRoot = getSandboxRoot();
        
        // Resolve working directory - default to sandbox root
        let cwd: string;
        try {
          if (msg.path) {
            cwd = sanitizePath(msg.path);
          } else {
            cwd = sandboxRoot;
          }
        } catch (e) {
          // Fallback to sandbox root if path is invalid
          cwd = sandboxRoot;
        }

        terminalService.create(terminalId, {
          cols,
          rows,
          cwd,
          env: {
            HOME: sandboxRoot,
            ZDOTDIR: process.env.HOME || "/home/webtop", // Use original HOME for config
            USER: process.env.USER || "webtop",
          },
          onData: (data) => {
            // Send terminal output to WebSocket
            try {
              ws.send(
                JSON.stringify({
                  type: "output",
                  data,
                })
              );
            } catch {
              // WebSocket might be closed
            }
          },
          onExit: (exitCode) => {
            try {
              ws.send(
                JSON.stringify({
                  type: "exit",
                  exitCode,
                })
              );
            } catch {
              // WebSocket might be closed
            }
          },
        });

        wsData.terminalId = terminalId;

        ws.send(
          JSON.stringify({
            type: "opened",
            sessionId: terminalId,
          })
        );

        break;
      }

      case "input": {
        if (!wsData.terminalId || !msg.data) break;

        const success = terminalService.write(wsData.terminalId, msg.data);
        if (!success) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Failed to write to terminal",
            })
          );
        }
        break;
      }

      case "resize": {
        if (!wsData.terminalId) break;

        const cols = msg.cols || 80;
        const rows = msg.rows || 24;

        const success = terminalService.resize(wsData.terminalId, cols, rows);

        ws.send(
          JSON.stringify({
            type: "resized",
            cols,
            rows,
            success,
          })
        );
        break;
      }

      case "close": {
        if (wsData.terminalId) {
          terminalService.kill(wsData.terminalId);
          ws.send(
            JSON.stringify({
              type: "closed",
              sessionId: wsData.terminalId,
            })
          );
          wsData.terminalId = null;
        }
        break;
      }

      case "ping": {
        ws.send(JSON.stringify({ type: "pong" }));
        break;
      }

      default: {
        ws.send(
          JSON.stringify({
            type: "error",
            message: `Unknown message type: ${msg.type}`,
          })
        );
      }
    }
  },

  close(ws) {
    const wsData = ws.data as any as WebSocketData;

    // Clean up terminal session on disconnect
    if (wsData.terminalId) {
      terminalService.kill(wsData.terminalId);
    }
  },
});
