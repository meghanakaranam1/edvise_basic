import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySupabaseUser } from "../../../../lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

// Inserts the creator's own "owner" row right after a conversation is
// created. Done server-side with the service-role key (bypassing RLS)
// instead of the old client-side insert through the user's own session,
// which intermittently 403'd with "new row violates row-level security
// policy for table conversation_members" — the client-side RLS policy check
// apparently doesn't reliably see the just-committed conversations row from
// the immediately preceding insert. Every downstream read of membership
// (e.g. the GET below) depends on this row existing, so that one failure
// cascaded into things like the members GET also 403ing.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifySupabaseUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: conversationId } = await params;

  const { data: conversation } = await supabase
    .from("conversations")
    .select("user_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation || conversation.user_id !== user.id) {
    return NextResponse.json({ error: "Not the owner of this conversation" }, { status: 403 });
  }

  const { error } = await supabase
    .from("conversation_members")
    .insert({ conversation_id: conversationId, user_id: user.id, role: "owner" });
  // 23505 = unique violation — the row already exists (e.g. a retry), which
  // is fine, not an error.
  if (error && error.code !== "23505") return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifySupabaseUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: conversationId } = await params;

  const { data: membership } = await supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Not a member of this conversation" }, { status: 403 });

  const { data: members, error } = await supabase
    .from("conversation_members")
    .select("user_id, role, added_at")
    .eq("conversation_id", conversationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const userIds = (members ?? []).map(m => m.user_id);
  const { data: profiles } = await supabase.from("profiles").select("id, name, email").in("id", userIds);
  const profileById = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));

  const result = (members ?? []).map(m => ({
    userId: m.user_id,
    role: m.role,
    name: profileById[m.user_id]?.name || profileById[m.user_id]?.email || "Teammate",
    email: profileById[m.user_id]?.email ?? "",
  }));

  return NextResponse.json({ members: result });
}
