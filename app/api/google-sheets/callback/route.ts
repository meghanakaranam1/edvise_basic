import { NextRequest, NextResponse } from "next/server";
import { verifyState, exchangeCodeForTokens, storeRefreshToken } from "../../../lib/googleOAuth";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const origin = req.nextUrl.origin;

  if (!code || !state) {
    return NextResponse.redirect(new URL("/?googleSheetsError=missing_code", origin));
  }

  const userId = verifyState(state);
  if (!userId) {
    return NextResponse.redirect(new URL("/?googleSheetsError=invalid_state", origin));
  }

  try {
    const redirectUri = new URL("/api/google-sheets/callback", origin).toString();
    const { refresh_token } = await exchangeCodeForTokens(code, redirectUri);
    if (!refresh_token) {
      // Shouldn't happen with prompt=consent, but fail loudly rather than silently
      // leaving the teacher "connected" with no way to actually get tokens later.
      return NextResponse.redirect(new URL("/?googleSheetsError=no_refresh_token", origin));
    }
    await storeRefreshToken(userId, refresh_token);
    return NextResponse.redirect(new URL("/?googleSheetsConnected=1", origin));
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return NextResponse.redirect(new URL("/?googleSheetsError=exchange_failed", origin));
  }
}
