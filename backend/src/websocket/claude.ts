import { Elysia } from "elysia";
import { claudeService, type StreamMessage } from "../services/claude.service";
import { nanoid } from "nanoid";

interface ClaudeMessage {
  type: "message" | "abort" | "ping" | "approve";
  text?: string;           // The message/prompt to send
  path?: string;           // Project path (required for first message)
  resumeSessionId?: string; // Resume a previous Claude conversation
  model?: string;          // Model to use (optional)
  allowedTools?: string[]; // Tools to allow (optional)
  mode?: "normal" | "auto" | "plan"; // Mode for tool permissions
  approved?: boolean;      // For 'approve' message
  toolUseId?: string;      // For 'approve' message (optional)
}

interface WebSocketData {
  sessionId: string;
  projectPath: string | null;
  conversationId: string | null; // Claude's conversation ID for resuming
}

export const claudeWebSocket = new Elysia({ prefix: "/ws" }).ws("/claude", {
  open(ws) {
    console.log('[Claude WS] WebSocket connection opened');
    const data = ws.data as any as WebSocketData;
    data.sessionId = nanoid(10);
    data.projectPath = null;
    data.conversationId = null;
    ws.send(JSON.stringify({ type: "connected", sessionId: data.sessionId }));
  },

  async message(ws, message) {
    console.log('[Claude WS] Message received:', message);

    let msg: ClaudeMessage;
    try {
      msg = typeof message === 'string' ? JSON.parse(message) : message as ClaudeMessage;
    } catch (e) {
      console.error('[Claude WS] Failed to parse message:', e);
      ws.send(JSON.stringify({ type: "error", content: "Invalid message format" }));
      return;
    }

    const wsData = ws.data as any as WebSocketData;

    switch (msg.type) {
      case "message": {
        if (!msg.text) {
          ws.send(JSON.stringify({ type: "error", content: "No message text provided" }));
          return;
        }

        // Set project path on first message or if changed
        if (msg.path) {
          wsData.projectPath = msg.path;
        }

        if (!wsData.projectPath) {
          ws.send(JSON.stringify({ type: "error", content: "No project path set" }));
          return;
        }

        // Use provided resume ID or our stored conversation ID
        const resumeId = msg.resumeSessionId || wsData.conversationId;

        console.log(`[Claude WS] Sending message to Claude at ${wsData.projectPath}`);
        if (resumeId) console.log(`[Claude WS] Resuming conversation: ${resumeId}`);

        // Signal that we're starting
        ws.send(JSON.stringify({ type: "start" }));

        try {
          await claudeService.stream(
            wsData.sessionId,
            wsData.projectPath,
            msg.text,
            {
              resumeSessionId: resumeId || undefined,
              model: msg.model,
              allowedTools: msg.allowedTools,
              mode: msg.mode,
              onMessage: (streamMsg: StreamMessage) => {
                try {
                  // Forward message to frontend
                  ws.send(JSON.stringify(streamMsg));

                  // Store conversation ID for future messages
                  if (streamMsg.sessionId) {
                    wsData.conversationId = streamMsg.sessionId;
                  }
                } catch (e) {
                  console.error('[Claude WS] Failed to send message:', e);
                }
              },
              onExit: (exitCode: number) => {
                console.log(`[Claude WS] Claude exited with code: ${exitCode}`);
                try {
                  ws.send(JSON.stringify({
                    type: "exit",
                    exitCode,
                    conversationId: wsData.conversationId
                  }));
                } catch {}
              },
            }
          );
        } catch (e) {
          console.error('[Claude WS] Stream error:', e);
          ws.send(JSON.stringify({ type: "error", content: String(e) }));
        }
        break;
      }

      case "approve": {
        console.log(`[Claude WS] Approval received: ${msg.approved}`);
        // Send 'y' or 'n' to the process stdin
        const input = msg.approved ? "y\n" : "n\n";
        claudeService.writeInput(wsData.sessionId, input);
        break;
      }

      case "abort": {
        console.log(`[Claude WS] Aborting session ${wsData.sessionId}`);
        claudeService.kill(wsData.sessionId);
        ws.send(JSON.stringify({ type: "aborted" }));
        break;
      }

      case "ping": {
        ws.send(JSON.stringify({ type: "pong" }));
        break;
      }

      default: {
        console.log(`[Claude WS] Unknown message type:`, msg.type);
      }
    }
  },

  close(ws) {
    console.log('[Claude WS] WebSocket connection closed');
    const wsData = ws.data as any as WebSocketData;
    claudeService.kill(wsData.sessionId);
  },
});
