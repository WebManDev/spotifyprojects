import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, type SessionData } from "@/lib/session";
import crypto from "crypto";

export const runtime = "nodejs";

const SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

export async function GET() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "SPOTIFY_CLIENT_ID not set" },
      { status: 500 },
    );
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/auth/callback`;
  const state = crypto.randomBytes(16).toString("hex");

  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions,
  );
  (session as SessionData & { oauthState?: string }).oauthState = state;
  await session.save();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
  });

  return NextResponse.redirect(
    `https://accounts.spotify.com/authorize?${params.toString()}`,
  );
}
