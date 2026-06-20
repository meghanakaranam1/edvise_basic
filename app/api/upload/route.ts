import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  try {
    const bytes = await file.arrayBuffer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uploaded = await (client.beta.files as any).upload(
      { file: new File([bytes], file.name, { type: "text/plain" }) },
      { headers: { "anthropic-beta": "files-api-2025-04-14" } }
    );
    return NextResponse.json({ fileId: uploaded.id });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
