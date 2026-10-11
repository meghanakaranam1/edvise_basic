import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  csv: "text/csv",
  txt: "text/plain",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  try {
    // Binary-safe — file.text() (the previous approach) UTF-8-decodes the
    // raw bytes, which silently corrupts anything that isn't actually text
    // (a PDF, most critically). Reading as bytes works correctly for text
    // files too, so there's no reason to special-case by type here.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const mimeType = MIME_BY_EXT[ext] ?? 'application/octet-stream'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uploaded = await (anthropic.beta.files as any).upload(
      { file: new File([bytes], file.name, { type: mimeType }) },
      { headers: { "anthropic-beta": "files-api-2025-04-14" } }
    );
    const fileId = uploaded.id as string;

    // Anthropic's Files API does not serve back the original bytes for
    // this account (every upload comes back `downloadable: false`,
    // confirmed independent of file age/type) — so a copy is kept in
    // Supabase Storage, keyed by the same fileId, purely so the file can
    // actually be downloaded again later (see /api/files/download).
    // Awaited (not fire-and-forget) — a serverless function can be frozen
    // the instant it returns a response, which would silently drop an
    // un-awaited background write.
    const { error: storageError } = await supabaseAdmin().storage
      .from('documents')
      .upload(`conversations/${fileId}`, bytes, { contentType: mimeType, upsert: true })
    if (storageError) console.error('Storage copy failed (non-fatal — Claude still has the file):', storageError.message)

    return NextResponse.json({ fileId });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
