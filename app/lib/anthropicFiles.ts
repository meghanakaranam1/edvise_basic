import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function uploadTextAsAnthropicFile(content: string, filename: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uploaded = await (client.beta.files as any).upload(
    { file: new File([bytes], filename, { type: "text/plain" }) },
    { headers: { "anthropic-beta": "files-api-2025-04-14" } }
  );
  return uploaded.id as string;
}
