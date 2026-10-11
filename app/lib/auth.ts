import { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabaseAdmin";

export async function verifySupabaseUser(req: NextRequest): Promise<User | null> {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin().auth.getUser(token);
  return user;
}
