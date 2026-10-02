import { NextRequest, NextResponse } from "next/server";
import { verifySupabaseUser } from "../../../lib/auth";
import { getValidGoogleAccessToken, buildGoogleAuthUrl, signState } from "../../../lib/googleOAuth";

// Returns a short-lived Google OAuth access token for the Picker to use client-side.
// If the teacher hasn't connected their Google account yet, returns a consent URL
// to redirect them to instead of a token.
export async function POST(req: NextRequest) {
  const user = await verifySupabaseUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const token = await getValidGoogleAccessToken(user.id);
    if (token) return NextResponse.json({ token });

    const redirectUri = new URL("/api/google-sheets/callback", req.nextUrl.origin).toString();
    const authUrl = buildGoogleAuthUrl(redirectUri, signState(user.id));
    return NextResponse.json({ needsAuth: true, authUrl });
  } catch (err) {
    console.error("Google Sheets token error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
