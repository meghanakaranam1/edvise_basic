import { NextRequest, NextResponse } from "next/server";
import { uploadTextAsAnthropicFile } from "../../lib/anthropicFiles";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  try {
    const text = await file.text();
    const fileId = await uploadTextAsAnthropicFile(text, file.name);
    return NextResponse.json({ fileId });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
