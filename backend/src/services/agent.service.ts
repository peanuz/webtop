import { fsService } from "./fs.service";
import { config } from "../config";

interface AgentMessage {
  role: "user" | "assistant";
  content: string | any[];
}

interface AgentRequest {
  message: string;
  projectPath: string;
  model: string;
  history?: AgentMessage[];
}

// Tool Definitions
const TOOLS = [
  {
    name: "list_files",
    description: "List files in a directory. Use this to explore the file system.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to list files from (relative to project root)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "read_file",
    description: "Read the content of a file.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file to read (relative to project root)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file to write (relative to project root)",
        },
        content: {
          type: "string",
          description: "Content to write",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "run_command",
    description: "Run a shell command in the project directory.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Shell command to execute",
        },
      },
      required: ["command"],
    },
  },
];

export const agentService = {
  async chat(request: AgentRequest): Promise<ReadableStream> {
    const { message, projectPath, model } = request;
    const history = request.history || [];

    // System Prompt
    const systemPrompt = `You are Claude Code, an expert software engineer.
You are working in the directory: ${projectPath}.
You have access to the file system and shell.
Use tools to explore, read, write code, and execute commands.
Be concise and helpful.`;

    // Append user message
    const messages = [...history, { role: "user", content: message }];

    const encoder = new TextEncoder();

    return new ReadableStream({
      async start(controller) {
        try {
          let currentMessages = [...messages];
          let keepGoing = true;

          while (keepGoing) {
            keepGoing = false; // Default to stop unless tool use requires continuation

            // Call Anthropic API
            const response = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "x-api-key": Bun.env.ANTHROPIC_API_KEY || "",
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
              },
              body: JSON.stringify({
                model: model || "claude-3-5-sonnet-20241022",
                max_tokens: 4096,
                system: systemPrompt,
                messages: currentMessages,
                tools: TOOLS,
              }),
            });

            if (!response.ok) {
              const err = await response.json();
              throw new Error(err.error?.message || "API Error");
            }

            const data = await response.json();
            
            // Handle content
            for (const content of data.content) {
              if (content.type === "text") {
                controller.enqueue(encoder.encode(content.text));
              } else if (content.type === "tool_use") {
                keepGoing = true; // We need to loop back after tool execution
                
                controller.enqueue(encoder.encode(`\n[Tool Use: ${content.name}]\n`));

                let toolResult = "";
                try {
                  if (content.name === "list_files") {
                    const relPath = content.input.path || ".";
                    const fullPath = `${projectPath}/${relPath}`;
                    const files = await fsService.list(fullPath);
                    toolResult = JSON.stringify(files.map(f => f.name));
                  } else if (content.name === "read_file") {
                    const fullPath = `${projectPath}/${content.input.path}`;
                    toolResult = await fsService.read(fullPath);
                  } else if (content.name === "write_file") {
                    const fullPath = `${projectPath}/${content.input.path}`;
                    await fsService.write(fullPath, content.input.content);
                    toolResult = "File written successfully.";
                  } else if (content.name === "run_command") {
                    const proc = Bun.spawn(["sh", "-c", content.input.command], {
                      cwd: projectPath,
                      stderr: "pipe",
                    });
                    const text = await new Response(proc.stdout).text();
                    const err = await new Response(proc.stderr).text();
                    toolResult = text + err;
                  }
                } catch (e: any) {
                  toolResult = `Error: ${e.message}`;
                }

                // Add assistant tool_use message
                currentMessages.push({ role: "assistant", content: [content] });
                
                // Add tool_result message
                currentMessages.push({
                  role: "user",
                  content: [
                    {
                      type: "tool_result",
                      tool_use_id: content.id,
                      content: toolResult,
                    },
                  ],
                });
              }
            }
          }
          
          controller.close();
        } catch (e: any) {
          controller.enqueue(encoder.encode(`\nError: ${e.message}`));
          controller.close();
        }
      },
    });
  },
};
