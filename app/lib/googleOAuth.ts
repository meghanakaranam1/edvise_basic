import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

// drive.file: lets the Picker grant access to only the specific sheet a teacher selects.
// spreadsheets.readonly: lets the Sheets API actually read that sheet's values.
export const GOOGLE_SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — long enough for a consent screen, short enough to limit replay risk

function stateSecret(): string {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET;
  if (!secret) throw new Error("GOOGLE_OAUTH_STATE_SECRET is not set");
  return secret;
}

// Signs the teacher's user id into an opaque state token so the callback route
// (hit by a plain browser redirect from Google, with no auth header available)
// can trust which teacher this authorization belongs to.
export function signState(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, exp: Date.now() + STATE_TTL_MS })).toString("base64url");
  const sig = crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyState(state: string): string | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expectedSig = crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    const { userId, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof userId !== "string" || Date.now() > exp) return null;
    return userId;
  } catch {
    return null;
  }
}

export function buildGoogleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent", // forces a refresh_token back even on repeat authorizations
    scope: GOOGLE_SHEETS_SCOPES.join(" "),
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// Thrown when Google rejects a refresh token outright (revoked, expired — e.g. the
// 7-day refresh-token lifetime Google enforces while an OAuth app is in Testing mode).
// Distinct from other failures so callers can treat it as "needs to reconnect" rather
// than a generic error.
export class GoogleGrantInvalidError extends Error {}

async function postToken(body: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let code: string | undefined;
    try { code = JSON.parse(text).error; } catch { /* not JSON */ }
    if (code === "invalid_grant") throw new GoogleGrantInvalidError(text);
    throw new Error(`Google token endpoint error: ${text}`);
  }
  return res.json();
}

export function exchangeCodeForTokens(code: string, redirectUri: string) {
  return postToken({
    code,
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
}

function refreshAccessToken(refreshToken: string) {
  return postToken({
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    grant_type: "refresh_token",
  });
}

export async function storeRefreshToken(userId: string, refreshToken: string) {
  const { error } = await supabase.from("profiles").update({ google_refresh_token: refreshToken }).eq("id", userId);
  if (error) throw error;
}

// Returns a fresh access token for the teacher, or null if they haven't connected
// their Google account yet — including if a previously-stored refresh token was
// revoked or expired, in which case it's cleared so the teacher is prompted to
// reconnect instead of seeing a raw Google error.
export async function getValidGoogleAccessToken(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("profiles").select("google_refresh_token").eq("id", userId).single();
  if (error || !data?.google_refresh_token) return null;
  try {
    const { access_token } = await refreshAccessToken(data.google_refresh_token);
    return access_token;
  } catch (err) {
    if (err instanceof GoogleGrantInvalidError) {
      await supabase.from("profiles").update({ google_refresh_token: null }).eq("id", userId);
      return null;
    }
    throw err;
  }
}
