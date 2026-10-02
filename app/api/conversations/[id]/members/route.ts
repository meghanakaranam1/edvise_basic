import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySupabaseUser } from "../../../../lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

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
