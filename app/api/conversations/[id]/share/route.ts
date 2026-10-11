import { NextRequest, NextResponse } from "next/server";
import { verifySupabaseUser } from "../../../../lib/auth";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifySupabaseUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: conversationId } = await params;
  const { emails }: { emails?: string[] } = await req.json();
  if (!emails?.length) return NextResponse.json({ error: "emails is required" }, { status: 400 });

  const { data: convo, error: convoErr } = await supabaseAdmin()
    .from("conversations")
    .select("id, user_id")
    .eq("id", conversationId)
    .single();
  if (convoErr || !convo) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  if (convo.user_id !== user.id) return NextResponse.json({ error: "Only the owner can share this conversation" }, { status: 403 });

  const normalizedEmails = emails.map(e => e.trim().toLowerCase()).filter(Boolean);
  const { data: profiles } = await supabaseAdmin()
    .from("profiles")
    .select("id, email")
    .in("email", normalizedEmails);

  const foundEmails = new Set((profiles ?? []).map(p => (p.email ?? "").toLowerCase()));
  const notFound = normalizedEmails.filter(e => !foundEmails.has(e));

  if (profiles?.length) {
    const rows = profiles.map(p => ({ conversation_id: conversationId, user_id: p.id, role: "member" }));
    const { error: insertErr } = await supabaseAdmin().from("conversation_members").upsert(rows, { onConflict: "conversation_id,user_id" });
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await supabaseAdmin().from("conversations").update({ is_shared: true }).eq("id", conversationId);

  return NextResponse.json({ added: [...foundEmails], notFound });
}
