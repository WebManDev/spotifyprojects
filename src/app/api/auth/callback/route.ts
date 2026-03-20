import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, type SessionData } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/?auth_error=${encodeURIComponent(error)}`, req.url),
    );
  }

  if (!code) {
    return NextResponse.redirect(new URL("/?auth_error=no_code", req.url));
  }

  const session = await getIronSession<
    SessionData & { oauthState?: string }
  >(await cookies(), sessionOptions);

  if (state && session.oauthState && state !== session.oauthState) {
    return NextResponse.redirect(
      new URL("/?auth_error=state_mismatch", req.url),
    );
  }
  delete session.oauthState;

  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
  const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/auth/callback`;

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "");
    console.error("[auth/callback] token exchange failed:", text);
    return NextResponse.redirect(
      new URL("/?auth_error=token_exchange_failed", req.url),
    );
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  session.accessToken = tokens.access_token;
  session.refreshToken = tokens.refresh_token;
  session.expiresAt = Date.now() + tokens.expires_in * 1000;

  const meRes = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (meRes.ok) {
    const me = (await meRes.json()) as {
      id: string;
      display_name?: string | null;
    };
    session.userId = me.id;
    session.displayName = me.display_name ?? me.id;
  }

  await session.save();
  return NextResponse.redirect(new URL("/", req.url));
}
