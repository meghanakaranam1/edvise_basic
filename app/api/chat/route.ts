import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type SimpleMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  const { messages, fileId }: { messages: SimpleMessage[]; fileId?: string } = await req.json();

  // Inject container_upload into the first user message so Python code execution can access the file
  let apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  if (fileId) {
    const lastUserIdx = apiMessages.map((m) => m.role).lastIndexOf("user");
    if (lastUserIdx >= 0) {
      apiMessages[lastUserIdx] = {
        role: "user",
        content: [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { type: "container_upload", file_id: fileId } as any,
          { type: "text", text: messages[lastUserIdx].content },
        ],
      };
    }
  }

  const system = fileId
    ? "You are a helpful teaching assistant. The teacher uploaded a gradebook CSV. Use code execution to analyze it and answer questions with exact numbers."
    : "You are a helpful teaching assistant. Ask the teacher to upload a gradebook CSV to get started.";

  const stream = client.messages.stream(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      system,
      messages: apiMessages,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: fileId ? [{ type: "code_execution_20260120", name: "code_execution" } as any] : [],
    },
    fileId ? { headers: { "anthropic-beta": "files-api-2025-04-14" } } : {}
  );

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        console.error("Stream error:", err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
